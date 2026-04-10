import { useState } from 'react'
import { KeyRound, Eye, EyeOff } from 'lucide-react'

/**
 * GitHub 認証情報の入力ステップ。
 * deploy で GitHub / Vercel+GitHub / Headless GitHub を選んだ場合に表示。
 */
export default function StepCredentials({ data, next }) {
  const [token, setToken] = useState('')
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('')
  const [showToken, setShowToken] = useState(false)

  const needsGitHub =
    data.deployTarget === 'github' ||
    data.deployTarget === 'headless-github' ||
    (data.deployTarget === 'vercel' && data.vercelFromGitHub)

  // このステップが不要なら即スキップ
  if (!needsGitHub) {
    next({})
    return null
  }

  const isHeadless = data.deployTarget === 'headless-github'
  const defaultBranch = isHeadless ? 'main' : 'gh-pages'

  const handleNext = () => {
    next({
      githubToken: token.trim(),
      githubRepo: repo.trim(),
      githubBranch: (branch.trim() || defaultBranch),
    })
  }

  const canProceed = token.trim() && repo.trim()

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-50 flex items-center justify-center">
          <KeyRound className="w-5 h-5 text-sky-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">GitHub 認証情報</h2>
        <p className="text-sm text-gray-500">
          セットアップ完了後すぐに記事を公開できるよう、<br />
          トークンとリポジトリを入力してください。
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Personal Access Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="ghp_... / github_pat_..."
              className="w-full px-3 py-2.5 pr-10 rounded-xl border-2 border-sky-100 text-sm focus:outline-none focus:border-sky-400 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Classic（repo スコープ）または Fine-grained（Contents read/write）に対応。
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            リポジトリ
          </label>
          <input
            type="text"
            value={repo}
            onChange={e => setRepo(e.target.value)}
            placeholder="username/my-blog"
            className="w-full px-3 py-2.5 rounded-xl border-2 border-sky-100 text-sm focus:outline-none focus:border-sky-400 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            ブランチ
          </label>
          <input
            type="text"
            value={branch}
            onChange={e => setBranch(e.target.value)}
            placeholder={defaultBranch}
            className="w-full px-3 py-2.5 rounded-xl border-2 border-sky-100 text-sm focus:outline-none focus:border-sky-400 font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleNext}
          disabled={!canProceed}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            canProceed
              ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          次へ
        </button>
        <button
          onClick={() => next({})}
          className="w-full text-xs text-gray-400 hover:text-gray-600 py-2"
        >
          あとで設定する（スキップ）
        </button>
      </div>
    </div>
  )
}
