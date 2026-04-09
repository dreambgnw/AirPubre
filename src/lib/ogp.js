/**
 * AirPubre OGP / meta タグ生成
 *
 * 対応タグ:
 *   - 基本 meta (description, author, keywords)
 *   - Open Graph (og:title, og:description, og:image, og:url, og:type, og:site_name)
 *   - Twitter Card (twitter:card, twitter:title, twitter:description, twitter:image)
 *   - Article 拡張 (article:published_time, article:modified_time, article:author, article:tag)
 *   - JSON-LD (構造化データ)
 *   - カスタム meta タグ（任意のname/contentペア）
 */

/**
 * 記事ページ用のOGPタグ文字列を生成する
 * @param {Object} post
 * @param {Object} siteConfig
 * @returns {string} <head>内に挿入するHTML文字列
 */
export function buildPostOGP(post, siteConfig = {}) {
  const {
    siteTitle = 'AirPubre Site',
    siteUrl = '',
    twitterHandle = '',
    defaultOgImage = '',
    locale = 'ja_JP',
  } = siteConfig

  const title = escHtml(post.title ?? 'Untitled')
  const description = escHtml(truncate(post.summary ?? post.body ?? '', 120))
  const url = siteUrl ? `${siteUrl.replace(/\/$/, '')}/${post.slug ?? ''}/` : ''
  const image = post.thumbnail
    ? absoluteUrl(post.thumbnail, siteUrl)
    : defaultOgImage
  const publishedAt = post.publishedAt ?? post.createdAt ?? ''
  const updatedAt = post.updatedAt ?? publishedAt
  const author = escHtml(post.author ?? '')
  const tags = (post.tags ?? []).map(escHtml)

  const twitterCard = image ? 'summary_large_image' : 'summary'

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title ?? 'Untitled',
    description: truncate(post.summary ?? post.body ?? '', 120),
    ...(image ? { image } : {}),
    ...(url ? { url } : {}),
    ...(publishedAt ? { datePublished: publishedAt } : {}),
    ...(updatedAt ? { dateModified: updatedAt } : {}),
    ...(author ? { author: { '@type': 'Person', name: post.author } } : {}),
    publisher: {
      '@type': 'Organization',
      name: siteTitle,
    },
    keywords: (post.tags ?? []).join(', '),
  })

  return `
  <!-- 基本 meta -->
  <meta name="description" content="${description}" />
  ${author ? `<meta name="author" content="${author}" />` : ''}
  ${tags.length ? `<meta name="keywords" content="${tags.join(', ')}" />` : ''}

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  ${url ? `<meta property="og:url" content="${url}" />` : ''}
  ${image ? `<meta property="og:image" content="${image}" />` : ''}
  <meta property="og:site_name" content="${escHtml(siteTitle)}" />
  <meta property="og:locale" content="${locale}" />

  <!-- Article -->
  ${publishedAt ? `<meta property="article:published_time" content="${publishedAt}" />` : ''}
  ${updatedAt ? `<meta property="article:modified_time" content="${updatedAt}" />` : ''}
  ${author ? `<meta property="article:author" content="${author}" />` : ''}
  ${tags.map(t => `<meta property="article:tag" content="${t}" />`).join('\n  ')}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${image ? `<meta name="twitter:image" content="${image}" />` : ''}
  ${twitterHandle ? `<meta name="twitter:site" content="@${twitterHandle.replace(/^@/, '')}" />` : ''}

  <!-- JSON-LD 構造化データ -->
  <script type="application/ld+json">${jsonLd}</script>

  <!-- カスタム meta タグ -->
  ${(post.customMeta ?? [])
    .filter(m => m.name && m.content)
    .map(m => `<meta name="${escHtml(m.name)}" content="${escHtml(m.content)}" />`)
    .join('\n  ')}
`.trim()
}

/**
 * サイトトップページ用のOGPタグ文字列を生成する
 * @param {Object} siteConfig
 * @returns {string}
 */
export function buildIndexOGP(siteConfig = {}) {
  const {
    siteTitle = 'AirPubre Site',
    siteDescription = '',
    siteUrl = '',
    twitterHandle = '',
    defaultOgImage = '',
    locale = 'ja_JP',
  } = siteConfig

  const title = escHtml(siteTitle)
  const description = escHtml(siteDescription)
  const twitterCard = defaultOgImage ? 'summary_large_image' : 'summary'

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteTitle,
    ...(siteDescription ? { description: siteDescription } : {}),
    ...(siteUrl ? { url: siteUrl } : {}),
  })

  return `
  <!-- 基本 meta -->
  ${description ? `<meta name="description" content="${description}" />` : ''}

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  ${description ? `<meta property="og:description" content="${description}" />` : ''}
  ${siteUrl ? `<meta property="og:url" content="${siteUrl}" />` : ''}
  ${defaultOgImage ? `<meta property="og:image" content="${defaultOgImage}" />` : ''}
  <meta property="og:site_name" content="${title}" />
  <meta property="og:locale" content="${locale}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${twitterCard}" />
  <meta name="twitter:title" content="${title}" />
  ${description ? `<meta name="twitter:description" content="${description}" />` : ''}
  ${defaultOgImage ? `<meta name="twitter:image" content="${defaultOgImage}" />` : ''}
  ${twitterHandle ? `<meta name="twitter:site" content="@${twitterHandle.replace(/^@/, '')}" />` : ''}

  <!-- JSON-LD 構造化データ -->
  <script type="application/ld+json">${jsonLd}</script>
`.trim()
}

// ============================================================
// ユーティリティ
// ============================================================

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(str = '', len = 120) {
  // MDの記法を除去してプレーンテキスト化
  const plain = str
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~`>]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return plain.length <= len ? plain : plain.slice(0, len - 1) + '…'
}

function absoluteUrl(src = '', base = '') {
  if (!src) return ''
  if (src.startsWith('http://') || src.startsWith('https://')) return src
  if (!base) return src
  return `${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}`
}
