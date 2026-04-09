import { useState, useEffect } from 'react'
import { Plus, Upload, LayoutDashboard, FileText, Settings as SettingsIcon, RefreshCw, X, AlertTriangle } from 'lucide-react'
import Editor from './Editor/Editor.jsx'
import DraftList from './Editor/DraftList.jsx'
import Dashboard from './Dashboard.jsx'
import ImportModal from './Import/ImportModal.jsx'
import Settings from './Settings/Settings.jsx'
import { getSiteConfig } from '../lib/storage.js'
import { importFromGitHub } from '../lib/githubImporter.js'

// ── PC サイドバー ─────────────────────────────────────────────────

function Sidebar({ view, onNavigate, onNewPost, onImport, siteTitle }) {
  const navItems = [
    {
      id: 'dashboard',
      label: 'ダッシュボード',
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: 'home',
      label: '記事一覧',
      icon: <FileText className="w-4 h-4" />,
    },
    {
      id: 'settings',
      label: '設定',
      icon: <SettingsIcon className="w-4 h-4" />,
    },
  ]

  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-sky-100 min-h-screen sticky top-0 h-screen">
      {/* ロゴ */}
      <div className="px-5 py-5 border-b border-sky-50">
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-xl bg-sky-500 flex items-center justify-center shadow-sm group-hover:bg-sky-600 transition-colors">
            <span className="text-white text-xs font-bold tracking-tight">AP</span>
          </div>
          <span className="text-base font-bold text-gray-800">
            Air<span className="text-sky-500">Pubre</span>
          </span>
        </button>
      </div>

      {/* アクション */}
      <div className="px-3 py-4 space-y-1.5">
        <button
          onClick={onNewPost}
          className="w-full flex items-center gap-2.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          新規投稿
        </button>
        <button
          onClick={onImport}
          className="w-full flex items-center gap-2.5 border border-sky-200 text-sky-600 hover:bg-sky-50 text-sm font-medium px-3 py-2 rounded-xl transition-colors"
        >
          <Upload className="w-4 h-4" />
          インポート
        </button>
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2.5 text-sm font-medium px-3 py-2.5 rounded-xl transition-colors text-left ${
              view === item.id
                ? 'bg-sky-50 text-sky-600'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* サイト名（設定から取得） */}
      {siteTitle && (
        <div className="px-4 py-4 border-t border-sky-50">
          <p className="text-xs text-gray-400 truncate">{siteTitle}</p>
        </div>
      )}
    </aside>
  )
}

// ── モバイル ヘッダー ─────────────────────────────────────────────

