import { useState } from 'react'
import { Github, Triangle, Package, GitBranch, Globe } from 'lucide-react'

const ICONS = {
  github: Github,
  vercel: Triangle,
  zip: Package,
}

const ICON_COLORS = {
  github: 'text-gray-700',
  vercel: 'text-black',
  zip: 'text-sky-500',
}

export default function StepDeploy({ data, next }) {
  const [pendingTarget, setPendingTarget] = useState(null)

  const targets = [
    {
      id: 'github',
      label: 'GitHub Pages',
      desc: 'GitHubリポジトリと連携して自動公開',
      pro: true,
    },
    {
      id: 'vercel',
      label: 'Vercel',
      desc: '「Vercelでログイン」ボタンで簡単連携',
      pro: false,
    },
    {
      id: 'zip',
      label: 'ZIPダウンロード',
      desc: 'ビルド済みファイルをZIPで受け取る。FTPやレンサバに手動アップ',
      pro: false,
    },
  ]

  const available = data.mode === 'pro'
    ? targets
    : targets.filter(t => !t.pro)

  const handleSelect = (id) => {
    // Vercel + 玄人モード → GitHub インポート質問を挟む
    if (id === 'vercel' && data.mode === 'pro') {
      setPendingTarget('vercel')
    } else {
      next({ deployTarget: id, vercelFromGitHub: null })
    }
  }

  // ── Vercel 追加質問 ──────────────────────────────────────────
  if (pendingTarget === 'vercel') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-black flex items-center justify-center">
            <Triangle className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Vercel の使い方を教えて</h2>
          <p className="text-sm text-gray-500">
            デプロイの仕組みによって<br />設定方法が変わります。
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => next({ deployTarget: 'vercel', vercelFromGitHub: true })}
            className="w-full p-4 rounded-2xl border-2 border-sky-100 bg-white hover:border-sky-400 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-sky-50 transition-colors">
                <GitBranch className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <div className="font-bold text-gray-800 group-hover:text-sky-600">GitHubリポジトリからデプロイ</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Vercel がリポジトリを監視して自動デプロイ。よくある構成です
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => next({ deployTarget: 'vercel', vercelFromGitHub: false })}
            className="w-full p-4 rounded-2xl border-2 border-sky-100 bg-white hover:border-sky-400 hover:shadow-md transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-sky-50 transition-colors">
                <Globe className="w-4 h-4 text-sky-500" />
              </div>
              <div>
                <div className="font-bold text-gray-800 group-hover:text-sky-600">Vercel Deploy API で直接デプロイ</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  AirPubre から Vercel API を叩いて直接アップロード
                </div>
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={() => setPendingTarget(null)}
          className="w-full text-sm text-gray-400 hover:text-gray-600 py-2"
        >
          ← 戻る
        </button>
      </div>
    )
  }

  // ── デプロイ先選択（通常） ────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-gray-800">デプロイ先を選ぶ</h2>
        <p className="text-sm text-gray-500">
          記事を公開する場所を選んでください。<br />あとから追加・変更もできます。
        </p>
      </div>

      <div className="space-y-3">
        {available.map(t => {
          const Icon = ICONS[t.id]
          return (
            <button
              key={t.id}
              onClick={() => handleSelect(t.id)}
              className="w-full p-4 rounded-2xl border-2 border-sky-100 bg-white hover:border-sky-400 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-sky-50 transition-colors">
                  <Icon className={`w-4 h-4 ${ICON_COLORS[t.id]}`} />
                </div>
                <div>
                  <div className="font-bold text-gray-800 group-hover:text-sky-600">{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.desc}</div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {data.mode === 'easy' && (
        <p className="text-center text-xs text-gray-400">
          玄人モードに切り替えると GitHub Pages も選べます
        </p>
      )}
    </div>
  )
}
