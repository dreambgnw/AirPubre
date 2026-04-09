/**
 * Transformers.js Web Worker
 * メインスレッドをブロックせずにAI要約を実行する
 */
import { pipeline, env } from '@xenova/transformers'

// ローカルモデルは使用しない（CDN から取得）
env.allowLocalModels = false

/** キャッシュ済みパイプライン */
let summarizer = null

/**
 * 日本語かどうかを判定（文字列の50%以上が日系文字ならtrue）
 */
function isJapanese(text) {
  const jpChars = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length
  return jpChars / text.length > 0.3
}

/**
 * 日本語テキスト向けスマート抽出型要約
 * - コードブロック・見出し・リンクを除去した文章から
 * - 文末パターンで文を分割し、重要度スコアで上位を選ぶ
 */
function extractiveSummarize(text, maxChars = 120) {
  // Markdown記法を除去
  const clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()

  // 文を分割（句点・感嘆符・疑問符・改行で区切る）
  const sentences = clean
    .split(/(?<=[。！？\n])|(?<=\.\s)/)
    .map(s => s.trim())
    .filter(s => s.length > 10)

  if (sentences.length === 0) return clean.slice(0, maxChars)

  // 重要度スコア：先頭の文を優先し、短すぎ/長すぎを除外
  const scored = sentences.map((s, i) => ({
    text: s,
    score: (i === 0 ? 3 : i === 1 ? 2 : 1) + (s.length > 15 && s.length < 80 ? 1 : 0)
  }))

  // スコア順に選択し、maxChars に収める
  scored.sort((a, b) => b.score - a.score)
  let result = ''
  for (const { text } of scored) {
    if ((result + text).length > maxChars) break
    result += (result ? '。' : '') + text.replace(/[。]$/, '')
  }

  return result.slice(0, maxChars)
}

self.addEventListener('message', async (e) => {
  const { type, text, id } = e.data

  // ────────────────────────────────────────────────
  // モデルのロード
  // ────────────────────────────────────────────────
  if (type === 'load') {
    try {
      self.postMessage({ type: 'status', status: 'loading' })

      summarizer = await pipeline(
        'summarization',
        'Xenova/distilbart-cnn-6-6',
        {
          progress_callback: (prog) => {
            self.postMessage({ type: 'progress', ...prog })
          },
        }
      )

      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message })
    }
  }

  // ────────────────────────────────────────────────
  // 要約の実行
  // ────────────────────────────────────────────────
  if (type === 'summarize') {
    try {
      if (!text || text.trim().length < 20) {
        self.postMessage({ type: 'result', id, summary: '' })
        return
      }

      // 日本語が多い場合は抽出型要約にフォールバック
      if (isJapanese(text)) {
        const summary = extractiveSummarize(text, 120)
        self.postMessage({ type: 'result', id, summary, method: 'extractive' })
        return
      }

      // 英語コンテンツ → Transformers.js でAI要約
      if (!summarizer) {
        self.postMessage({ type: 'error', id, error: 'Model not loaded' })
        return
      }

      // モデルの入力上限（1024トークン）に合わせてテキストを截断
      const trimmed = text.slice(0, 2000)
      const result = await summarizer(trimmed, {
        max_new_tokens: 80,
        min_new_tokens: 20,
        do_sample: false,
      })

      const summary = result[0]?.summary_text ?? ''
      self.postMessage({ type: 'result', id, summary: summary.trim(), method: 'ai' })
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
  }
})
