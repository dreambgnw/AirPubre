import { useState, useEffect } from 'react'
import { generateMasterKey } from '../../lib/crypto.js'

export default function StepMasterKey({ next }) {
  const [key, setKey] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setKey(generateMasterKey())
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(key.keyString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRegenerate = () => {
    setKey(generateMasterKey())
    setConfirmed(false)
  }

  if (!key) return null

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-gray-800">マスターキーを作成</h2>
        <p className="text-sm text-gray-500">
          これがあなたの「合鍵」です。<br />
          絶対になくさないように保管してください。
        </p>
      </div>

      {/* キー表示 */}
      <div className="bg-white border-2 border-sky-200 rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {key.words.map((word, i) => (
            <div
              key={i}
              className="bg-sky-50 rounded-xl px-3 py-2 text-center"
            >
              <span className="text-xs text-sky-400 block">{i + 1}</span>
              <span className="text-sm font-medium text-gray-700">{word}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
            }`}
          >
            {copied ? '✓ コピーしました' : 'コピーする'}
          </button>
          <button
            onClick={handleRegenerate}
            className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            再生成
          </button>
        </div>
      </div>

      {/* 警告 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
        <p className="text-sm font-semibold text-amber-700">⚠️ 大切なお願い</p>
        <p className="text-xs text-amber-600">
          この12単語は紙に書いて安全な場所に保管してください。
          パスワードのリセットはできません。
          なくすとアカウントへのアクセスが永久に失われます。
        </p>
      </div>

      {/* 確認チェック */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-sky-500"
        />
        <span className="text-sm text-gray-600">
          12単語を紙に書き留めました。大切に保管します。
        </span>
      </label>

      <button
        onClick={() => next({ masterKey: key })}
        disabled={!confirmed}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
          confirmed
            ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`}
      >
        次へ →
      </button>
    </div>
  )
}
