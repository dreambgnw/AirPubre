import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { Globe, Plus, X, ChevronDown, Sparkles, Loader2, List, CheckCircle, ImagePlus, Palette, Type, Code2, FileText, Hash, Tag, Calendar, Search, BookOpen, ChevronRight, Highlighter, AlertTriangle, Info, Lightbulb, Link2 } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { saveDraft, getMetaTemplates, getSiteConfig, getDrafts } from '../../lib/storage.js'
import { imageToWebP, shouldConvertToWebP } from '../../lib/imageUtils.js'
import { useSummarizer } from '../../lib/useSummarizer.js'
import { extractHeadings, hasToc, buildTocTree, injectHeadingIds } from '../../lib/toc.js'

// TipTap は重量級なのでリッチテキストモード使用時のみ読み込む
const RichTextEditor = lazy(() => import('./RichTextEditor.jsx'))

// turndown インスタンス（HTML → Markdown）
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

function htmlToMd(html) {
  return td.turndown(html)
}

function mdToHtml(md) {
  return marked.parse(md || '')
}

const GRADIENT_PRESETS = [
  { label: 'スカイ',     from: '#0ea5e9', to: '#6366f1' },
  { label: 'グリーン',   from: '#10b981', to: '#0ea5e9' },
  { label: 'サンセット', from: '#f97316', to: '#ec4899' },
  { label: 'パープル',   from: '#8b5cf6', to: '#ec4899' },
  { label: 'ダーク',     from: '#1e293b', to: '#0f766e' },
]

/**
 * タイトル＋グラデーション背景の OGP サムネイルを Canvas で生成して Base64 を返す
 * @param {string} title - 記事タイトル
 * @param {{ from: string, to: string }} gradient - グラデーション色
 * @param {string|null} siteName - 表示するブログ名（null なら非表示）
 */
async function generateGradientThumbnail(title, { from, to }, siteName = null) {
  const W = 1200, H = 630
  const canvas  = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // グラデーション背景
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, from)
  grad.addColorStop(1, to)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H)

  // 装飾サークル
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath(); ctx.arc(W * 0.88, H * 0.18, 220, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(W * 0.08, H * 0.82, 160, 0, Math.PI * 2); ctx.fill()

  // タイトル描画
  await document.fonts.ready
  ctx.fillStyle  = '#ffffff'
  ctx.textAlign  = 'center'
  ctx.textBaseline = 'middle'

  const maxW    = W - 140
  const fontSize = title.length <= 14 ? 72 : title.length <= 24 ? 60 : 48
  const lineH    = Math.round(fontSize * 1.45)
  ctx.font = `bold ${fontSize}px 'Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif`

  // 1文字ずつ折り返し
  const lines = []
  let line = ''
  for (const ch of title) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line); line = ch
    } else {
      line += ch
    }
  }
  lines.push(line)

  const startY = H / 2 - (lines.length * lineH) / 2 + lineH / 2
  lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH))

  // ブログ名（下部）— siteName が指定されている場合のみ表示
  if (siteName) {
    ctx.font      = '22px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(siteName, W / 2, H - 36)
  }

  return canvas.toDataURL('image/png')
}

const META_PRESETS = [
  { label: 'fediverse:creator', name: 'fediverse:creator', content: '@user@example.social' },
  { label: 'robots',            name: 'robots',            content: 'index, follow' },
  { label: 'theme-color',       name: 'theme-color',       content: '#0ea5e9' },
  { label: 'copyright',         name: 'copyright',         content: '' },
  { label: 'canonical',         name: 'canonical',         content: '' },
]