function MobileHeader({ view, onHome, onNewPost, onImport }) {
  return (
    <header className="md:hidden bg-white border-b border-sky-100 sticky top-0 z-10 shadow-sm">
      <div className="px-4 py-3 flex items-center justify-between">
        <button onClick={onHome} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">AP</span>
          </div>
          <span className="text-lg font-bold text-gray-800">
            Air<span className="text-sky-500">Pubre</span>
          </span>
        </button>
        {view !== 'editor' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onImport}
              className="border border-sky-200 text-sky-500 hover:bg-sky-50 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>インポート</span>
            </button>
            <button
              onClick={onNewPost}
              className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新規投稿</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

// ── モバイル ボトムナビ ───────────────────────────────────────────

function MobileBottomNav({ view, onNavigate, onNewPost }) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-sky-100 flex justify-around py-2 z-10 safe-area-pb">
      <button
        onClick={() => onNavigate('dashboard')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${view === 'dashboard' ? 'text-sky-500' : 'text-gray-400'}`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-xs font-medium">ホーム</span>
      </button>

      <button
        onClick={() => onNavigate('home')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${view === 'home' ? 'text-sky-500' : 'text-gray-400'}`}
      >
        <FileText className="w-5 h-5" />
        <span className="text-xs font-medium">記事</span>
      </button>

      {/* 中央の新規投稿ボタン（大きめ） */}
      <button
        onClick={onNewPost}
        className="flex flex-col items-center gap-0.5 px-3 -mt-4"
      >
        <div className="w-12 h-12 rounded-2xl bg-sky-500 hover:bg-sky-600 flex items-center justify-center shadow-lg transition-colors">
          <Plus className="w-6 h-6 text-white" />
        </div>
      </button>

      <button
        onClick={() => onNavigate('settings')}
        className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${view === 'settings' ? 'text-sky-500' : 'text-gray-400'}`}
      >
        <SettingsIcon className="w-5 h-5" />
        <span className="text-xs font-medium">設定</span>
      </button>
    </nav>
  )
}

// ── PC コンテンツ ヘッダー ────────────────────────────────────────

function DesktopContentHeader({ view, onNewPost, onImport }) {
  const titles = {
    dashboard: 'ダッシュボード',
    home:      '記事一覧',
    settings:  '設定',
    editor:    '記事を編集',
  }

  return (
    <div className="hidden md:flex items-center justify-between mb-6">
      <h1 className="text-xl font-bold text-gray-800">{titles[view] ?? ''}</h1>
      {view !== 'editor' && view !== 'dashboard' && (
        <div className="flex items-center gap-2">
          {view === 'home' && (
            <button
              onClick={onImport}
              className="border border-sky-200 text-sky-600 hover:bg-sky-50 text-sm font-medium px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              インポート
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── ハッシュルーティング ──────────────────────────────────────────

const VALID_VIEWS = ['dashboard', 'home', 'settings']

function hashToView() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  // editor はドラフトのコンテキストが必要なのでリロード時はhomeへ
  return VALID_VIEWS.includes(hash) ? hash : 'dashboard'
}

function navigate(view, replace = false) {
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method](null, '', `#${view}`)
}

// ── メイン ────────────────────────────────────────────────────────

export default function AdminShell({ authLevel, onElevate }) {
  const [view, setView] = useState(hashToView)
  const [editingDraft, setEditingDraft] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [siteTitle, setSiteTitle] = useState('')
  const [autoPullStatus, setAutoPullStatus] = useState(null) // null | { state, result?, error? }

  // 初期URLを正規化（hashが空やeditorなら置き換え）
  useEffect(() => {
    navigate(view, true)
  }, [])

  // 起動時自動 pull（headless モード ＋ オプトイン時のみ）
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await getSiteConfig()
      if (cancelled) return
      if (cfg.deployTarget !== 'headless-github' || !cfg.headlessAutoPullOnStart) return
      const [owner, repo] = (cfg.githubRepo ?? '').split('/')
      if (!owner || !repo) return

      setAutoPullStatus({ state: 'running' })
      try {
        const result = await importFromGitHub({
          owner, repo,
          branch: cfg.githubBranch || 'main',
          postsDir: cfg.headlessPostsDir,
          thumbnailsDir: cfg.headlessThumbnailsDir,
          token: cfg.githubToken,
        })
        if (cancelled) return
        setAutoPullStatus({ state: 'done', result })
        setRefreshKey(k => k + 1)
      } catch (e) {
        if (cancelled) return
        setAutoPullStatus({ state: 'error', error: e.message })
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ブラウザの戻る・進む
  useEffect(() => {
    const onPop = () => {
      const v = hashToView()
      setView(v)
      if (v !== 'editor') setEditingDraft(null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    getSiteConfig().then(c => setSiteTitle(c.siteTitle))
  }, [])

  const goTo = (v) => {
    navigate(v)
    setView(v)
  }

  const openEditor = (draft = null) => {
    navigate('editor')
    setEditingDraft(draft)
    setView('editor')
  }

  const handleImported = () => setRefreshKey(k => k + 1)

  return (
    <div className="min-h-screen bg-sky-50 flex">
      {/* PC サイドバー */}
      <Sidebar
        view={view}
        onNavigate={goTo}
        onNewPost={() => openEditor()}
        onImport={() => setShowImport(true)}
        siteTitle={siteTitle}
      />

      {/* 右側コンテンツ全体 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* モバイル ヘッダー */}
        <MobileHeader
          view={view}
          onHome={() => goTo('dashboard')}
          onNewPost={() => openEditor()}
          onImport={() => setShowImport(true)}
        />

        {/* インポートモーダル */}
        {showImport && (
          <ImportModal
            onClose={() => setShowImport(false)}
            onImported={handleImported}
          />
        )}

        {/* 起動時自動 pull バナー */}
        {autoPullStatus && (
          <AutoPullBanner status={autoPullStatus} onClose={() => setAutoPullStatus(null)} />
        )}

        {/* メインコンテンツ */}
        <main className={`flex-1 w-full mx-auto px-4 py-6 ${
          view === 'editor'
            ? 'max-w-3xl'
            : 'max-w-4xl'
        } ${view !== 'editor' ? 'pb-24 md:pb-8' : ''}`}>

          {/* PC 用コンテンツヘッダー */}
          <DesktopContentHeader
            view={view}
            onNewPost={() => openEditor()}
            onImport={() => setShowImport(true)}
          />

          {view === 'dashboard' && (
            <Dashboard
              onOpen={openEditor}
              onNewPost={() => openEditor()}
              onImport={() => setShowImport(true)}
              onNavigate={goTo}
              refreshKey={refreshKey}
            />
          )}
          {view === 'home' && (
            <DraftList onOpen={openEditor} refreshKey={refreshKey} />
          )}
          {view === 'editor' && (
            <Editor
              draft={editingDraft}
              onBack={() => goTo('home')}
            />
          )}
          {view === 'settings' && (
            <Settings />
          )}
        </main>

        {/* モバイル ボトムナビ（エディター中は非表示） */}
        {view !== 'editor' && (
          <MobileBottomNav
            view={view}
            onNavigate={goTo}
            onNewPost={() => openEditor()}
          />
        )}
      </div>
    </div>
  )
}

// ── 起動時自動 pull バナー ────────────────────────────────────────
function AutoPullBanner({ status, onClose }) {
  const { state, result, error } = status

  // 完了から 6 秒後に自動で消す（競合があった時は消さない）
  useEffect(() => {
    if (state === 'done' && result && result.skipped === 0) {
      const t = setTimeout(onClose, 6000)
      return () => clearTimeout(t)
    }
  }, [state, result, onClose])

  let body = null
  let tone = 'sky'

  if (state === 'running') {
    body = (
      <>
        <RefreshCw className="w-4 h-4 animate-spin text-sky-500 shrink-0" />
        <span>GitHub から記事を取り込み中…</span>
      </>
    )
  } else if (state === 'done') {
    if (result.imported === 0 && result.skipped === 0) return null
    if (result.skipped > 0) {
      tone = 'amber'
      body = (
        <>
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">同期完了：{result.imported} 件取り込み、{result.skipped} 件はローカルの未デプロイ変更を保護してスキップ</p>
            {result.skippedSlugs?.length > 0 && (
              <p className="text-xs text-amber-700/80 mt-0.5 truncate">
                保護中: <span className="font-mono">{result.skippedSlugs.slice(0, 3).join(', ')}</span>
                {result.skippedSlugs.length > 3 && ` 他 ${result.skippedSlugs.length - 3} 件`}
              </p>
            )}
          </div>
        </>
      )
    } else {
      body = (
        <>
          <RefreshCw className="w-4 h-4 text-sky-500 shrink-0" />
          <span>{result.imported} 件の記事を GitHub から取り込みました</span>
        </>
      )
    }
  } else if (state === 'error') {
    tone = 'rose'
    body = (
      <>
        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
        <span className="truncate">自動同期に失敗: {error}</span>
      </>
    )
  }

  const toneClasses = {
    sky:   'bg-sky-50 border-sky-200 text-sky-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose:  'bg-rose-50 border-rose-200 text-rose-800',
  }[tone]

  return (
    <div className={`mx-4 mt-3 px-3 py-2 rounded-xl border text-sm flex items-center gap-2 ${toneClasses}`}>
      {body}
      <button
        onClick={onClose}
        className="ml-auto text-current opacity-50 hover:opacity-100 transition-opacity shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
