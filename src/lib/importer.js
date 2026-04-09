/**
 * AirPubre インポーター
 * MD / ZIP / XML（WordPress WXR）の過去記事を取り込む
 */

import { unzipSync, strFromU8 } from 'fflate'
import { imageToWebP, shouldConvertToWebP } from './imageUtils.js'

// ============================================================
// フロントマター（YAML）パーサー（依存ゼロ・軽量実装）
// ============================================================

/**
 * Markdownのフロントマターを解析する
 * @param {string} raw - Markdownの生文字列
 * @returns {{ frontmatter: Object, body: string }}
 */
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: raw }

  const fm = {}
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const val = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '')
    if (!key) continue
    // 配列形式 [a, b] または - a の簡易対応
    if (val.startsWith('[')) {
      try { fm[key] = JSON.parse(val.replace(/'/g, '"')) } catch { fm[key] = val }
    } else {
      fm[key] = val
    }
  }
  return { frontmatter: fm, body: match[2] }
}

// ============================================================
// 画像ファイル判定
// ============================================================

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.avif'])

function isImage(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return IMAGE_EXTS.has(ext)
}

function ext(filename) {
  return filename.slice(filename.lastIndexOf('.')).toLowerCase()
}

// ============================================================
// MD 単体ファイルをインポート
// ============================================================

/**
 * @param {string} filename
 * @param {string} content
 * @returns {ImportedPost}
 */
export function importMarkdownFile(filename, content) {
  const { frontmatter: fm, body } = parseFrontmatter(content)
  return {
    title: fm.title ?? fm.name ?? filename.replace(/\.mdx?$/, ''),
    body,
    tags: normalizeTags(fm.tags ?? fm.categories ?? []),
    slug: fm.slug ?? slugify(fm.title ?? filename.replace(/\.mdx?$/, '')),
    thumbnail: fm.thumbnail ?? fm.image ?? fm.cover ?? fm.cover_image ?? null,
    publishedAt: fm.date ?? fm.published ?? fm.publishedAt ?? null,
    author: fm.author ?? null,
    summary: fm.description ?? fm.summary ?? fm.excerpt ?? '',
    media: {},  // ZIPインポート時に別途セット
  }
}

// ============================================================
// ZIP ファイルをインポート
// ============================================================

/**
 * ZIPを展開してMDと画像を取り込む
 * @param {Uint8Array} zipBytes
 * @returns {Promise<ImportedPost[]>}
 */
export async function importZipFile(zipBytes) {
  const files = unzipSync(zipBytes)
  const posts = []
  const mediaMap = {} // path → base64 data URL（または object URL）

  // ── 画像を先に収集・WebP変換（非同期、並列処理）────────────────
  const conversionTasks = []

  for (const [path, bytes] of Object.entries(files)) {
    if (!isImage(path)) continue

    if (shouldConvertToWebP(path)) {
      // JPG / PNG / WebP / AVIF → WebP base64 に変換
      const mime = ext(path) === '.png' ? 'image/png'
        : ext(path) === '.webp' ? 'image/webp'
        : ext(path) === '.avif' ? 'image/avif'
        : 'image/jpeg'
      const blob = new Blob([bytes], { type: mime })
      conversionTasks.push(
        imageToWebP(blob)
          .then(base64 => { mediaMap[path] = base64 })
          .catch(() => {
            // 変換失敗時は object URL にフォールバック
            mediaMap[path] = URL.createObjectURL(blob)
          })
      )
    } else {
      // SVG / GIF はそのまま object URL（変換しない）
      const mime = ext(path) === '.svg' ? 'image/svg+xml' : 'image/gif'
      mediaMap[path] = URL.createObjectURL(new Blob([bytes], { type: mime }))
    }
  }

  // 全変換を待ってから MD 処理へ
  await Promise.all(conversionTasks)

  // ── MD ファイルを処理 ─────────────────────────────────────────
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.endsWith('.md') && !path.endsWith('.mdx')) continue
    if (path.startsWith('__MACOSX/')) continue

    const content = strFromU8(bytes)
    const post = importMarkdownFile(path.split('/').pop(), content)

    // サムネイル画像の解決（base64 data URL を thumbnail に直接セット）
    if (post.thumbnail) {
      const resolved = resolveMediaPath(post.thumbnail, path, mediaMap)
      if (resolved) {
        post.media[post.thumbnail] = resolved
        post.thumbnail = resolved  // base64 または object URL
      }
    }

    // 記事内の画像参照を解決（変換済みなので同期で置換可能）
    post.body = post.body.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, src) => {
        if (src.startsWith('http') || src.startsWith('data:')) return match
        const resolved = resolveMediaPath(src, path, mediaMap)
        if (resolved) {
          post.media[src] = resolved
          return `![${alt}](${resolved})`
        }
        return match
      }
    )

    posts.push(post)
  }

  return posts
}