/** プレビュー内に表示する TOC コンポーネント */
function TocPreview({ headings }) {
  const tree = buildTocTree(headings)

  function renderNodes(nodes, depth = 0) {
    return (
      <ol className={`space-y-0.5 ${depth > 0 ? 'ml-4 mt-0.5' : ''}`}>
        {nodes.map((node, i) => (
          <li key={i} className="text-sm">
            <a
              href={`#${node.id}`}
              className="text-sky-600 hover:text-sky-800 hover:underline transition-colors"
            >
              {node.text}
            </a>
            {node.children.length > 0 && renderNodes(node.children, depth + 1)}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <nav className="mb-6 bg-sky-50 border border-sky-100 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <List className="w-3.5 h-3.5 text-sky-500" />
        <span className="text-xs font-semibold text-sky-700">目次</span>
      </div>
      {renderNodes(tree)}
    </nav>
  )
}

/** Markdown からプレーンテキストを抽出（要約の入力用） */
function mdToPlain(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, ' ')
    .trim()
}

/** モデルダウンロードのプログレスバー */
function ModelProgressBar({ progress }) {
  if (!progress) return null
  const pct = progress.progress != null ? Math.round(progress.progress) : null
  const label = progress.status === 'downloading'
    ? `モデルをダウンロード中… ${pct != null ? pct + '%' : ''}`
    : progress.status === 'loading'
    ? 'モデルを読み込み中…'
    : '初期化中…'

  return (
    <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2 space-y-1 mb-2">
      <p className="text-xs text-sky-600 font-medium">{label}</p>
      {pct != null && (
        <div className="w-full bg-sky-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-sky-500 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className="text-xs text-sky-400">
        初回のみダウンロードが必要です。以降はキャッシュから高速起動します。
      </p>
    </div>
  )
}

/** 公開前の「要約を入力してください」ダイアログ */
function SummaryNudgeDialog({ onGenerate, onSkip, onCancel, generating }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-sky-500" />
          <h2 className="text-sm font-bold text-gray-800">概要文が未入力です</h2>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">
          SNSシェア時に表示される概要文（OGP description）が設定されていません。
          AIで自動生成しますか？
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onGenerate}
            disabled={generating}
            className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" />生成中…</>
              : <><Sparkles className="w-4 h-4" />AIで自動生成して完了にする</>}
          </button>
          <button
            onClick={onSkip}
            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 rounded-xl transition-colors"
          >
            概要文なしで完了にする
          </button>
          <button
            onClick={onCancel}
            className="w-full text-sm text-sky-500 hover:text-sky-700 py-2 rounded-xl transition-colors"
          >
            キャンセルして編集に戻る
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Editor({ draft, onBack }) {
  const [title, setTitle]     = useState(draft?.title ?? '')
  const [body, setBody]       = useState(draft?.body ?? '')
  const [tags, setTags]       = useState(draft?.tags?.join(', ') ?? '')
  const [slug, setSlug]       = useState(draft?.slug ?? '')
  const [summary, setSummary] = useState(draft?.summary ?? '')
  const [ogImage, setOgImage] = useState(draft?.thumbnail ?? '')
  const [customMeta, setCustomMeta] = useState(draft?.customMeta ?? [])
  const [showPresets, setShowPresets] = useState(false)
  const [metaTemplates, setMetaTemplates] = useState([])
  const [tab, setTab]         = useState('write')
  // エディターモード: 'markdown' | 'richtext' | 'html'（設定から初期値を取得）
  const [editorMode, setEditorMode] = useState('markdown')
  // サイトテーマ（背景）
  const [background, setBackground] = useState('wordpress')
  // WordPress 専用フィールド
  const [categories, setCategories] = useState(draft?.categories?.join(', ') ?? '')
  const [scheduledAt, setScheduledAt] = useState(draft?.scheduledAt ?? '')
  const [seoKeyword, setSeoKeyword]   = useState(draft?.seoKeyword ?? '')
  // Obsidian 専用
  const [wikiDrafts, setWikiDrafts]   = useState([])
  const [showWikiPicker, setShowWikiPicker] = useState(false)
  const [showCalloutMenu, setShowCalloutMenu] = useState(false)
  // Markdown textarea の ref（Obsidian ツールバーの挿入用）
  const textareaRef = useRef(null)

  useEffect(() => {
    getSiteConfig().then(cfg => {
      const mode = cfg.defaultEditor ?? 'markdown'
      if (['markdown', 'richtext', 'html'].includes(mode)) setEditorMode(mode)
      const bg = cfg.background ?? 'wordpress'
      setBackground(bg)
      if (bg === 'obsidian') getDrafts().then(setWikiDrafts)
    })
  }, [])
  // リッチテキスト用 HTML（body は常に Markdown で保持）
  const [richHtml, setRichHtml] = useState(() => mdToHtml(draft?.body ?? ''))
  const [rawHtmlEdit, setRawHtmlEdit] = useState(() => mdToHtml(draft?.body ?? ''))
  const [saving, setSaving]   = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [draftId] = useState(draft?.id ?? null)
  const [status, setStatus]   = useState(draft?.status ?? 'draft')

  // 公開済みフラッシュ
  const [publishedFlash, setPublishedFlash] = useState(false)

  // サムネイル
  const [showGradientPicker, setShowGradientPicker]   = useState(false)
  const [gradientGenerating, setGradientGenerating]   = useState(false)
  const [showSiteNameOnThumb, setShowSiteNameOnThumb] = useState(true)

  // AI 要約
  const { modelStatus, progress, loadModel, summarize } = useSummarizer()
  const [aiRunning, setAiRunning] = useState(false)
  const [aiError, setAiError]     = useState(null)
  const [aiMethod, setAiMethod]   = useState(null)
  const [showNudge, setShowNudge] = useState(false)

  const addMeta = (name = '', content = '') => {
    setCustomMeta(m => [...m, { name, content }])
    setShowPresets(false)
  }
  const updateMeta = (idx, field, val) => {
    setCustomMeta(m => m.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }
  const removeMeta = (idx) => {
    setCustomMeta(m => m.filter((_, i) => i !== idx))
  }

  // スラグ自動生成
  const [slugManual, setSlugManual] = useState(!!draft?.slug)
  useEffect(() => {
    if (!slugManual) {
      setSlug(title.toLowerCase().replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, ''))
    }
  }, [title, slugManual])

  // 自動保存（3秒デバウンス）
  // リッチ or HTML モード中も Markdown に変換して保存
  const effectiveBody = editorMode === 'richtext'
    ? htmlToMd(richHtml)
    : editorMode === 'html'
    ? htmlToMd(rawHtmlEdit)
    : body

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!title && !effectiveBody) return
      setSaving(true)
      await saveDraft({
        id: draftId, title, body: effectiveBody,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        slug, summary, thumbnail: ogImage, customMeta, status,
        categories: categories.split(',').map(t => t.trim()).filter(Boolean),
        scheduledAt: scheduledAt || null,
        seoKeyword: seoKeyword || null,
      })
      setLastSaved(new Date())
      setSaving(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [title, effectiveBody, tags, slug, summary, ogImage, customMeta, status, categories, scheduledAt, seoKeyword])

  // meta タグテンプレートを OGP タブを開いたときにロード
  useEffect(() => {
    if (tab === 'ogp') {
      getMetaTemplates().then(setMetaTemplates)
    }
  }, [tab])

  const applyTemplate = (tpl) => {
    setCustomMeta(m => {
      const next = [...m]
      for (const tag of tpl.tags) {
        if (!next.some(t => t.name === tag.name)) {
          next.push({ ...tag })
        }
      }
      return next
    })
    setShowPresets(false)
  }

  const tocHeadings = extractHeadings(effectiveBody)
  const showToc = hasToc(tocHeadings)
  const previewRawHtml = editorMode === 'richtext'
    ? richHtml
    : editorMode === 'html'
    ? rawHtmlEdit
    : marked.parse(effectiveBody || '')
  const htmlWithIds = injectHeadingIds(previewRawHtml, tocHeadings)
  const html = DOMPurify.sanitize(htmlWithIds, { ADD_ATTR: ['id'] })

  // ── AI 要約の実行 ─────────────────────────────────────────────────
  const runAiSummarize = async () => {
    setAiRunning(true)
    setAiError(null)
    setAiMethod(null)
    try {
      if (modelStatus !== 'ready') {
        await loadModel()
      }
      const plain = mdToPlain(effectiveBody)
      const { summary: generated, method } = await summarize(plain)
      if (generated) {
        setSummary(generated.slice(0, 120))
        setAiMethod(method)
      }
    } catch (err) {
      setAiError('要約の生成に失敗しました: ' + err.message)
    } finally {
      setAiRunning(false)
    }
  }

  // ── エディターモード切り替え ─────────────────────────────────────
  const switchEditorMode = (next) => {
    if (next === editorMode) return
    // 現在の内容を次のモード用に変換
    if (editorMode === 'markdown') {
      const html = mdToHtml(body)
      setRichHtml(html)
      setRawHtmlEdit(html)
    } else if (editorMode === 'richtext') {
      // richHtml は RichTextEditor の onChange で常に最新
      const md = htmlToMd(richHtml)
      setBody(md)
      setRawHtmlEdit(richHtml)
    } else if (editorMode === 'html') {
      const md = htmlToMd(rawHtmlEdit)
      setBody(md)
      setRichHtml(rawHtmlEdit)
    }
    setEditorMode(next)
  }

  // ── 公開ボタン：status を 'published' に保存するのみ ──────────────
  const handlePublish = () => {
    if (!summary.trim()) {
      setShowNudge(true)
      return
    }
    doMarkPublished()
  }

  const doMarkPublished = async () => {
    setShowNudge(false)
    const now = new Date().toISOString()
    await saveDraft({
      id: draftId, title, body: effectiveBody,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      slug, summary, thumbnail: ogImage, customMeta,
      status: 'published',
      publishedAt: draft?.publishedAt ?? now,
      categories: categories.split(',').map(t => t.trim()).filter(Boolean),
      scheduledAt: scheduledAt || null,
      seoKeyword: seoKeyword || null,
    })
    setStatus('published')
    setLastSaved(new Date())
    // フラッシュ表示（2秒）
    setPublishedFlash(true)
    setTimeout(() => setPublishedFlash(false), 2500)
  }

  // ── 画像アップロード ──────────────────────────────────────────────
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // SVG はそのまま data URL に、それ以外は WebP に変換
      const base64 = shouldConvertToWebP(file.name)
        ? await imageToWebP(file, { maxW: 1200, maxH: 630 })
        : await file.text().then(t => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(t)))}`)
      setOgImage(base64)
    } catch {
      // 読み込み失敗は無視
    }
    e.target.value = ''
  }

  // ── グラデーションサムネイル生成 ──────────────────────────────────
  const handleGenerateGradient = async (preset) => {
    setGradientGenerating(true)
    try {
      let siteName = null
      if (showSiteNameOnThumb) {
        const cfg = await getSiteConfig()
        siteName = cfg.siteTitle?.trim() || 'AirPubre'
      }
      const base64 = await generateGradientThumbnail(title || 'AirPubre', preset, siteName)
      setOgImage(base64)
      setShowGradientPicker(false)
    } finally {
      setGradientGenerating(false)
    }
  }

  const handleNudgeGenerate = async () => {
    await runAiSummarize()
    setShowNudge(false)
    doMarkPublished()
  }
  const handleNudgeSkip = () => { setShowNudge(false); doMarkPublished() }
  const handleNudgeCancel = () => setShowNudge(false)

  // ── Obsidian: Markdown テキストエリアにカーソル位置で挿入 ──────────
  const insertAtCursor = (before, after = '') => {
    const el = textareaRef.current
    if (!el) { setBody(b => b + before + after); return }
    const start = el.selectionStart
    const end   = el.selectionEnd
    const sel   = el.value.slice(start, end)
    const newVal = el.value.slice(0, start) + before + sel + after + el.value.slice(end)
    setBody(newVal)
    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + before.length + sel.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  // Obsidian ワードカウント（Word テーマ共通）
  const wordCount = effectiveBody.trim()
    ? effectiveBody.trim().replace(/```[\s\S]*?```/g, '').split(/\s+/).filter(Boolean).length
    : 0
  const charCount = effectiveBody.replace(/\s/g, '').length

  return (
    <div className="space-y-4">
      {/* 公開前 Nudge ダイアログ */}
      {showNudge && (
        <SummaryNudgeDialog
          onGenerate={handleNudgeGenerate}
          onSkip={handleNudgeSkip}
          onCancel={handleNudgeCancel}
          generating={aiRunning}
        />
      )}

      {/* トップバー */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="text-sky-500 text-sm hover:text-sky-700">← 戻る</button>
        <div className="text-xs text-gray-400">
          {saving ? '保存中...' : lastSaved ? `保存済 ${lastSaved.toLocaleTimeString('ja-JP')}` : '自動保存'}
        </div>
        <div className="flex items-center gap-2">
          {/* 完了フラッシュ */}
          {publishedFlash && (
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium animate-pulse">
              <CheckCircle className="w-3.5 h-3.5" />
              掲載済みにしました
            </span>
          )}
          {/* 掲載済みバッジ（フラッシュ消えた後も表示） */}
          {!publishedFlash && status === 'published' && (
            <span className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded-lg font-medium">
              掲載済み
            </span>
          )}
          <button
            onClick={handlePublish}
            className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            {status === 'published' ? '内容を更新' : '下書き完了'}
          </button>
        </div>
      </div>

      {/* タイトル */}
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="タイトルを入力..."
        className="w-full text-xl font-bold text-gray-800 bg-transparent border-none outline-none placeholder-gray-300"
      />

      {/* タグ */}
      <input
        value={tags}
        onChange={e => setTags(e.target.value)}
        placeholder="タグ（カンマ区切り）"
        className="w-full text-sm text-gray-500 bg-transparent border-none outline-none placeholder-gray-300"
      />

      {/* タブ */}
      <div className="flex border-b border-sky-100">
        {[
          { id: 'write',   label: '編集' },
          { id: 'preview', label: 'プレビュー' },
          { id: 'ogp',     label: 'OGP / SEO', icon: Globe },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1 ${
              tab === t.id
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.icon && <t.icon className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        ))}
      </div>

      {/* 編集 */}
      {tab === 'write' && (
        <div className="space-y-2">
          {/* エディターモード切り替え */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {[
              { id: 'richtext', label: 'リッチテキスト', icon: Type },
              { id: 'markdown', label: 'Markdown',      icon: FileText },
              { id: 'html',     label: 'HTML',          icon: Code2 },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => switchEditorMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  editorMode === id
                    ? 'bg-white text-sky-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Obsidian ツールバー（Markdown モードのみ） */}
          {background === 'obsidian' && editorMode === 'markdown' && (
            <div className="flex items-center gap-1 flex-wrap px-2 py-1 bg-indigo-950 rounded-lg border border-indigo-800">
              {/* ハイライト */}
              <button
                type="button"
                title="ハイライト (==text==)"
                onMouseDown={e => { e.preventDefault(); insertAtCursor('==', '==') }}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded text-indigo-300 hover:bg-indigo-800 transition-colors"
              >
                <Highlighter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ハイライト</span>
              </button>
              {/* コールアウト */}
              <div className="relative">
                <button
                  type="button"
                  title="コールアウト"
                  onMouseDown={e => { e.preventDefault(); setShowCalloutMenu(v => !v); setShowWikiPicker(false) }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded text-indigo-300 hover:bg-indigo-800 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">コールアウト</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showCalloutMenu ? 'rotate-180' : ''}`} />
                </button>
                {showCalloutMenu && (
                  <div className="absolute left-0 top-8 z-20 bg-indigo-950 border border-indigo-700 rounded-lg shadow-xl py-1 w-40">
                    {[
                      { type: 'note',    icon: Info,          label: 'Note',    color: 'text-blue-400' },
                      { type: 'tip',     icon: Lightbulb,     label: 'Tip',     color: 'text-emerald-400' },
                      { type: 'warning', icon: AlertTriangle, label: 'Warning', color: 'text-amber-400' },
                      { type: 'danger',  icon: AlertTriangle, label: 'Danger',  color: 'text-red-400' },
                    ].map(({ type, icon: Icon, label, color }) => (
                      <button
                        key={type}
                        onMouseDown={e => {
                          e.preventDefault()
                          insertAtCursor(`> [!${type}]\n> `, '')
                          setShowCalloutMenu(false)
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-indigo-800 transition-colors ${color}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* ウィキリンク */}
              <div className="relative">
                <button
                  type="button"
                  title="ウィキリンク [[]]"
                  onMouseDown={e => { e.preventDefault(); setShowWikiPicker(v => !v); setShowCalloutMenu(false) }}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded text-indigo-300 hover:bg-indigo-800 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">リンク</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showWikiPicker ? 'rotate-180' : ''}`} />
                </button>
                {showWikiPicker && (
                  <div className="absolute left-0 top-8 z-20 bg-indigo-950 border border-indigo-700 rounded-lg shadow-xl py-1 w-56 max-h-52 overflow-y-auto">
                    <p className="px-3 py-1 text-xs text-indigo-400 font-medium">記事を選択</p>
                    {wikiDrafts.filter(d => d.id !== draft?.id && d.title).map(d => (
                      <button
                        key={d.id}
                        onMouseDown={e => {
                          e.preventDefault()
                          insertAtCursor(`[[${d.title}]]`, '')
                          setShowWikiPicker(false)
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-800 transition-colors truncate"
                      >
                        {d.title}
                      </button>
                    ))}
                    {wikiDrafts.filter(d => d.id !== draft?.id && d.title).length === 0 && (
                      <p className="px-3 py-2 text-xs text-indigo-500">記事がまだありません</p>
                    )}
                    <div className="border-t border-indigo-800 mt-1 pt-1">
                      <button
                        onMouseDown={e => {
                          e.preventDefault()
                          insertAtCursor('[[', ']]')
                          setShowWikiPicker(false)
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-800 transition-colors"
                      >
                        手動で入力: [[...]]
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {/* 文字数 */}
              <span className="ml-auto text-xs text-indigo-500 pr-1">{charCount}文字</span>
            </div>
          )}

          {/* Word ワードカウントバー */}
          {background === 'word' && (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-600">
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>{wordCount} 語</span>
              <span className="text-blue-400">|</span>
              <span>{charCount} 文字</span>
            </div>
          )}

          {/* Markdown モード（Word テーマ: アウトラインサイドバー付き） */}
          {editorMode === 'markdown' && background === 'word' ? (
            <div className="flex gap-3 items-start">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={`# 見出し\n\nMarkdownで記事を書こう！`}
                className="flex-1 min-h-[60vh] text-sm text-gray-700 font-mono bg-white rounded-xl border border-sky-100 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-sky-300 leading-relaxed"
              />
              {/* アウトラインサイドバー */}
              <div className="w-44 shrink-0 bg-blue-50 border border-blue-100 rounded-xl p-3 sticky top-16 max-h-[60vh] overflow-y-auto">
                <div className="flex items-center gap-1.5 mb-2">
                  <List className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold text-blue-700">アウトライン</span>
                </div>
                {tocHeadings.length === 0 ? (
                  <p className="text-xs text-blue-300">見出しがありません</p>
                ) : (
                  <ol className="space-y-1">
                    {tocHeadings.map((h, i) => (
                      <li
                        key={i}
                        className="text-xs text-blue-700 cursor-pointer hover:text-blue-900 transition-colors truncate"
                        style={{ paddingLeft: `${(h.level - 1) * 8}px` }}
                        onClick={() => {
                          const el = textareaRef.current
                          if (!el) return
                          const idx = body.indexOf(h.text)
                          if (idx !== -1) {
                            el.focus()
                            el.setSelectionRange(idx, idx + h.text.length)
                            el.scrollTop = el.scrollHeight * (idx / body.length)
                          }
                        }}
                      >
                        <ChevronRight className="inline w-2.5 h-2.5 mr-0.5 opacity-50" />
                        {h.text}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : editorMode === 'markdown' ? (
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`# 見出し\n\nMarkdownで記事を書こう！`}
              className="w-full min-h-[60vh] text-sm text-gray-700 font-mono bg-white rounded-xl border border-sky-100 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-sky-300 leading-relaxed"
            />
          ) : null}

          {/* リッチテキストモード */}
          {editorMode === 'richtext' && (
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[60vh] text-sm text-gray-400 bg-white rounded-xl border border-sky-100">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> エディター読み込み中…
              </div>
            }>
              <RichTextEditor
                html={richHtml}
                onChange={setRichHtml}
              />
            </Suspense>
          )}

          {/* HTML モード */}
          {editorMode === 'html' && (
            <textarea
              value={rawHtmlEdit}
              onChange={e => setRawHtmlEdit(e.target.value)}
              placeholder="<h1>見出し</h1><p>HTMLで書こう！</p>"
              className="w-full min-h-[60vh] text-sm text-gray-700 font-mono bg-gray-950 text-green-400 rounded-xl border border-gray-800 p-4 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500 leading-relaxed"
            />
          )}
        </div>
      )}

      {/* プレビュー */}
      {tab === 'preview' && (
        <div className="min-h-[60vh] bg-white rounded-xl border border-sky-100 overflow-hidden">
          {/* サムネイルヒーロー */}
          {ogImage && (
            <img
              src={ogImage}
              alt="thumbnail"
              className="w-full h-48 object-cover"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
          <div className="p-4">
            {showToc && <TocPreview headings={tocHeadings} />}
            <div
              className="prose-air"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      )}

      {/* OGP / SEO 設定パネル */}
      {tab === 'ogp' && (
        <div className="space-y-5 bg-white rounded-xl border border-sky-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-sky-500" />
            <span className="text-sm font-semibold text-gray-700">OGP / SEO 設定</span>
          </div>

          {/* WordPress 専用フィールド */}
          {background === 'wordpress' && (
            <div className="space-y-3 bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                WordPress 設定
              </p>
              {/* カテゴリ */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">カテゴリ（カンマ区切り）</label>
                <input
                  value={categories}
                  onChange={e => setCategories(e.target.value)}
                  placeholder="Tech, Life, Tips"
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              {/* 予約投稿 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  予約投稿日時
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {scheduledAt && (
                  <p className="text-xs text-blue-500 mt-1">
                    このデプロイ時点以降の日時が設定されています。ビルド時に未来日付として出力されます。
                  </p>
                )}
              </div>
              {/* SEO キーワード */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5" />
                  SEO フォーカスキーワード
                </label>
                <input
                  value={seoKeyword}
                  onChange={e => setSeoKeyword(e.target.value)}
                  placeholder="例: React パフォーマンス"
                  className="w-full px-3 py-2 rounded-lg border border-blue-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                {seoKeyword && (() => {
                  const kw = seoKeyword.toLowerCase()
                  const bodyLow = effectiveBody.toLowerCase()
                  const titleLow = title.toLowerCase()
                  const inTitle = titleLow.includes(kw)
                  const count = (bodyLow.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
                  return (
                    <div className={`mt-1.5 text-xs rounded-lg px-2.5 py-1.5 ${inTitle && count > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {inTitle ? 'タイトルに含まれています' : 'タイトルに含まれていません'} /
                      本文に {count} 回使用
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* スラグ */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">スラグ（URL）</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 shrink-0">example.com/</span>
              <input
                value={slug}
                onChange={e => { setSlug(e.target.value); setSlugManual(true) }}
                placeholder="my-post-title"
                className="flex-1 px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 font-mono"
              />
            </div>
          </div>

          {/* OGP概要文 + AI 要約ボタン */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">
                概要文 / OGP description
                <span className="ml-2 text-gray-400 font-normal">({summary.length}/120文字)</span>
              </label>
              <button
                onClick={runAiSummarize}
                disabled={aiRunning || !body.trim()}
                title="本文からAIが要約を自動生成（ローカル実行・APIキー不要）"
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-sky-200 text-sky-600 hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {aiRunning
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中…</>
                  : <><Sparkles className="w-3.5 h-3.5" />AIで要約</>}
              </button>
            </div>

            {modelStatus === 'loading' && <ModelProgressBar progress={progress} />}

            {aiMethod && !aiRunning && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  aiMethod === 'ai'
                    ? 'bg-purple-100 text-purple-600'
                    : 'bg-amber-100 text-amber-600'
                }`}>
                  {aiMethod === 'ai' ? '✨ AIモデルで生成' : '📝 抽出型要約'}
                </span>
                <span className="text-xs text-gray-400">手動で編集できます</span>
              </div>
            )}

            {aiError && <p className="text-xs text-red-400 mb-1">{aiError}</p>}

            <textarea
              value={summary}
              onChange={e => { setSummary(e.target.value); setAiMethod(null) }}
              placeholder="SNSシェア時に表示される説明文。空欄の場合は本文から自動生成されます。"
              rows={3}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
            />
          </div>

          {/* サムネイル / OGP画像 */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-500">サムネイル / OGP画像</label>

            {/* 現在の画像プレビュー */}
            {ogImage && (
              <div className="relative">
                <img
                  src={ogImage}
                  alt="thumbnail preview"
                  className="w-full h-36 object-cover rounded-xl border border-sky-100"
                />
                <button
                  onClick={() => setOgImage('')}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 transition-colors"
                  title="削除"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* URL 入力 */}
            <input
              value={ogImage.startsWith('data:') ? '' : ogImage}
              onChange={e => setOgImage(e.target.value)}
              placeholder="https://example.com/thumbnail.png"
              className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />

            {/* アップロード / グラデーション生成ボタン */}
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-sky-200 text-sky-600 hover:bg-sky-50 cursor-pointer transition-colors">
                <ImagePlus className="w-3.5 h-3.5" />
                画像をアップロード
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
              <button
                onClick={() => setShowGradientPicker(v => !v)}
                disabled={gradientGenerating}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                  showGradientPicker
                    ? 'border-sky-400 bg-sky-50 text-sky-700'
                    : 'border-sky-200 text-sky-600 hover:bg-sky-50'
                } disabled:opacity-40`}
              >
                {gradientGenerating
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />生成中…</>
                  : <><Palette className="w-3.5 h-3.5" />グラデーション生成</>}
              </button>
            </div>

            {/* グラデーションプリセット */}
            {showGradientPicker && (
              <div className="flex flex-wrap gap-2 p-3 bg-sky-50 rounded-xl border border-sky-100">
                <p className="w-full text-xs text-gray-400 mb-1">カラーを選んで生成</p>

                {/* ブログ名表示チェックボックス */}
                <label className="w-full flex items-center gap-2 cursor-pointer select-none mb-1">
                  <input
                    type="checkbox"
                    checked={showSiteNameOnThumb}
                    onChange={e => setShowSiteNameOnThumb(e.target.checked)}
                    className="w-3.5 h-3.5 accent-sky-500"
                  />
                  <span className="text-xs text-gray-600">ブログ名を表示する</span>
                </label>

                {GRADIENT_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => handleGenerateGradient(preset)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white border border-sky-100 hover:border-sky-300 transition-colors shadow-sm"
                  >
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                    />
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* SNSプレビューカード */}
          {(title || summary || ogImage) && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <p className="text-xs text-gray-400 px-3 pt-2 pb-1">SNSシェアプレビュー</p>
              {ogImage && (
                <img
                  src={ogImage}
                  alt="OG image"
                  className="w-full h-32 object-cover"
                  onError={e => { e.target.style.display = 'none' }}
                />
              )}
              <div className="px-3 py-2 bg-gray-50">
                <p className="text-xs text-gray-400">example.com</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5 line-clamp-1">{title || 'タイトル'}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{summary || '概要文がここに表示されます'}</p>
              </div>
            </div>
          )}

          {/* カスタム meta タグ */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500">カスタム meta タグ</label>
              <div className="relative">
                <button
                  onClick={() => setShowPresets(v => !v)}
                  className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  追加
                  <ChevronDown className={`w-3 h-3 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
                </button>
                {showPresets && (
                  <div className="absolute right-0 top-6 z-10 bg-white border border-sky-100 rounded-xl shadow-lg py-1 w-56 max-h-80 overflow-y-auto">
                    <button
                      onClick={() => addMeta('', '')}
                      className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-sky-50 transition-colors font-medium"
                    >
                      空のタグを追加
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <p className="px-3 py-0.5 text-xs text-gray-400 font-medium">クイック追加</p>
                    {META_PRESETS.map(p => (
                      <button
                        key={p.name}
                        onClick={() => addMeta(p.name, p.content)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-sky-50 transition-colors"
                      >
                        <span className="font-mono text-sky-600">{p.label}</span>
                      </button>
                    ))}
                    {metaTemplates.length > 0 && (
                      <>
                        <div className="border-t border-gray-100 my-1" />
                        <p className="px-3 py-0.5 text-xs text-gray-400 font-medium">テンプレートから追加</p>
                        {metaTemplates.map(tpl => (
                          <button
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-sky-50 transition-colors"
                          >
                            <span className="text-gray-700">{tpl.name}</span>
                            <span className="ml-1.5 text-gray-400">({tpl.tags.length}個)</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {customMeta.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">
                「追加」から任意のmetaタグを追加できます（例: fediverse:creator）
              </p>
            ) : (
              <div className="space-y-2">
                {customMeta.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={item.name}
                      onChange={e => updateMeta(idx, 'name', e.target.value)}
                      placeholder="name"
                      className="w-2/5 px-2.5 py-2 rounded-lg border border-sky-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <input
                      value={item.content}
                      onChange={e => updateMeta(idx, 'content', e.target.value)}
                      placeholder="content"
                      className="flex-1 px-2.5 py-2 rounded-lg border border-sky-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300"
                    />
                    <button
                      onClick={() => removeMeta(idx)}
                      className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="mt-2 bg-gray-900 rounded-lg px-3 py-2 space-y-0.5">
                  {customMeta.filter(m => m.name).map((m, i) => (
                    <p key={i} className="text-xs font-mono text-green-400">
                      {`<meta name="${m.name}" content="${m.content}">`}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
