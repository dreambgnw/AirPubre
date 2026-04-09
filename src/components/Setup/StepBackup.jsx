import { useState } from 'react'

export default function StepBackup({ data, next }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [skipped, setSkipped] = useState(false)

  const handleSend = () => {
    // メール本文を生成（mailto: で自分のメーラーを開く）
    const subject = encodeURIComponent('【AirPubre】マスターキーのバックアップ')
    const body = encodeURIComponent(
`AirPubre マスターキーバックアップ
==============================

■ マスターキー（12単語）
${data.masterKey?.keyString ?? ''}

■ サブキー
${data.subKey ?? ''}

==============================
⚠️ このメールは安全な場所に保管し、他人に見せないでください。
生成日時: ${new Date().toLocaleString('ja-JP')}
`
    )
    window.open(`mailto:${email}?subject=${subject}&body=${body}`)
    setSent(true)
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-gray-800">バックアップ</h2>
        <p className="text-sm text-gray-500">
          自分宛にメールで鍵を送っておきましょう。<br />
          受信トレイが合鍵の保管場所になります。
        </p>
      </div>

      {!skipped && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl border border-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!email}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
              email
                ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            メールで送る（メーラーが開きます）
          </button>

          {sent && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 text-center">
              ✓ メーラーが開きました。送信して完了！
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sent ? (
          <button
            onClick={() => next()}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm shadow-sm"
          >
            次へ →
          </button>
        ) : (
          <button
            onClick={() => { setSkipped(true); next() }}
            className="w-full py-3 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 transition-colors"
          >
            スキップ（あとで設定する）
          </button>
        )}
      </div>
    </div>
  )
}