function resolveMediaPath(target, mdPath, mediaMap) {
  // 相対パスを絶対パスに解決
  const dir = mdPath.includes('/') ? mdPath.slice(0, mdPath.lastIndexOf('/') + 1) : ''
  const candidates = [
    target,
    dir + target,
    target.replace(/^\.\//, dir),
  ]
  for (const c of candidates) {
    if (mediaMap[c]) return mediaMap[c]
    // パス正規化（../ など）
    const normalized = c.replace(/[^/]+\/\.\.\//g, '')
    if (mediaMap[normalized]) return mediaMap[normalized]
  }
  return null
}

// ============================================================
// XML（WordPress WXR）インポート
// ============================================================

/**
 * WordPress書き出しXMLをパースする
 * @param {string} xmlString
 * @returns {ImportedPost[]}
 */
export function importWordPressXML(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')

  if (doc.querySelector('parsererror')) {
    throw new Error('XMLの解析に失敗しました。有効なWordPress書き出しファイルか確認してください。')
  }

  const posts = []
  const items = doc.querySelectorAll('channel > item')

  for (const item of items) {
    const postType = getText(item, 'wp\\:post_type, post_type') ?? 'post'
    if (postType !== 'post' && postType !== 'page') continue

    const status = getText(item, 'wp\\:status, status')
    const title = getText(item, 'title') ?? ''
    const content = getText(item, 'content\\:encoded, encoded') ?? ''
    const excerpt = getText(item, 'excerpt\\:encoded') ?? ''
    const slug = getText(item, 'wp\\:post_name, post_name') ?? slugify(title)
    const date = getText(item, 'wp\\:post_date, post_date') ?? null
    const author = getText(item, 'dc\\:creator, creator') ?? null

    // カテゴリ・タグ
    const tags = []
    for (const cat of item.querySelectorAll('category')) {
      const domain = cat.getAttribute('domain') ?? ''
      if (domain === 'post_tag' || domain === 'category') {
        const label = cat.textContent?.trim()
        if (label) tags.push(label)
      }
    }

    // サムネイル（_thumbnail_id から attachment を引く）
    const thumbnailId = getMetaValue(item, '_thumbnail_id')
    const thumbnail = thumbnailId
      ? findAttachmentUrl(doc, thumbnailId)
      : null

    posts.push({
      title,
      body: wpContentToMarkdown(content),
      tags: [...new Set(tags)],
      slug,
      thumbnail,
      thumbnailBlob: null,
      publishedAt: date,
      author,
      summary: excerpt.replace(/<[^>]+>/g, '').trim(),
      media: {},
    })
  }

  return posts
}

function getText(el, selector) {
  return el.querySelector(selector)?.textContent?.trim() ?? null
}

function getMetaValue(item, key) {
  for (const meta of item.querySelectorAll('wp\\:postmeta, postmeta')) {
    const k = meta.querySelector('wp\\:meta_key, meta_key')?.textContent?.trim()
    if (k === key) {
      return meta.querySelector('wp\\:meta_value, meta_value')?.textContent?.trim() ?? null
    }
  }
  return null
}

function findAttachmentUrl(doc, id) {
  for (const item of doc.querySelectorAll('channel > item')) {
    const postId = getText(item, 'wp\\:post_id, post_id')
    if (postId === id) {
      return getText(item, 'wp\\:attachment_url, attachment_url')
    }
  }
  return null
}

/**
 * WordPressのHTMLコンテンツをMarkdownに変換（簡易版）
 */
function wpContentToMarkdown(html) {
  return html
    .replace(/<!-- wp:[^>]* \/-->/g, '')
    .replace(/<!-- wp:[^>]* -->/g, '')
    .replace(/<!-- \/wp:[^ ]+ -->/g, '')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a[^>]* href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img[^>]* src="([^"]+)"[^>]*\/?>/gi, '![]($1)')
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) =>
      c.trim().split('\n').map(l => '> ' + l).join('\n')
    )
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```')
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, c) =>
      c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n').trim()
    )
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, c) => {
      let i = 0
      return c.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, () => `${++i}. $1\n`).trim()
    })
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ============================================================
// ユーティリティ
// ============================================================

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(String)
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean)
  return []
}

function slugify(text = '') {
  return text
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'post-' + Date.now()
}

// ============================================================
// エントリーポイント：ファイルから自動判定してインポート
// ============================================================

/**
 * Fileオブジェクトを受け取り、種類を自動判定してインポートする
 * @param {File} file
 * @returns {Promise<ImportedPost[]>}
 */
export async function importFile(file) {
  const name = file.name.toLowerCase()

  if (name.endsWith('.md') || name.endsWith('.mdx')) {
    const text = await file.text()
    return [importMarkdownFile(file.name, text)]
  }

  if (name.endsWith('.zip')) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return importZipFile(bytes)
  }

  if (name.endsWith('.xml')) {
    const text = await file.text()
    return importWordPressXML(text)
  }

  throw new Error(`未対応のファイル形式です: ${file.name}\n対応形式: .md .mdx .zip .xml`)
}

/**
 * @typedef {Object} ImportedPost
 * @property {string} title
 * @property {string} body
 * @property {string[]} tags
 * @property {string} slug
 * @property {string|null} thumbnail
 * @property {Blob|null} thumbnailBlob
 * @property {string|null} publishedAt
 * @property {string|null} author
 * @property {string} summary
 * @property {Object<string, Blob>} media
 */
