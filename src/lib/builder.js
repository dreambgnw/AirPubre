/**
 * AirPubre ブラウザビルダー
 * Markdownの記事一覧から静的HTMLを生成する
 */

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { buildPostOGP, buildIndexOGP } from './ogp.js'
import { extractHeadings, hasToc, buildTocHtml, injectHeadingIds } from './toc.js'

/**
 * 記事一覧から静的サイト（HTMLファイル群）を生成する
 * @param {Array} posts - 記事データの配列
 * @param {Object} siteConfig - サイト設定
 * @returns {Map<string, string>} ファイルパス → HTML文字列
 */
export async function buildSite(posts, siteConfig = {}) {
  const {
    title = 'My AirPubre Site',
    description = 'Powered by AirPubre',
    baseUrl = '/',
  } = siteConfig

  // 予約投稿（未来日）の記事はビルドから除外する
  const now = Date.now()
  const visiblePosts = posts.filter(p => {
    if (!p.scheduledAt) return true
    const t = new Date(p.scheduledAt).getTime()
    return Number.isNaN(t) || t <= now
  })

  // wikilink 解決用に title → slug マップを構築
  const slugByTitle = new Map()
  for (const p of visiblePosts) {
    const s = p.slug ?? slugify(p.title ?? '')
    if (p.title) slugByTitle.set(p.title.trim(), s)
  }

  const files = new Map()
  const commonCSS = getCommonCSS(siteConfig.background ?? 'wordpress')

  for (const post of visiblePosts) {
    const slug = post.slug ?? slugify(post.title)
    const html = buildPostPage({ post, slug, siteTitle: title, css: commonCSS, baseUrl, siteConfig, slugByTitle })
    files.set(`${slug}/index.html`, html)
  }

  files.set('index.html', buildIndexPage({ posts: visiblePosts, title, description, css: commonCSS, baseUrl, siteConfig }))

  // 著者ページ
  if (siteConfig.authorName) {
    files.set('author/index.html', buildAuthorPage({ posts: visiblePosts, css: commonCSS, baseUrl, siteConfig, siteTitle: title }))
  }

  return files
}

/**
 * インデックスページのHTML
 */
