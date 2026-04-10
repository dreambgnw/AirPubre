import { useState } from 'react'
import { Feather, Wrench, RefreshCw, Loader2 } from 'lucide-react'

const RAW_BASE = 'https://raw.githubusercontent.com'

export default function StepMode({ next }) {
  const [showSync, setShowSync] = useState(false)
  const [syncRepo, setSyncRepo] = useState('')
  const [syncToken, setSyncToken] = useState('')
  const [syncBranch, setSyncBranch] = useState('main')
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState(null)

  const handleSync = async () => {
    setSyncError(null)
    const repo = syncRepo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '')
    if (!repo.includes('/')) {
      setSyncError('owner/repo 形式で入力してください')
      return
    }
    setSyncLoading(true)
    try {
      const url = `${RAW_BASE}/${repo}/${syncBranch.trim() || 'main'}/.airpubre/config.json`
      const headers = syncToken.trim() ? { Authorization: `Bearer ${syncToken.trim()}` } : {}
      const res = await fetch(url, { headers })
      if (!res.ok) throw new Error(res.status === 404
        ? '.airpubre/config.json が見つかりません。先に別デバイスからデプロイしてください。'
        : `取得に失敗しました (${res.status})`)
      const config = await res.json()

      // saveSiteConfig で非秘匿設定を書き込む
      const { saveSiteConfig, getSiteConfig } = await import('../../lib/storage.js')
      const existing = await getSiteConfig()
      const merged = { ...existing }
      for (const [k, v] of Object.entries(config)) {
        if (v && !['githubToken', 'vercelToken', 'syncPassphrase'].includes(k)) {
          merged[k] = v
        }
      }
      // トークンも入力されていれば保存
      if (syncToken.trim()) merged.githubToken = syncToken.trim()
      merged.githubRepo = repo
      await saveSiteConfig(merged)

      // mode を判定して次のステップへ
      const mode = merged.deployTarget === 'github' || merged.deployTarget === 'headless-github' ? 'pro' : 'easy'
      next({ mode, deployTarget: merged.deployTarget })
    } catch (e) {
      setSyncError(e.message)
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-gray-800">ようこそ！</h1>
        <p className="text-gray-500 text-sm">どちらのモードで始めますか？</p>
      </div>

      <div className="space-y-3 pt-4">
        <button
          onClick={() => next({ mode: 'easy' })}
          className="w-full p-5 rounded-2xl border-2 border-sky-200 bg-white hover:border-sky-400 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center shrink-0 group-hover:bg-sky-100 transition-colors">
              <Feather className="w-5 h-5 text-sky-500" />
            </div>
            <div>
              <div className="font-bold text-gray-800 group-hover:text-sky-600">かんたんモード</div>
              <div className="text-sm text-gray-500 mt-1">
                GitHubアカウント不要。<br />メールアドレスだけで始められます。
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => next({ mode: 'pro' })}
          className="w-full p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-sky-400 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-sky-50 transition-colors">
              <Wrench className="w-5 h-5 text-gray-400 group-hover:text-sky-500 transition-colors" />
            </div>
            <div>
              <div className="font-bold text-gray-800 group-hover:text-sky-600">玄人モード</div>
              <div className="text-sm text-gray-500 mt-1">
                GitHubと連携して、<br />自動デプロイなどフル機能を使えます。
              </div>
            </div>
          </div>
        </button>
      </div>

      <p className="text-center text-xs text-gray-400 pt-2">あとから変更することもできます</p>

      {/* 別デバイスからの同期 */}
      <div className="border-t border-sky-100 pt-4">
        <button
          onClick={() => setShowSync(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-sky-500 hover:text-sky-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          別のデバイスで設定済みですか？
        </button>

        {showSync && (
          <div className="mt-3 p-4 rounded-2xl border border-sky-100 bg-sky-50/40 space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              別のデバイスから AirPubre でデプロイ済みのリポジトリを指定すると、設定を引き継げます。
            </p>
            <input
              type="text"
              value={syncRepo}
              onChange={e => setSyncRepo(e.target.value)}
              placeholder="owner/repo"
              className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <input
              type="password"
              value={syncToken}
              onChange={e => setSyncToken(e.target.value)}
              placeholder="Token（private リポジトリのみ）"
              className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <input
              type="text"
              value={syncBranch}
              onChange={e => setSyncBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            {syncError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{syncError}</p>
            )}
            <button
              onClick={handleSync}
              disabled={!syncRepo.trim() || syncLoading}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                syncRepo.trim() && !syncLoading
                  ? 'bg-sky-500 hover:bg-sky-600 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {syncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '設定をインポート'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
