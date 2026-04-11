import { useState, useEffect } from 'react'
import { FileText, Globe, Edit3, Clock, Plus, Upload, RefreshCw, Loader2, Save, CheckCircle, X, Zap } from 'lucide-react'
import { getDrafts, getSiteConfig } from '../lib/storage.js'
import { fetchRepoFile, pushRepoFile } from '../lib/githubFile.js'

function StatCard({ icon: Icon, label, value, color = 'sky' }) {
  const colors = {
    sky:   { bg: 'bg-sky-50',   text: 'text-sky-600',   icon: 'text-sky-400' },
    green: { bg: 'bg-green-50', text: 'text-green-600', icon: 'text-green-400' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-400' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-600', icon: 'text-slate-400' },
  }
  const c = colors[color]
  return (
    <div className={`${c.bg} rounded-2xl p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
      </div>
    </div>
  )
}

function RecentArticleRow({ draft, onOpen }) {
  const isPublished = draft.status === 'published'
  const date = draft.updatedAt
    ? new Date(draft.updatedAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
    : '—'

  return (
    <button
      onClick={() => onOpen(draft)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-sky-50 transition-colors text-left group rounded-xl"
    >
      {draft.thumbnail ? (
        <img
          src={draft.thumbnail}
          alt=""
          className="w-12 h-9 rounded-lg object-cover shrink-0 bg-sky-100"
        />
      ) : (
        <div className="w-12 h-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-sky-300" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-sky-600 transition-colors">
          {draft.title || '（無題）'}
        </p>
        <p className="text-xs text-gray-400">{date}</p>
      </div>

      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
        isPublished
          ? 'bg-green-100 text-green-600'
          : 'bg-amber-100 text-amber-600'
      }`}>
        {isPublished ? '掲載済み' : '下書き'}
      </span>
    </button>
  )
}

// ── /now ウィジェット ──────────────────────────────────────────────

function NowEditor() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [config, setConfig] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getSiteConfig().then(cfg => {
      setConfig(cfg)
      if (cfg.deployTarget !== 'headless-github' || !cfg.githubToken) {
        setLoading(false)
        return
      }
      const [owner, repo] = (cfg.githubRepo ?? '').split('/')
      if (!owner || !repo) { setLoading(false); return }
      fetchRepoFile({ owner, repo, branch: cfg.githubBranch || 'main', path: 'now.json', token: cfg.githubToken })
        .then(text => {
          if (text) setData(JSON.parse(text))
          setLoading(false)
        })
        .catch(() => setLoading(false))
    })
  }, [])

  if (loading || !config || config.deployTarget !== 'headless-github' || !data) return null

  const updateField = (key, value) => {
    setData(d => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const updateListItem = (key, idx, value) => {
    setData(d => {
      const list = [...(d[key] || [])]
      list[idx] = value
      return { ...d, [key]: list }
    })
    setSaved(false)
  }

  const addListItem = (key, empty) => {
    setData(d => ({ ...d, [key]: [...(d[key] || []), empty] }))
    setSaved(false)
  }

  const removeListItem = (key, idx) => {
    setData(d => ({ ...d, [key]: (d[key] || []).filter((_, i) => i !== idx) }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const [owner, repo] = config.githubRepo.split('/')
      const updated = { ...data, updated: new Date().toISOString().split('T')[0] }
      await pushRepoFile({
        owner, repo,
        branch: config.githubBranch || 'main',
        path: 'now.json',
        content: JSON.stringify(updated, null, 4),
        token: config.githubToken,
        message: 'update: now.json via AirPubre',
      })
      setData(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-sky-50 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-sky-50 hover:bg-sky-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-gray-700">/now</h2>
          <span className="text-xs text-gray-400">更新: {data.updated || '—'}</span>
        </div>
        <span className={`text-xs text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* Music */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600">Music</label>
            {(data.music || []).map((m, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={m.title}
                  onChange={e => updateListItem('music', i, { ...m, title: e.target.value })}
                  placeholder="曲名"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <input
                  value={m.artist}
                  onChange={e => updateListItem('music', i, { ...m, artist: e.target.value })}
                  placeholder="アーティスト"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <button onClick={() => removeListItem('music', i)} className="text-gray-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => addListItem('music', { title: '', artist: '' })} className="text-xs text-sky-500 hover:text-sky-700">+ 追加</button>
          </div>

          {/* Into */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600">Into</label>
            {(data.into || []).map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={item}
                  onChange={e => updateListItem('into', i, e.target.value)}
                  placeholder="ハマっていること"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <button onClick={() => removeListItem('into', i)} className="text-gray-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => addListItem('into', '')} className="text-xs text-sky-500 hover:text-sky-700">+ 追加</button>
          </div>

          {/* Doing */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600">Doing</label>
            {(data.doing || []).map((item, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={item}
                  onChange={e => updateListItem('doing', i, e.target.value)}
                  placeholder="今やっていること"
                  className="flex-1 px-2 py-1.5 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                />
                <button onClick={() => removeListItem('doing', i)} className="text-gray-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <button onClick={() => addListItem('doing', '')} className="text-xs text-sky-500 hover:text-sky-700">+ 追加</button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? '保存しました' : '保存して push'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function Dashboard({ onOpen, onNewPost, onImport, onNavigate, refreshKey }) {
  const [drafts, setDrafts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDrafts().then(d => {
      setDrafts(d)
      setLoading(false)
    })
  }, [refreshKey])

  const total     = drafts.length
  const published = drafts.filter(d => d.status === 'published').length
  const draftCount = drafts.filter(d => d.status !== 'published').length

  // 最終デプロイ
  const lastDeployed = drafts
    .map(d => d.lastDeployedAt)
    .filter(Boolean)
    .sort()
    .at(-1)

  const lastDeployedStr = lastDeployed
    ? new Date(lastDeployed).toLocaleString('ja-JP', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'まだなし'

  // 最近の記事（更新日降順）
  const recent = [...drafts]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, 5)

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── クイックアクション ───────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={onNewPost}
          className="flex items-center gap-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新規投稿
        </button>
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2 border border-sky-200 text-sky-600 hover:bg-sky-50 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          サイトを更新
        </button>
        <button
          onClick={onImport}
          className="flex items-center gap-2 border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
        >
          <Upload className="w-4 h-4" />
          インポート
        </button>
      </div>

      {/* ── 統計カード ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={FileText} label="全記事"  value={total}     color="sky"   />
        <StatCard icon={Globe}    label="掲載済み" value={published} color="green" />
        <StatCard icon={Edit3}    label="下書き"   value={draftCount} color="amber" />
        <StatCard icon={Clock}    label="最終デプロイ" value={lastDeployedStr} color="slate" />
      </div>

      {/* ── 最近の記事 ──────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-sm border border-sky-50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-sky-50">
          <h2 className="text-sm font-bold text-gray-700">最近の記事</h2>
          <button
            onClick={() => onNavigate('home')}
            className="text-xs text-sky-500 hover:text-sky-600 font-medium"
          >
            すべて見る →
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-400">記事がまだありません</p>
            <button
              onClick={onNewPost}
              className="mt-3 text-sm text-sky-500 hover:text-sky-600 font-medium"
            >
              最初の記事を書く →
            </button>
          </div>
        ) : (
          <div className="py-1">
            {recent.map(d => (
              <RecentArticleRow key={d.id} draft={d} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>

      {/* ── /now エディター ─────────────────────── */}
      <NowEditor />
    </div>
  )
}
