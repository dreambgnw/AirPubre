import { Feather, Wrench } from 'lucide-react'

export default function StepMode({ next }) {
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
    </div>
  )
}
