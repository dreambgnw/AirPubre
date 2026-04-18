/**
 * AirPubre ストレージ
 *
 * バックエンドは2種類：
 *   1. File System（推奨）: ユーザーが選択したフォルダ内の .airpubre/ に保存。
 *      iCloud Drive / Dropbox などの同期フォルダを選ぶとデバイス間で自動同期。
 *   2. IndexedDB（フォールバック）: フォルダ未選択 or FS 非対応ブラウザ。
 *
 * 関数シグネチャは同じ。呼び出し側のコードを変更する必要なし。
 */

import { openDB } from 'idb'
import { hasFSAccess, readFile, writeFile, deleteFile, listFiles } from './fs.js'

const DB_NAME = 'airpubre'
const DB_VERSION = 3  // v3: pendingDeletions store を追加（headless 削除伝播用）

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // セットアップ情報
      if (!db.objectStoreNames.contains('setup')) {
        db.createObjectStore('setup')
      }
      // 下書き記事
      if (!db.objectStoreNames.contains('drafts')) {
        const store = db.createObjectStore('drafts', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      // 設定
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings')
      }
      // meta タグテンプレート（v2 で追加）
      if (!db.objectStoreNames.contains('metaTemplates')) {
        db.createObjectStore('metaTemplates', { keyPath: 'id' })
      }
      // 削除待ち（v3 で追加：headless モードで削除された記事を次回 push で反映させるためのキュー）
      if (!db.objectStoreNames.contains('pendingDeletions')) {
        db.createObjectStore('pendingDeletions', { keyPath: 'slug' })
      }
    }
  })
}

// ============================================================
// セットアップ状態
// ============================================================

export async function getSetupState() {
  const db = await getDB()
  return db.get('setup', 'state')
}

export async function saveSetupState(state) {
  const db = await getDB()
  return db.put('setup', state, 'state')
}

// ============================================================
// 認証情報（FS / IndexedDB 自動切替）
// ============================================================

export async function saveAuthInfo({ masterKeyHash, subKeyHash }) {
  if (await hasFSAccess()) {
    await writeFile('auth.json', JSON.stringify({ masterKeyHash, subKeyHash }, null, 2))
    return
  }
  const db = await getDB()
  await db.put('setup', masterKeyHash, 'masterKeyHash')
  await db.put('setup', subKeyHash, 'subKeyHash')
}

export async function getAuthInfo() {
  if (await hasFSAccess()) {
    const text = await readFile('auth.json')
    if (text) {
      try { return JSON.parse(text) } catch {}
    }
    return { masterKeyHash: undefined, subKeyHash: undefined }
  }
  const db = await getDB()
  const [masterKeyHash, subKeyHash] = await Promise.all([
    db.get('setup', 'masterKeyHash'),
    db.get('setup', 'subKeyHash'),
  ])
  return { masterKeyHash, subKeyHash }
}

// ============================================================
// パスキー
// ============================================================

export async function savePasskeyCredentials(credentials) {
  const db = await getDB()
  await db.put('setup', credentials, 'passkeys')
}

export async function getPasskeyCredentials() {
  const db = await getDB()
  return (await db.get('setup', 'passkeys')) ?? []
}

export async function addPasskeyCredential(credential) {
  const existing = await getPasskeyCredentials()
  existing.push({ ...credential, createdAt: new Date().toISOString() })
  await savePasskeyCredentials(existing)
}

export async function removePasskeyCredential(credentialId) {
  const existing = await getPasskeyCredentials()
  await savePasskeyCredentials(existing.filter(c => c.credentialId !== credentialId))
}

// ============================================================
// 下書き（FS / IndexedDB 自動切替）
// ============================================================

// ── FS バックエンド ──────────────────────────────────────────

async function saveDraftFS(draft) {
  const now = new Date().toISOString()
  const record = {
    ...draft,
    id: draft.id ?? crypto.randomUUID(),
    updatedAt: now,
    createdAt: draft.createdAt ?? now,
  }
  await writeFile(`drafts/${record.id}.json`, JSON.stringify(record, null, 2))
  return record
}

