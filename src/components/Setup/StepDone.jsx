import { useEffect, useState } from 'react'
import { hashKey } from '../../lib/crypto.js'
import { saveAuthInfo, saveSetupState, getSiteConfig, saveSiteConfig } from '../../lib/storage.js'

const BACKGROUND_LABELS = {
  obsidian:  'Obsidian',
  wordpress: 'WordPress',
  word:      'Word',
  markdown:  'Markdown',
}

const DEPLOY_LABELS = {
  github: 'GitHub Pages',
  vercel: 'Vercel',
  zip:    'ZIPダウンロード',
}

export default function StepDone({ data, onComplete }) {
  const [saving, setSaving] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function finalize() {
      try {
        const [masterKeyHash, subKeyHash] = await Promise.all([
          hashKey(data.masterKey.keyString),
          hashKey(data.subKey),
        ])
        await saveAuthInfo({ masterKeyHash, subKeyHash })
        await saveSetupState({
          completed: true,
          mode: data.mode,
          deployTarget: data.deployTarget,
          vercelFromGitHub: data.vercelFromGitHub ?? null,
          background: data.background ?? 'wordpress',
          createdAt: new Date().toISOString(),
        })
        // セットアップ設定を siteConfig にも反映（設定画面で変更可能に）
        const existingConfig = await getSiteConfig()
        // background + mode からデフォルトエディターを自動決定
        const deriveDefaultEditor = () => {
          if (data.mode === 'easy') return 'richtext'
          const bg = data.background ?? 'wordpress'
          if (bg === 'obsidian' || bg === 'markdown') return 'markdown'
          return 'richtext' // wordpress, word
        }
        await saveSiteConfig({
          ...existingConfig,
          deployTarget:    data.deployTarget ?? existingConfig.deployTarget,
          vercelFromGitHub: data.vercelFromGitHub ?? false,
          background:      data.background ?? 'wordpress',
          defaultEditor:   deriveDefaultEditor(),
          // credentials ステップで入力された値があれば反映
          ...(data.githubToken  ? { githubToken:  data.githubToken }  : {}),
          ...(data.githubRepo   ? { githubRepo:   data.githubRepo }   : {}),
          ...(data.githubBranch ? { githubBranch: data.githubBranch } : {
            githubBranch: data.deployTarget === 'vercel' && data.vercelFromGitHub
              ? 'main' : existingConfig.githubBranch,
          }),
        })
        setSaving(false)
      } catch (e) {
        setError(e.message)
        setSaving(false)
      }
    }
    finalize()
  }, [])

  if (saving) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">セットアップ中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center space-y-4 py-8">
        <p className="text-red-500 text-sm">{error}</p>
        <p className="text-gray-400 text-xs">ページを再読み込みしてやり直してください。</p>
      </div>
    )
  }

  const deployLabel = DEPLOY_LABELS[data.deployTarget] ?? data.deployTarget
  const bgLabel = BACKGROUND_LABELS[data.background] ?? data.background ?? 'WordPress'

  // Vercel + GitHub の場合の補足ヒント
  const vercelGitHubHint = data.deployTarget === 'vercel' && data.vercelFromGitHub

  return (
    <div className="text-center space-y-6 py-8">
      <div className="w-20 h-20 mx-auto rounded-full bg-sky-100 flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10 text-sky-500" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-800">準備完了！</h2>
        <p className="text-sm text-gray-500">
          AirPubreのセットアップが完了しました。<br />
          さっそく記事を書いてみましょう！
        </p>
      </div>

      <div className="bg-sky-50 rounded-2xl p-4 text-left space-y-2">
        <p className="text-xs font-semibold text-sky-700">設定内容</p>
        <div className="text-xs text-gray-600 space-y-1">
          <div className="flex justify-between">
            <span>モード</span>
            <span className="font-medium">{data.mode === 'easy' ? 'かんたんモード' : '玄人モード'}</span>
          </div>
          <div className="flex justify-between">
            <span>デプロイ先</span>
            <span className="font-medium">{deployLabel}</span>
          </div>
          {data.deployTarget === 'vercel' && data.vercelFromGitHub != null && (
            <div className="flex justify-between">
              <span>Vercel構成</span>
              <span className="font-medium">
                {data.vercelFromGitHub ? 'GitHub経由' : 'API直接'}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>テーマ</span>
            <span className="font-medium">{bgLabel}</span>
          </div>
        </div>
      </div>

      {vercelGitHubHint && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-left">
          <p className="text-xs font-semibold text-amber-700 mb-1">Vercel × GitHub 構成のヒント</p>
          <p className="text-xs text-amber-600 leading-relaxed">
            AirPubreはGitHub APIでリポジトリにプッシュします。
            Vercelがリポジトリを監視していれば自動でデプロイが走ります。
            設定で「GitHubトークン」と「リポジトリ名」を入力してください。
          </p>
        </div>
      )}

      <button
        onClick={onComplete}
        className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm shadow-sm transition-colors"
      >
        AirPubreをはじめる →
      </button>
    </div>
  )
}