function buildIndexPage({ posts, title, description, css, baseUrl, siteConfig }) {
  const postCards = posts.map(post => {
    const slug = post.slug ?? slugify(post.title)
    const date = new Date(post.createdAt).toLocaleDateString('ja-JP')
    const tags = (post.tags ?? []).map(t =>
      `<span class="tag">${escapeHtml(t)}</span>`
    ).join('')
    const thumbHtml = post.thumbnail
      ? `<img src="${escapeHtml(post.thumbnail)}" alt="" class="card-thumb" loading="lazy" />`
      : ''
    return `
      <a href="${baseUrl}${slug}/" class="card">
        ${thumbHtml}
        <div class="card-body">
          <div class="card-tags">${tags}</div>
          <h2 class="card-title">${escapeHtml(post.title || '（タイトルなし）')}</h2>
          <p class="card-excerpt">${escapeHtml(post.body?.slice(0, 100) ?? '')}...</p>
          <div class="card-meta">${date}</div>
        </div>
      </a>
    `
  }).join('')

  const ogpTags = buildIndexOGP({ ...siteConfig, siteTitle: title, siteDescription: description })

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${ogpTags}
  <style>${css}</style>
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a href="${baseUrl}" class="site-title">${escapeHtml(title)}</a>
    </div>
  </header>
  <main class="container">
    <div class="post-grid">
      ${postCards}
    </div>
  </main>
  <footer class="site-footer">
    <div class="container">
      <small>Powered by <a href="https://github.com/airpubre/airpubre">AirPubre</a></small>
    </div>
  </footer>
</body>
</html>`
}

/**
 * 記事ページのHTML
 */
function buildPostPage({ post, slug, siteTitle, css, baseUrl, siteConfig, slugByTitle }) {
  const rawBody = post.body ?? ''
  const body = preprocessObsidian(rawBody, slugByTitle, baseUrl)
  const headings = extractHeadings(body)
  const tocHtml = hasToc(headings) ? buildTocHtml(body) : ''
  const rawHtml = marked.parse(body)
  const htmlWithIds = injectHeadingIds(rawHtml, headings)
  const html = DOMPurify.sanitize(htmlWithIds, { ADD_ATTR: ['id'] })

  const publishedAt = post.publishedAt ?? post.createdAt
  const updatedAt   = post.updatedAt
  const pubDate  = publishedAt ? new Date(publishedAt).toLocaleDateString('ja-JP') : ''
  const upDate   = updatedAt && updatedAt !== publishedAt
    ? new Date(updatedAt).toLocaleDateString('ja-JP') : null

  const tags = (post.tags ?? []).map(t =>
    `<span class="tag">${escapeHtml(t)}</span>`
  ).join('')

  const { authorName, authorAvatarUrl } = siteConfig
  const authorHtml = authorName ? `
    <a href="${baseUrl}author/" class="author-card">
      ${authorAvatarUrl ? `<img src="${escapeHtml(authorAvatarUrl)}" alt="${escapeHtml(authorName)}" class="author-avatar" />` : ''}
      <div>
        <p class="author-name">${escapeHtml(authorName)}</p>
        <p class="author-label">著者</p>
      </div>
    </a>` : ''

  const ogpTags = buildPostOGP({ ...post, slug }, { ...siteConfig, siteTitle })
  const heroHtml = post.thumbnail
    ? `<img src="${escapeHtml(post.thumbnail)}" alt="" class="post-hero" loading="eager" />`
    : ''

  return `<!DOCTYPE html>
<html lang="${siteConfig.language ?? 'ja'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(post.title || 'Untitled')} - ${escapeHtml(siteTitle)}</title>
  ${ogpTags}
  <style>${css}</style>
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a href="${baseUrl}" class="site-title">${escapeHtml(siteTitle)}</a>
    </div>
  </header>
  <main class="container">
    <article class="post">
      ${heroHtml}
      <div class="post-tags">${tags}</div>
      <h1 class="post-title">${escapeHtml(post.title || '（タイトルなし）')}</h1>
      <div class="post-meta">
        ${pubDate ? `<time datetime="${publishedAt}">📅 ${pubDate} 公開</time>` : ''}
        ${upDate  ? `<span class="post-updated"> · 🔄 ${upDate} 更新</span>` : ''}
      </div>
      ${authorHtml}
      ${tocHtml}
      <div class="post-body prose">
        ${html}
      </div>
    </article>
    ${authorHtml ? `<div class="author-footer">${authorHtml}</div>` : ''}
    <a href="${baseUrl}" class="back-link">← 一覧に戻る</a>
  </main>
  <footer class="site-footer">
    <div class="container">
      <small>Powered by <a href="https://github.com/airpubre/airpubre">AirPubre</a></small>
    </div>
  </footer>
</body>
</html>`
}

/**
 * 著者ページ
 */
function buildAuthorPage({ posts, css, baseUrl, siteConfig, siteTitle }) {
  const {
    authorName, authorBio, authorAvatarUrl,
    authorTwitter, authorMastodon, authorGitHub, authorWebsite,
    authorBioMarkdown,
  } = siteConfig

  const bioMdHtml = authorBioMarkdown
    ? DOMPurify.sanitize(marked.parse(authorBioMarkdown), { ADD_ATTR: ['id'] })
    : ''

  const sns = [
    authorTwitter  && `<a href="https://x.com/${authorTwitter.replace(/^@/, '')}" class="sns-link">X / Twitter</a>`,
    authorMastodon && `<a href="https://${authorMastodon.split('@').pop()}/@${authorMastodon.split('@')[1]}" class="sns-link">Mastodon</a>`,
    authorGitHub   && `<a href="https://github.com/${authorGitHub}" class="sns-link">GitHub</a>`,
    authorWebsite  && `<a href="${authorWebsite}" class="sns-link">Website</a>`,
  ].filter(Boolean).join('\n      ')

  const articleList = posts.map(post => {
    const slug = post.slug ?? slugify(post.title)
    const date = new Date(post.publishedAt ?? post.createdAt).toLocaleDateString('ja-JP')
    return `<li>
        <a href="${baseUrl}${slug}/" class="author-post-link">
          <span class="author-post-title">${escapeHtml(post.title || '（タイトルなし）')}</span>
          <span class="author-post-date">${date}</span>
        </a>
      </li>`
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="${siteConfig.language ?? 'ja'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(authorName)} - ${escapeHtml(siteTitle)}</title>
  <style>${css}</style>
</head>
<body>
  <header class="site-header">
    <div class="container">
      <a href="${baseUrl}" class="site-title">${escapeHtml(siteTitle)}</a>
    </div>
  </header>
  <main class="container">
    <div class="author-profile">
      ${authorAvatarUrl ? `<img src="${escapeHtml(authorAvatarUrl)}" alt="${escapeHtml(authorName)}" class="author-profile-avatar" />` : ''}
      <h1 class="author-profile-name">${escapeHtml(authorName)}</h1>
      ${authorBio ? `<p class="author-profile-bio">${escapeHtml(authorBio)}</p>` : ''}
      ${sns ? `<div class="author-sns">${sns}</div>` : ''}
    </div>
    ${bioMdHtml ? `<section class="author-bio-md prose">${bioMdHtml}</section>` : ''}
    ${posts.length > 0 ? `
    <section class="author-posts">
      <h2 class="author-posts-title">記事一覧</h2>
      <ul class="author-post-list">${articleList}</ul>
    </section>` : ''}
    <a href="${baseUrl}" class="back-link">← サイトトップへ</a>
  </main>
  <footer class="site-footer">
    <div class="container">
      <small>Powered by <a href="https://github.com/airpubre/airpubre">AirPubre</a></small>
    </div>
  </footer>
</body>
</html>`
}