async function getDraftsFS() {
  const files = await listFiles('drafts')
  const drafts = []
  for (const name of files) {
    if (!name.endsWith('.json')) continue
    const text = await readFile(`drafts/${name}`)
    if (text) {
      try { drafts.push(JSON.parse(text)) } catch {}
    }
  }
  return drafts.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

async function getDraftFS(id) {
  const text = await readFile(`drafts/${id}.json`)
  if (!text) return undefined
  try { return JSON.parse(text) } catch { return undefined }
}

async function deleteDraftFS(id) {
  await deleteFile(`drafts/${id}.json`)
}

// ── IndexedDB バックエンド ────────────────────────────────────

async function saveDraftIDB(draft) {
  const db = await getDB()
  const now = new Date().toISOString()
  const record = {
    ...draft,
    id: draft.id ?? crypto.randomUUID(),
    updatedAt: now,
    createdAt: draft.createdAt ?? now,
  }
  await db.put('drafts', record)
  return record
}

async function getDraftsIDB() {
  const db = await getDB()
  const all = await db.getAll('drafts')
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

async function getDraftIDB(id) {
  const db = await getDB()
  return db.get('drafts', id)
}

async function deleteDraftIDB(id) {
  const db = await getDB()
  return db.delete('drafts', id)
}

// ── 公開 API ─────────────────────────────────────────────────

export async function saveDraft(draft) {
  if (await hasFSAccess()) return saveDraftFS(draft)
  return saveDraftIDB(draft)
}

export async function getDrafts() {
  if (await hasFSAccess()) return getDraftsFS()
  return getDraftsIDB()
}

export async function getDraft(id) {
  if (await hasFSAccess()) return getDraftFS(id)
  return getDraftIDB(id)
}

export async function deleteDraft(id) {
  if (await hasFSAccess()) return deleteDraftFS(id)
  return deleteDraftIDB(id)
}

// ============================================================
// 削除待ちキュー（headless モードの削除伝播用）
// ============================================================

/**
 * 削除された draft の slug とサムネイルファイル名をキューに追加する。
 * 次回の deployHeadless で GitHub tree から対応パスを除去するのに使う。
 * @param {{ slug: string, thumbnailFilename?: string|null }} entry
 */
export async function addPendingDeletion({ slug, thumbnailFilename = null }) {
  if (!slug) return
  const db = await getDB()
  await db.put('pendingDeletions', {
    slug,
    thumbnailFilename,
    deletedAt: new Date().toISOString(),
  })
}

export async function getPendingDeletions() {
  const db = await getDB()
  return db.getAll('pendingDeletions')
}

export async function clearPendingDeletions(slugs = null) {
  const db = await getDB()
  const tx = db.transaction('pendingDeletions', 'readwrite')
  if (slugs === null) {
    await tx.store.clear()
  } else {
    for (const s of slugs) await tx.store.delete(s)
  }
  await tx.done
}

// ============================================================
// 設定（汎用 key-value）
// ============================================================

export async function getSetting(key) {
  const db = await getDB()
  return db.get('settings', key)
}

export async function setSetting(key, value) {
  const db = await getDB()
  return db.put('settings', value, key)
}

// ============================================================
// サイト設定（まとめて取得・保存）
// ============================================================

/** デフォルト値 */
export const DEFAULT_SITE_CONFIG = {
  // サイト情報
  siteTitle:       '',
  siteDescription: '',
  baseUrl:         '/',
  language:        'ja',

  // 著者情報
  authorName:      '',
  authorBio:       '',
  authorBioMarkdown: '',
  authorAvatarUrl: '',
  authorTwitter:   '',
  authorMastodon:  '',
  authorGitHub:    '',
  authorWebsite:   '',
  authorPageUrl:   '', // 著者ページへのリンク URL（空欄なら /author/ を使う）

  // SEO / OGP デフォルト
  defaultOgImage:  '',
  twitterHandle:   '',
  googleAnalyticsId: '',

  // エディター設定
  defaultEditor:   'markdown', // 'markdown' | 'richtext'

  // デプロイ設定（セットアップウィザードで設定済みのものを引き継ぐ）
  deployTarget:    '', // 'github' | 'vercel' | 'zip' | 'headless-github'
  githubToken:     '',
  githubRepo:      '',
  githubBranch:    'gh-pages',
  // headless-github モード用：リポジトリ内の .md / 画像配置パス
  headlessPostsDir:      'blog/posts',
  headlessThumbnailsDir: 'blog/thumbnails',
  // 起動時に GitHub から自動 pull（多端末同期用、オプトイン）
  headlessAutoPullOnStart: false,
  // GitHub 上の任意ファイル（now.json など）を AirPubre から直接編集するためのリスト
  // 形式: [{ path: 'now.json', label: '今やってること' }, ...]
  headlessRepoFiles: [],
  vercelToken:        '',
  vercelProjectId:    '',
  vercelFromGitHub:   false, // true = GitHub Push → Vercel 自動デプロイ

  // サムネイル形式（headless インポート時にファイル名を変換する拡張子）
  // 'webp' | 'png' | 'jpg' | 'original'（変換しない）
  headlessThumbnailFormat: 'webp',

  // デバイス間同期
  syncPassphrase:  '', // 暗号化パスフレーズ（設定済みなら自動でデプロイに含める）

  // サイトテーマ
  background: 'wordpress', // 'wordpress' | 'obsidian' | 'word' | 'markdown'
}

export async function getSiteConfig() {
  if (await hasFSAccess()) {
    const text = await readFile('config.json')
    if (text) {
      try { return { ...DEFAULT_SITE_CONFIG, ...JSON.parse(text) } } catch {}
    }
    return { ...DEFAULT_SITE_CONFIG }
  }
  const db = await getDB()
  const stored = await db.get('settings', 'siteConfig')
  return { ...DEFAULT_SITE_CONFIG, ...(stored ?? {}) }
}

export async function saveSiteConfig(config) {
  if (await hasFSAccess()) {
    await writeFile('config.json', JSON.stringify(config, null, 2))
    return
  }
  const db = await getDB()
  await db.put('settings', config, 'siteConfig')
}

// ============================================================
// meta タグテンプレート
// ============================================================

/**
 * テンプレート型:
 *   { id: string, name: string, tags: Array<{name: string, content: string}>, createdAt: string }
 */

/** 組み込みのデフォルトテンプレート（初回のみ提案として表示する） */
export const BUILTIN_META_TEMPLATES = [
  {
    id: 'builtin-fediverse',
    name: 'Fediverse 作者情報',
    builtin: true,
    tags: [
      { name: 'fediverse:creator', content: '' },
    ],
  },
  {
    id: 'builtin-seo-basic',
    name: 'SEO 基本セット',
    builtin: true,
    tags: [
      { name: 'robots',      content: 'index, follow' },
      { name: 'theme-color', content: '#0ea5e9' },
    ],
  },
  {
    id: 'builtin-noindex',
    name: 'インデックス除外',
    builtin: true,
    tags: [
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  },
  {
    id: 'builtin-article',
    name: '記事メタ（著者 + copyright）',
    builtin: true,
    tags: [
      { name: 'author',    content: '' },
      { name: 'copyright', content: '' },
    ],
  },
]

export async function getMetaTemplates() {
  const db = await getDB()
  const custom = await db.getAll('metaTemplates')
  // 組み込み + カスタムをまとめて返す
  return [...BUILTIN_META_TEMPLATES, ...custom.sort((a, b) => a.createdAt?.localeCompare(b.createdAt ?? '') ?? 0)]
}

export async function saveMetaTemplate(template) {
  const db = await getDB()
  const record = {
    ...template,
    id: template.id ?? crypto.randomUUID(),
    createdAt: template.createdAt ?? new Date().toISOString(),
  }
  await db.put('metaTemplates', record)
  return record
}

export async function deleteMetaTemplate(id) {
  const db = await getDB()
  await db.delete('metaTemplates', id)
}

// ============================================================
// デバイス間同期（パスキー情報）
// ============================================================

export async function getSyncCredential() {
  const db = await getDB()
  return db.get('setup', 'syncCredential') ?? null
}

export async function saveSyncCredential(cred) {
  const db = await getDB()
  return db.put('setup', cred, 'syncCredential')
}

/**
 * ローカルの重複下書きを自動削除する。
 *
 * slug が同じ記事が複数ある場合、updatedAt が最も新しいものだけを残して他を削除する。
 * slug なし記事（タイトルのみの下書きなど）は対象外。
 *
 * @returns {number} 削除した件数
 */
export async function deduplicateDrafts() {
  const drafts = await getDrafts()
  /** @type {Map<string, Array>} */
  const bySlug = new Map()
  for (const d of drafts) {
    if (!d.slug) continue
    if (!bySlug.has(d.slug)) bySlug.set(d.slug, [])
    bySlug.get(d.slug).push(d)
  }

  let deleted = 0
  for (const group of bySlug.values()) {
    if (group.length <= 1) continue
    // updatedAt 降順にソート → 先頭（最新）以外を削除
    group.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    for (const dup of group.slice(1)) {
      await deleteDraft(dup.id)
      deleted++
    }
  }
  return deleted
}

/**
 * リモートの記事をローカルにマージ（updatedAt が新しい方を優先）
 *
 * 重複解消ルール:
 *   1. id が同じ → updatedAt が新しい方で上書き
 *   2. id が違うが slug が同じ → updatedAt が新しい方を残し、古い方の id を削除
 *   3. まったく新しい → そのまま追加
 *
 * @param {Array} remoteDrafts
 * @returns {number} インポートした件数
 */
export async function importDrafts(remoteDrafts) {
  const existing = await getDrafts()
  const idMap   = new Map(existing.map(d => [d.id, d]))
  const slugMap = new Map(existing.filter(d => d.slug).map(d => [d.slug, d]))

  let count = 0
  for (const remote of remoteDrafts) {
    const localById   = idMap.get(remote.id)
    const localBySlug = remote.slug ? slugMap.get(remote.slug) : null

    // slug が同じ別 ID のローカル記事がある（重複）
    if (localBySlug && localBySlug.id !== remote.id) {
      if ((remote.updatedAt ?? '') >= (localBySlug.updatedAt ?? '')) {
        // リモートの方が新しい → ローカルの古い方を削除してリモートで置き換え
        await deleteDraft(localBySlug.id)
        await saveDraft({ ...remote, updatedAt: remote.updatedAt }) // updatedAt を保持
        count++
      }
      // ローカルの方が新しい場合は何もしない
      continue
    }

    // id 一致 or まったく新しい記事
    if (!localById || (remote.updatedAt ?? '') > (localById.updatedAt ?? '')) {
      await saveDraft({ ...remote, updatedAt: remote.updatedAt })
      count++
    }
  }
  return count
}
