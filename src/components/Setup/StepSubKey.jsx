import { useState, useEffect } from 'react'
import { generateSubKey } from '../../lib/crypto.js'

export default function StepSubKey({ data, next }) {
  const isSyncImport = !!data?.syncImport

  // 新規作成モード
  const [subKey, setSubKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  // 入力モード
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState(null)

  useEffect(() => {
    if (!isSyncImport) setSubKey(generateSubKey())
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(subKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) {
      setInputError('サブキーを入力してください')
      return
    }
    setInputError(null)
    next({ subKey: trimmed })
  }

  // ── 同期インポート：入力モード ──
  if (isSyncImport) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-800">サブキーを入力</h2>
          <p className="text-sm text-gray-500">
            別のデバイスで作成したサブキーを<br />
            そのまま入力してください。
          </p>
        </div>

        <div className="bg-white border-2 border-sky-200 rounded-2xl p-5 space-y-4">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="サブキーを貼り付け"
            className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
          {inputError && (
            <p className="text-xs text-rose-600">{inputError}</p>
          )}
        </div>

        <div className="bg-sky-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-sky-700">鍵の使い分け</p>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex gap-2">
              <span className="text-sky-500 font-bold">サブキー</span>
              <span>→ 記事の投稿・編集（日常使い）</span>
            </div>
            <div className="flex gap-2">
              <span className="text-amber-500 font-bold">マスターキー</span>
              <span>→ アカウント削除・設定変更（重要操作）</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleInputSubmit}
          disabled={!inputValue.trim()}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            inputValue.trim()
              ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          次へ →
        </button>
      </div>
    )
  }

  // ── 通常：新規作成モード ──
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-gray-800">サブキーを作成</h2>
        <p className="text-sm text-gray-500">
          日常の投稿・編集に使う鍵です。<br />
          マスターキーより安全に使えます。
        </p>
      </div>

      {/* サブキー表示 */}
      <div className="bg-white border-2 border-sky-200 rounded-2xl p-4 space-y-3">
        <div className="bg-gray-50 rounded-xl p-3 font-mono text-xs text-gray-600 break-all leading-relaxed">
          {subKey}
        </div>
        <button
          onClick={handleCopy}
          className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
            copied
              ? 'bg-green-500 text-white'
              : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
          }`}
        >
          {copied ? '✓ コピーしました' : 'コピーする'}
        </button>
      </div>

      {/* 使い分け説明 */}
      <div className="bg-sky-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-sky-700">鍵の使い分け</p>
        <div className="space-y-2 text-xs text-gray-600">
          <div className="flex gap-2">
            <span className="text-sky-500 font-bold">サブキー</span>
            <span>→ 記事の投稿・編集（日常使い）</span>
          </div>
          <div className="flex gap-2">
            <span className="text-amber-500 font-bold">マスターキー</span>
            <span>→ アカウント削除・設定変更（重要操作）</span>
          </div>
        </div>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={e => setConfirmed(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-sky-500"
        />
        <span className="text-sm text-gray-600">
          サブキーを保存しました。
        </span>
      </label>

      <button
        onClick={() => next({ subKey })}
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