/**
 * 共通CSS（テーマ対応）
 * @param {'wordpress'|'obsidian'|'word'|'markdown'} theme
 */
function getCommonCSS(theme = 'wordpress') {
  const themes = {
    wordpress: `
      :root {
        --primary: #0ea5e9; --primary-light: #e0f2fe; --primary-50: #f0f9ff;
        --bg: #f0f9ff; --surface: #ffffff; --text: #1e293b; --text-muted: #475569; --text-subtle: #94a3b8;
        --border: #e0f2fe; --header-bg: #ffffff; --code-bg: #f0f9ff; --code-text: #0369a1;
        --pre-bg: #0f172a; --pre-text: #e2e8f0;
      }
      body { font-family: 'Noto Sans JP','Georgia',serif; }
    `,
    obsidian: `
      :root {
        --primary: #818cf8; --primary-light: #312e81; --primary-50: #1e1b4b;
        --bg: #0f0f13; --surface: #1a1a24; --text: #e2e8f0; --text-muted: #94a3b8; --text-subtle: #64748b;
        --border: #2d2d3f; --header-bg: #13131a; --code-bg: #0d0d11; --code-text: #a5b4fc;
        --pre-bg: #0d0d11; --pre-text: #c7d2fe;
      }
      body { font-family: 'Inter','Noto Sans JP',sans-serif; }
      a { color: var(--primary) !important; }
      .card { background: var(--surface) !important; border-color: var(--border) !important; }
      .card:hover { border-color: var(--primary) !important; box-shadow: 0 4px 20px rgba(129,140,248,0.2) !important; }
      .post { background: var(--surface) !important; }
      .author-card { background: var(--surface) !important; border-color: var(--border) !important; }
      .author-profile { background: var(--surface) !important; }
      .author-posts { background: var(--surface) !important; }
      .tag { background: var(--primary-50) !important; color: var(--primary) !important; }
      .toc { background: #1a1a2e !important; border-color: var(--border) !important; }
      .site-header { border-bottom-color: var(--border) !important; box-shadow: 0 1px 8px rgba(0,0,0,0.4) !important; }
      .site-footer { border-top-color: var(--border) !important; }
    `,
    word: `
      :root {
        --primary: #1d4ed8; --primary-light: #dbeafe; --primary-50: #f8fafc;
        --bg: #f8f9fa; --surface: #ffffff; --text: #111827; --text-muted: #374151; --text-subtle: #6b7280;
        --border: #e5e7eb; --header-bg: #ffffff; --code-bg: #f3f4f6; --code-text: #1d4ed8;
        --pre-bg: #1f2937; --pre-text: #f9fafb;
      }
      body { font-family: 'Times New Roman','Noto Serif JP',serif; }
      .container { max-width: 800px !important; }
      .post { box-shadow: 0 1px 8px rgba(0,0,0,0.08); border: 1px solid var(--border) !important; }
    `,
    markdown: `
      :root {
        --primary: #22c55e; --primary-light: #14532d; --primary-50: #0a0a0a;
        --bg: #0d1117; --surface: #161b22; --text: #c9d1d9; --text-muted: #8b949e; --text-subtle: #6e7681;
        --border: #30363d; --header-bg: #161b22; --code-bg: #0d1117; --code-text: #7ee787;
        --pre-bg: #0d1117; --pre-text: #c9d1d9;
      }
      body { font-family: 'JetBrains Mono','Fira Code','Consolas',monospace; }
      a { color: var(--primary) !important; }
      .card { background: var(--surface) !important; border-color: var(--border) !important; }
      .card:hover { border-color: var(--primary) !important; }
      .post { background: var(--surface) !important; }
      .author-card, .author-profile, .author-posts { background: var(--surface) !important; border-color: var(--border) !important; }
      .tag { background: #14532d !important; color: #4ade80 !important; }
      .toc { background: #0d1117 !important; border-color: var(--border) !important; }
      .site-header { border-bottom-color: var(--border) !important; }
    `,
  }

  const themeVars = themes[theme] ?? themes.wordpress

  return themeVars + `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); line-height: 1.7; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .container { max-width: 720px; margin: 0 auto; padding: 0 1rem; }
    .site-header { background: var(--header-bg); border-bottom: 1px solid var(--border); padding: 1rem 0; position: sticky; top: 0; z-index: 10; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .site-title { font-size: 1.25rem; font-weight: 700; color: var(--text); }
    .site-title span { color: var(--primary); }
    .post-grid { display: grid; gap: 1rem; padding: 2rem 0; }
    .card { background: var(--surface); border: 1.5px solid var(--border); border-radius: 1rem; display: block; color: inherit; transition: box-shadow .2s, border-color .2s; overflow: hidden; }
    .card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); border-color: var(--primary); text-decoration: none; }
    .card-thumb { width: 100%; height: 160px; object-fit: cover; display: block; }
    .card-body { padding: 1.25rem; }
    .card-tags, .post-tags { display: flex; flex-wrap: wrap; gap: .375rem; margin-bottom: .5rem; }
    .post-hero { width: 100%; max-height: 400px; object-fit: cover; border-radius: .75rem; margin-bottom: 1.5rem; display: block; }
    .tag { background: var(--primary-light); color: var(--primary); font-size: .7rem; padding: .2rem .6rem; border-radius: 999px; font-weight: 500; }
    .card-title { font-size: 1rem; font-weight: 700; margin-bottom: .375rem; }
    .card-excerpt { font-size: .8rem; color: var(--text-muted); margin-bottom: .5rem; }
    .card-meta, .post-meta { font-size: .75rem; color: var(--text-subtle); }
    .post { background: var(--surface); border-radius: 1.25rem; padding: 2rem; margin: 2rem 0; }
    .post-title { font-size: 1.75rem; font-weight: 700; margin: .5rem 0; line-height: 1.3; }
    .post-body { margin-top: 2rem; }
    .prose h1,.prose h2,.prose h3 { font-weight: 700; margin: 1.5rem 0 .5rem; }
    .prose h1 { font-size: 1.5rem; }
    .prose h2 { font-size: 1.25rem; }
    .prose h3 { font-size: 1.1rem; }
    .prose p { margin-bottom: 1rem; }
    .prose ul,.prose ol { margin: 1rem 0 1rem 1.5rem; }
    .prose li { margin-bottom: .25rem; }
    .prose blockquote { border-left: 4px solid var(--primary); padding-left: 1rem; color: var(--text-muted); margin: 1rem 0; font-style: italic; }
    .prose code { background: var(--code-bg); color: var(--code-text); padding: .1rem .4rem; border-radius: .25rem; font-size: .85em; font-family: 'JetBrains Mono', monospace; }
    .prose pre { background: var(--pre-bg); color: var(--pre-text); border-radius: .75rem; padding: 1rem; overflow-x: auto; margin: 1rem 0; }
    .prose pre code { background: none; color: inherit; padding: 0; }
    .prose img { max-width: 100%; border-radius: .75rem; margin: 1rem 0; }
    .prose a { color: var(--primary); }
    .back-link { display: inline-flex; align-items: center; gap: .25rem; color: var(--primary); font-size: .875rem; margin-bottom: 2rem; }
    .site-footer { border-top: 1px solid var(--border); padding: 1.5rem 0; text-align: center; color: var(--text-subtle); font-size: .75rem; margin-top: 2rem; }
    /* 目次 */
    .toc { background: var(--primary-50); border: 1.5px solid var(--border); border-radius: 1rem; padding: 1.25rem 1.5rem; margin: 1.5rem 0 2rem; }
    .toc-title { font-size: .75rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .75rem; }
    .toc ol { padding-left: 1.25rem; list-style: decimal; }
    .toc li { font-size: .875rem; margin-bottom: .3rem; }
    .toc a { color: var(--primary); }
    .toc a:hover { text-decoration: underline; }
    .toc ol ol { margin-top: .2rem; padding-left: 1rem; list-style: lower-roman; }
    /* 著者カード */
    .author-card { display: flex; align-items: center; gap: .75rem; background: var(--primary-50); border: 1.5px solid var(--border); border-radius: 1rem; padding: .75rem 1rem; margin: 1rem 0; text-decoration: none; color: inherit; transition: border-color .2s; }
    .author-card:hover { border-color: var(--primary); text-decoration: none; }
    .author-avatar { width: 2.5rem; height: 2.5rem; border-radius: 50%; object-fit: cover; }
    .author-name { font-weight: 600; font-size: .875rem; color: var(--text); }
    .author-label { font-size: .7rem; color: var(--text-subtle); }
    .author-footer { margin-top: 2.5rem; padding-top: 2rem; border-top: 1px solid var(--border); }
    .post-updated { color: var(--text-subtle); font-size: .75rem; }
    /* 著者プロフィールページ */
    .author-profile { background: var(--surface); border-radius: 1.5rem; padding: 2rem; margin: 2rem 0; text-align: center; }
    .author-profile-avatar { width: 5rem; height: 5rem; border-radius: 50%; object-fit: cover; margin: 0 auto 1rem; display: block; border: 3px solid var(--border); }
    .author-profile-name { font-size: 1.5rem; font-weight: 700; margin-bottom: .5rem; }
    .author-profile-bio { color: var(--text-muted); font-size: .9rem; line-height: 1.7; max-width: 480px; margin: 0 auto .75rem; }
    .author-sns { display: flex; justify-content: center; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
    .sns-link { font-size: .75rem; background: var(--primary-light); color: var(--primary); padding: .25rem .75rem; border-radius: 999px; font-weight: 500; }
    .sns-link:hover { background: var(--primary); color: #fff; text-decoration: none; }
    .author-posts { background: var(--surface); border-radius: 1.25rem; padding: 1.5rem; margin: 1rem 0 2rem; }
    .author-posts-title { font-size: 1rem; font-weight: 700; margin-bottom: 1rem; color: var(--text); }
    .author-post-list { list-style: none; }
    .author-post-link { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .6rem 0; border-bottom: 1px solid var(--border); color: inherit; }
    .author-post-link:hover { color: var(--primary); text-decoration: none; }
    .author-post-title { font-size: .875rem; font-weight: 500; }
    .author-post-date { font-size: .75rem; color: var(--text-subtle); flex-shrink: 0; }
    .author-bio-md { background: var(--surface); border-radius: 1.25rem; padding: 1.5rem 2rem; margin: 1rem 0 2rem; }
    .prose mark { background: #fef08a; color: inherit; padding: 0 .2em; border-radius: .2em; }
    @media (max-width: 640px) {
      .post { padding: 1.25rem; }
      .post-title { font-size: 1.375rem; }
    }
  `
}

