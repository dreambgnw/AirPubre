/**
 * AirPubre ストレージ（IndexedDB）
 * idb ライブラリを使用
 */

import { openDB } from 'idb'

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
// 認証情報
// ============================================================

export async function saveAuthInfo({ masterKeyHash, subKeyHash }) {
  const db = await getDB()
  await db.put('setup', masterKeyHash, 'masterKeyHash')
  await db.put('setup', subKeyHash, 'subKeyHash')
}

export async function getAuthInfo() {
  const db = await getDB()
  const [masterKeyHash, subKeyHash] = await Promise.all([
    db.get('setup', 'masterKeyHash'),
    db.get('setup', 'subKeyHash'),
  ])
  return { masterKeyHash, subKeyHash }
}

// ============================================================
// 下書き
// ============================================================

export async function saveDraft(draft) {
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

export async function getDrafts() {
  const db = await getDB()
  const all = await db.getAll('drafts')
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getDraft(id) {
  const db = await getDB()
  return db.get('drafts', id)
}

export async function deleteDraft(id) {
  const db = await getDB()
  return db.delete('drafts', id)
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

  // SEO / OGP デフォルト
  defaultOgImage:  '',
  twitterHandle:   '',
  googleAnalyticsId: '',

  // エディター設定
  defaultEditor:   'markdown', // 'markdown' | 'richtext'

  // デプロイ設定（セットアップウィザードで設定済みのものを引き継ぐ）
  deployTarget:    '', // 'github' | 'vercel' | 'zip' | 'rsync' | 'headless-github'
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
  rsyncHost:       '',
  rsyncPath:       '',
  rsyncUser:       '',

  // デバイス間同期
  syncPassphrase:  '', // 暗号化パスフレーズ（設定済みなら自動でデプロイに含める）

  // サイトテーマ
  background: 'wordpress', // 'wordpress' | 'obsidian' | 'word' | 'markdown'
}

export async function getSiteConfig() {
  const db = await getDB()
  const stored = await db.get('settings', 'siteConfig')
  return { ...DEFAULT_SITE_CONFIG, ...(stored ?? {}) }
}

export async function saveSiteConfig(config) {
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
 * リモートの記事をローカルにマージ（updatedAt が新しい方を優先）
 * @param {Array} remoteDrafts
 * @returns {number} インポートした件数
 */
export async function importDrafts(remoteDrafts) {
  const db = await getDB()
  const existing = await db.getAll('drafts')
  const map = new Map(existing.map(d => [d.id, d]))

  let count = 0
  for (const remote of remoteDrafts) {
    const local = map.get(remote.id)
    if (!local || (remote.updatedAt ?? '') > (local.updatedAt ?? '')) {
      await db.put('drafts', remote)
      count++
    }
  }
  return count
}
