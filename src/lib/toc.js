/**
 * toc.js — 目次（Table of Contents）ユーティリティ
 *
 * Markdown の見出し（# 〜 ######）を解析し、
 * TOC データ構造と HTML 文字列を生成する。
 */

/**
 * 文字列をアンカー ID に変換する
 * - 英数字・ひらがな・カタカナ・漢字はそのまま
 * - スペース → ハイフン
 * - それ以外の記号は除去
 * - 重複 ID には -2, -3 ... を付与
 *
 * @param {string} text
 * @param {Map<string, number>} counter — 呼び出し元で管理する重複カウンタ
 */
export function slugifyHeading(text, counter) {
  const base = text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]/g, '')
    .replace(/^-+|-+$/g, '')
    || 'section'

  const count = counter.get(base) ?? 0
  counter.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

/**
 * Markdown テキストから見出しリストを抽出する
 *
 * @param {string} md — Markdown 本文
 * @returns {Array<{ level: number, text: string, id: string }>}
 */
export function extractHeadings(md) {
  // コードブロック内の # を除外
  const stripped = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '')

  const headingRe = /^(#{1,6})\s+(.+)$/gm
  const counter = new Map()
  const headings = []

  let match
  while ((match = headingRe.exec(stripped)) !== null) {
    const level = match[1].length
    // インライン装飾を除去してプレーンテキスト化
    const text = match[2]
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim()

    headings.push({ level, text, id: slugifyHeading(text, counter) })
  }

  return headings
}

/**
 * 目次として意味がある（見出し 2 個以上）か判定
 */
export function hasToc(headings) {
  return headings.length >= 2
}

/**
 * TOC データをネストしたツリーに変換する
 *
 * @param {Array<{ level, text, id }>} headings
 * @returns ネストされた TOC ノードの配列
 *   { level, text, id, children: [...] }
 */
export function buildTocTree(headings) {
  const root = []
  const stack = [] // { node, level }

  for (const h of headings) {
    const node = { ...h, children: [] }

    // スタックを現在のレベルまで巻き戻す
    while (stack.length && stack[stack.length - 1].level >= h.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].node.children.push(node)
    }

    stack.push({ node, level: h.level })
  }

  return root
}

/**
 * TOC ツリーを HTML 文字列にレンダリングする（公開サイト埋め込み用）
 */
function renderTreeHtml(nodes, depth = 0) {
  if (!nodes.length) return ''
  const indent = '  '.repeat(depth + 1)
  const items = nodes
    .map(n => {
      const children = n.children.length ? '\n' + renderTreeHtml(n.children, depth + 1) + indent : ''
      return `${indent}<li><a href="#${n.id}">${escHtml(n.text)}</a>${children}</li>`
    })
    .join('\n')
  return `${indent}<ol>\n${items}\n${indent}</ol>\n`
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 記事 HTML に埋め込む <nav class="toc"> ブロックを生成する
 *
 * @param {string} md — Markdown 本文
 * @returns {string} HTML 文字列（見出しが 2 個未満なら空文字）
 */
export function buildTocHtml(md) {
  const headings = extractHeadings(md)
  if (!hasToc(headings)) return ''

  const tree = buildTocTree(headings)
  return `<nav class="toc" aria-label="目次">
  <p class="toc-title">目次</p>
${renderTreeHtml(tree)}</nav>`
}

/**
 * Markdown 本文にアンカー ID を付与して HTML へ変換する
 * （marked.js で変換した後の <h1〜h6> タグに id を追加する）
 *
 * @param {string} html — marked.js で変換済みの HTML
 * @param {Array<{ level, text, id }>} headings — extractHeadings() の結果
 * @returns {string} id 付きの HTML
 */
export function injectHeadingIds(html, headings) {
  // 各見出しのテキストと ID のマップを作成
  const map = new Map(headings.map(h => [h.text, h.id]))

  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (match, level, inner) => {
    // inner からプレーンテキストを取り出す
    const plain = inner.replace(/<[^>]+>/g, '').trim()
    const id = map.get(plain)
    if (!id) return match
    return `<h${level} id="${id}">${inner}</h${level}>`
  })
}
