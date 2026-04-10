/**
 * GitHub Contents API から記事を逆方向にインポート。
 *
 * shunature-one のような外部リポジトリをマスターとして扱い、
 * AirPubre の IndexedDB に流し込む（多端末同期の代替）。
 */

import { parseHeadlessMarkdown } from './headlessFrontmatter.js'
import { saveDraft, getDrafts } from './storage.js'

const RAW_BASE = 'https://raw.githubusercontent.com'

function ghHeaders(token) {
  const h = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

/**
 * 指定ディレクトリの .md ファイル一覧を再帰的に取得
 * @returns {Promise<Array<{ path: string }>>}
 */
async function listMarkdownFiles({ owner, repo, branch, dir, token }) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dir}?ref=${branch}`
  const res = await fetch(url, { headers: ghHeaders(token) })
  if (!res.ok) {
    if (res.status === 404) return []
    throw new Error(`GitHub API: ${res.status} ${res.statusText}`)
  }
  const entries = await res.json()
  if (!Array.isArray(entries)) return []

  const out = []
  for (const e of entries) {
    if (e.type === 'file' && e.name.endsWith('.md')) {
      out.push({ path: e.path })
    } else if (e.type === 'dir') {
      const sub = await listMarkdownFiles({ owner, repo, branch, dir: e.path, token })
      out.push(...sub)
    }
  }
  return out
}

/**
 * 1ファイルの raw 内容を取得
 */
/**
 * 1ファイルの raw 内容を取得
 */
async function fetchRaw({ owner, repo, branch, path, token }) {
  // ✅ GitHub API を使う (CORS エラーなし)
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.raw', // ← これで raw content が取れる
      ...(token && { 'Authorization': `Bearer ${token}` }),
      'X-GitHub-Api-Version': '2022-11-28',
    }
  })
  if (!res.ok) throw new Error(`raw fetch failed: ${path} (${res.status})`)
  return res.text()
}

/**
 * GitHub から記事をインポートして IndexedDB にマージ。
 *
 * @param {Object} opts
 * @param {string} opts.owner
 * @param {string} opts.repo
 * @param {string} [opts.branch="main"]
 * @param {string} [opts.postsDir="blog/posts"]
 * @param {string} [opts.thumbnailsDir="blog/thumbnails"]
 * @param {string} [opts.token] - private repo の場合は必須
 * @param {(p:{done:number,total:number,name:string}) => void} [opts.onProgress]
 * @param {boolean} [opts.force=false] - true: ローカル未デプロイ変更を無視して上書き
 * @param {string[]} [opts.onlySlugs] - 指定した場合、この slug 群のみ処理する
 * @returns {Promise<{ imported: number, skipped: number, total: number, skippedSlugs: string[] }>}
 */
export async function importFromGitHub(opts) {
  const {
    owner,
    repo,
    branch = 'main',
    postsDir = 'blog/posts',
    thumbnailsDir = 'blog/thumbnails',
    token,
    onProgress,
    force = false,
    onlySlugs = null,
  } = opts

  if (!owner || !repo) throw new Error('owner / repo を指定してください')

  const files = await listMarkdownFiles({ owner, repo, branch, dir: postsDir, token })
  if (files.length === 0) {
    return { imported: 0, skipped: 0, total: 0, skippedSlugs: [] }
  }

  // 既存 draft（slug キーで突き合わせ）
  const existing = await getDrafts()
  const bySlug = new Map(existing.map(d => [d.slug, d]))

  let imported = 0
  let skipped = 0
  const skippedSlugs = []

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    onProgress?.({ done: i, total: files.length, name: f.path })

    const raw = await fetchRaw({ owner, repo, branch, path: f.path, token })
    const parsed = parseHeadlessMarkdown(raw)

    // postsDir を取り除いた相対パスを slug にする（拡張子も外す）
    const relPath = f.path.startsWith(postsDir + '/')
      ? f.path.slice(postsDir.length + 1)
      : f.path
    const slug = relPath.replace(/\.md$/, '')

    // onlySlugs 指定時はそれ以外をスキップ
    if (onlySlugs && !onlySlugs.includes(slug)) continue

    const local = bySlug.get(slug)

    // ローカルが新しければスキップ（＝ローカル未デプロイの編集を保護）
    // force=true のときは保護を無効化（競合解決で「リモート採用」など）
    const remoteDate = parsed.date ? new Date(parsed.date).toISOString() : null
    const localUntracked = local && local.updatedAt && (
      !local.lastDeployedAt || local.updatedAt > local.lastDeployedAt
    )
    if (!force && localUntracked) {
      skipped++
      skippedSlugs.push(slug)
      continue
    }

    // サムネは raw URL で参照（ファイル取得しないので軽い）
    let thumbnail = null
    if (parsed.thumbnail) {
      // deploy-server.sh は .jpg/.png を .webp に変換するので、frontmatter 上の名前を .webp に正規化
      const webpName = parsed.thumbnail.replace(/\.(jpe?g|png)$/i, '.webp')
      thumbnail = `${RAW_BASE}/${owner}/${repo}/${branch}/${thumbnailsDir}/${webpName}`
    }

    const draft = {
      id: local?.id, // 既存があれば上書き、なければ新規
      slug,
      title: parsed.title || slug,
      body: parsed.body || '',
      tags: parsed.tags || [],
      thumbnail,
      thumbnailCredit: parsed.thumbnailCredit || '',
      thumbnailCreditUrl: parsed.thumbnailCreditUrl || '',
      summary: parsed.summary || '',
      status: 'published',
      publishedAt: remoteDate,
      lastDeployedAt: remoteDate, // インポート直後は「変更なし」扱い
      createdAt: local?.createdAt,
    }
    await saveDraft(draft)
    imported++
  }

  onProgress?.({ done: files.length, total: files.length, name: '' })
  return { imported, skipped, total: files.length, skippedSlugs }
}
