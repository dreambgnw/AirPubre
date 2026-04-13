import { useState, useEffect } from 'react'
import { generateMasterKey } from '../../lib/crypto.js'
import { wordsToKeyString } from '../../words/hiragana.js'

export default function StepMasterKey({ data, next }) {
  const isSyncImport = !!data?.syncImport

  // 新規作成モード
  const [key, setKey] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  // 入力モード（同期インポート時）
  const [inputValue, setInputValue] = useState('')
  const [inputError, setInputError] = useState(null)

  useEffect(() => {
    if (!isSyncImport) setKey(generateMasterKey())
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

  const handleInputSubmit = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) {
      setInputError('マスターキーを入力してください')
      return
    }
    // 「・」区切りで12単語かチェック
    const words = trimmed.split('・').map(w => w.trim()).filter(Boolean)
    if (words.length !== 12) {
      setInputError('12単語を「・」区切りで入力してください')
      return
    }
    setInputError(null)
    next({ masterKey: { words, keyString: wordsToKeyString(words) } })
  }

  // ── 同期インポート：入力モード ──
  if (isSyncImport) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-gray-800">マスターキーを入力</h2>
          <p className="text-sm text-gray-500">
            別のデバイスで作成したマスターキー（12単語）を<br />
            そのまま入力してください。
          </p>
        </div>

        <div className="bg-white border-2 border-sky-200 rounded-2xl p-5 space-y-4">
          <textarea
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="あいう・えおか・きくけ・…（12単語を・区切りで）"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
          />
          {inputError && (
            <p className="text-xs text-rose-600">{inputError}</p>
          )}
        </div>

        <div className="bg-sky-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            同じマスターキーを使うことで、別デバイスと同じ認証情報でログインできます。
          </p>
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