/**
 * 公開記事のマニフェストJSONを生成する
 * ZIPや静的サイトに同梱して slug ↔ ファイルパスを紐づける
 * @param {Array} posts
 * @param {Object} siteConfig
 * @returns {string} JSON文字列
 */
export function buildManifest(posts, siteConfig = {}) {
  const baseUrl = siteConfig.baseUrl ?? '/'
  return JSON.stringify({
    site: {
      title:   siteConfig.title || siteConfig.siteTitle || '',
      baseUrl,
    },
    articles: posts.map(post => {
      const slug = post.slug ?? slugify(post.title ?? '')
      return {
        slug,
        title:       post.title       ?? '',
        path:        `${slug}/index.html`,
        publishedAt: post.publishedAt ?? post.createdAt ?? null,
        updatedAt:   post.updatedAt   ?? null,
        tags:        post.tags        ?? [],
        summary:     post.summary     ?? '',
        thumbnail:   post.thumbnail   ?? '',
      }
    }),
    generatedAt: new Date().toISOString(),
  }, null, 2)
}

// ============================================================
// Obsidian 拡張記法プリプロセッサ
// ============================================================

/**
 * `==highlight==` を `<mark>` に、`[[wikilink]]` を相対リンクに変換する。
 * フェンスドコードブロック内は変換対象外。
 * @param {string} md
 * @param {Map<string, string>|undefined} slugByTitle
 * @param {string} baseUrl
 */
