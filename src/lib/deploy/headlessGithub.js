/**
 * Headless GitHub デプロイアダプター
 *
 * AirPubre の draft を「shunature-one 形式」のリポジトリに push する。
 * 静的 HTML は出力しない（記事の .md とサムネイル画像のみ）。
 * リポジトリ側で別途ビルダー（deploy-server.sh）が posts.json / sitemap.xml /
 * OGP HTML / rsync 転送 などを行う前提。
 */

import { deployToGitHub } from './github.js'
import { serializeHeadlessMarkdown } from '../headlessFrontmatter.js'
import { getPendingDeletions, clearPendingDeletions } from '../storage.js'

/**
 * data URL（base64）→ { bytes, ext }
 * @param {string} dataUrl
 */
function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  const mime = m[1]
  const b64 = m[2]
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ext =
    mime === 'image/webp' ? 'webp' :
    mime === 'image/png'  ? 'png' :
    mime === 'image/jpeg' ? 'jpg' :
    mime === 'image/gif'  ? 'gif' :
    'bin'
  return { bytes, ext, mime }
}

/** slug 中の '/' を保持しつつ末尾セグメントだけを取り出す */
function lastSegment(slug) {
  const parts = slug.split('/')
  return parts[parts.length - 1] || slug
}

/**
 * draft 配列 → ファイル Map（パス → string|Uint8Array）
 * @param {Array} drafts
 * @param {Object} opts
 * @param {string} opts.postsDir       例: "blog/posts"
 * @param {string} opts.thumbnailsDir  例: "blog/thumbnails"
 */
export function buildHeadlessFiles(drafts, opts) {
  const postsDir = (opts.postsDir || 'blog/posts').replace(/\/+$/, '')
  const thumbDir = (opts.thumbnailsDir || 'blog/thumbnails').replace(/\/+$/, '')
  const files = new Map()

  for (const draft of drafts) {
    if (!draft.slug) continue

    // サムネイル：data URL のときだけ画像ファイルを生成。
    // 既にリモート URL（http(s):) の場合はファイル名だけ抽出して frontmatter に書く（再アップロードしない）。
    let thumbnailFilename = null
    if (draft.thumbnail) {
      if (draft.thumbnail.startsWith('data:')) {
        const decoded = decodeDataUrl(draft.thumbnail)
        if (decoded) {
          // shunature-one ではサムネを slug ベースで管理（衝突回避のため最終セグメントを使う）
          const baseName = lastSegment(draft.slug).replace(/[^\w\-]/g, '_')
          thumbnailFilename = `${baseName}.${decoded.ext}`
          files.set(`${thumbDir}/${thumbnailFilename}`, decoded.bytes)
        }
      } else if (/^https?:\/\//.test(draft.thumbnail)) {
        // raw.githubusercontent.com からインポートした場合など → ファイル名だけ取り出す
        thumbnailFilename = draft.thumbnail.split('/').pop()
      } else {
        // 既にファイル名のみ
        thumbnailFilename = draft.thumbnail
      }
    }

    const md = serializeHeadlessMarkdown(draft, { thumbnailFilename })
    files.set(`${postsDir}/${draft.slug}.md`, md)
  }

  return files
}

/**
 * AirPubre の draft 配列を shunature-one リポジトリに push する。
 *
 * @param {Array}  drafts
 * @param {Object} config - siteConfig をそのまま渡せばよい
 * @returns {Promise<{ commitSha: string, fileCount: number }>}
 */
export async function deployHeadless(drafts, config) {
  const [owner, repo] = (config.githubRepo ?? '').split('/')
  if (!owner || !repo) throw new Error('GitHub リポジトリ名が未設定です（owner/repo 形式）')
  if (!config.githubToken) throw new Error('GitHub Token が未設定です')

  const postsDir = (config.headlessPostsDir || 'blog/posts').replace(/\/+$/, '')
  const thumbDir = (config.headlessThumbnailsDir || 'blog/thumbnails').replace(/\/+$/, '')

  const files = buildHeadlessFiles(drafts, {
    postsDir,
    thumbnailsDir: thumbDir,
  })

  // 削除待ちキューからパス一覧を組み立てる
  const pending = await getPendingDeletions()
  const deletions = []
  for (const pd of pending) {
    deletions.push(`${postsDir}/${pd.slug}.md`)
    if (pd.thumbnailFilename) deletions.push(`${thumbDir}/${pd.thumbnailFilename}`)
  }

  if (files.size === 0 && deletions.length === 0) {
    throw new Error('出力対象の記事も削除もありません')
  }

  const msgParts = []
  if (drafts.length > 0)  msgParts.push(`${drafts.length} 件更新`)
  if (pending.length > 0) msgParts.push(`${pending.length} 件削除`)

  const result = await deployToGitHub(files, {
    token: config.githubToken,
    owner,
    repo,
    branch: config.githubBranch || 'main',
    message: `post: AirPubre から ${msgParts.join(' + ')}`,
    safePush: true, // 外部ビルダー（deploy-server.sh）の auto-commit と競合検知＋リトライ
    deletions,
  })

  // push 成功 → 削除キューをクリア
  if (pending.length > 0) {
    await clearPendingDeletions(pending.map(p => p.slug))
  }

  return {
    ...result,
    fileCount: files.size,
    deletedCount: deletions.length,
  }
}
