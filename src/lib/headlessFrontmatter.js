/**
 * Headless モード用 frontmatter シリアライザ／パーサー
 *
 * shunature-one の deploy-server.sh が読む形式に合わせる：
 *   - title:                文字列（クォートあり）
 *   - date:                 ISO 8601（タイムゾーン付き推奨）
 *   - tags:                 ブロック形式（- item を改行で）
 *   - thumbnail:            ファイル名（拡張子は .webp 等そのまま）
 *   - thumbnail_credit:     文字列
 *   - thumbnail_credit_url: URL
 *   - summary:              文字列
 *
 * deploy-server.sh は frontmatter を正規表現で読むため、複雑な YAML 構文は使わない。
 */

/** 値を YAML スカラ（必要なら "..." クォート）に */
function quote(value) {
  if (value == null) return ''
  const s = String(value)
  // クォートが必要なケース：YAML 特殊文字を含む場合のみ
  if (/[:#\[\]{}&*!|>'"%@`]/.test(s) || /^[\s-]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

/**
 * draft → Markdown ファイル本体（frontmatter + 本文）
 * @param {Object} draft - AirPubre の draft オブジェクト
 * @param {Object} [opts]
 * @param {string} [opts.thumbnailFilename] - frontmatter に書き込むサムネイルファイル名
 */
export function serializeHeadlessMarkdown(draft, opts = {}) {
  const lines = ['---']

  if (draft.title) lines.push(`title: ${quote(draft.title)}`)

  // 日付：scheduledAt > publishedAt > createdAt の優先順位。
  // deploy-server.sh は date が未来なら自動で非公開にしてくれるので、scheduledAt を素直に渡せる。
  const dateRaw = draft.scheduledAt || draft.publishedAt || draft.createdAt
  if (dateRaw) {
    const d = new Date(dateRaw)
    if (!isNaN(d.getTime())) {
      // ミリ秒を除去: 2026-04-11T05:33:58Z
      lines.push(`date: ${d.toISOString().replace(/\.\d{3}Z$/, 'Z')}`)
    }
  }

  // tags：ブロック形式
  if (Array.isArray(draft.tags) && draft.tags.length > 0) {
    lines.push('tags:')
    for (const t of draft.tags) lines.push(`  - ${quote(t)}`)
  }

  if (opts.thumbnailFilename) {
    lines.push(`thumbnail: ${quote(opts.thumbnailFilename)}`)
  }
  if (draft.thumbnailCredit) {
    lines.push(`thumbnail_credit: ${quote(draft.thumbnailCredit)}`)
  }
  if (draft.thumbnailCreditUrl) {
    lines.push(`thumbnail_credit_url: ${quote(draft.thumbnailCreditUrl)}`)
  }
  if (draft.summary) {
    lines.push(`summary: ${quote(draft.summary)}`)
  }

  lines.push('---', '', draft.body || '', '')
  return lines.join('\n')
}

/**
 * shunature 形式の Markdown を AirPubre draft 形式にパース
 * deploy-server.sh と同じ寛容な regex マッチングを使う。
 */
export function parseHeadlessMarkdown(raw) {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!fmMatch) return { body: raw }

  const fm = fmMatch[1]
  const body = fmMatch[2]

  const stripQuotes = s => s.trim().replace(/^["']|["']$/g, '')
  const get = re => {
    const m = fm.match(re)
    return m ? stripQuotes(m[1]) : null
  }

  const title = get(/^title:\s*(.+)$/m)
  const date = get(/^date:\s*(.+)$/m)
  const thumbnail = get(/^thumbnail:\s*(.+)$/m)
  const thumbnailCredit = get(/^thumbnail_credit:\s*(.+)$/m)
  const thumbnailCreditUrl = get(/^thumbnail_credit_url:\s*(.+)$/m)
  const summary = get(/^summary:\s*(.+)$/m)

  // tags：inline [a, b] とブロック - a の両対応
  let tags = []
  const tagsInline = fm.match(/^tags:\s*\[(.+)\]$/m)
  const tagsBlock = fm.match(/^tags:\r?\n((?:\s+-\s*.+\r?\n?)+)/m)
  if (tagsInline) {
    tags = tagsInline[1].split(',').map(t => stripQuotes(t))
  } else if (tagsBlock) {
    tags = tagsBlock[1].match(/-\s*(.+)/g).map(t => stripQuotes(t.replace(/^-\s*/, '')))
  }

  return { title, date, tags, thumbnail, thumbnailCredit, thumbnailCreditUrl, summary, body }
}