function preprocessObsidian(md = '', slugByTitle, baseUrl = '/') {
  if (!md) return md
  // ```...``` を保護しつつ分割（奇数インデックスがコードブロック）
  const parts = md.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part
    let out = part
    // ==highlight== — 行頭の == 見出しエスケープを避けるため空白を含む条件
    out = out.replace(/==([^\s=][^=\n]*?[^\s=]|[^\s=])==/g, '<mark>$1</mark>')
    // [[Title]] / [[Title|alias]]
    out = out.replace(/\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g, (_m, target, alias) => {
      const key = target.trim()
      const text = (alias ?? key).trim()
      const slug = slugByTitle?.get(key)
      if (slug) return `[${text}](${baseUrl}${slug}/)`
      return text
    })
    return out
  }).join('')
}

// ============================================================
// ユーティリティ
// ============================================================

function slugify(text = '') {
  return text
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'post-' + Date.now()
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * MapからZIPブロブを生成する（JSZipなし・純粋実装）
 * ※ 実際にはJSZipやfflateを使うのが現実的
 * @param {Map<string, string>} files
 * @returns {Blob}
 */
export function filesToZipBlob(files) {
  // fflateを使ったZIP生成（動的インポート）
  return import('fflate').then(({ zipSync, strToU8 }) => {
    const zipFiles = {}
    for (const [path, content] of files) {
      zipFiles[path] = strToU8(content)
    }
    const zipped = zipSync(zipFiles)
    return new Blob([zipped], { type: 'application/zip' })
  })
}
