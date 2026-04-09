import { useState, useEffect } from 'react'
import { FileText, Globe, Edit3, Clock, Plus, Upload, RefreshCw } from 'lucide-react'
import { getDrafts } from '../lib/storage.js'

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
    </div>
  )
}
