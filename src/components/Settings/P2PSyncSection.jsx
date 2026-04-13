import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Copy, Check, Wifi, WifiOff } from 'lucide-react'
import { generateRoomCode, hostSession, joinSession } from '../../lib/p2pSync.js'
import QRCode from 'qrcode'

// ── 状態: idle → hosting/joining → syncing → done/error ──

export default function P2PSyncSection() {
  const [phase, setPhase] = useState('idle') // idle | hosting | joining | syncing | done | error
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [status, setStatus] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const sessionRef = useRef(null)

  // クリーンアップ
  useEffect(() => {
    return () => sessionRef.current?.cancel()
  }, [])

  const reset = useCallback(() => {
    sessionRef.current?.cancel()
    sessionRef.current = null
    setPhase('idle')
    setRoomCode('')
    setJoinCode('')
    setStatus('')
    setResult(null)
    setError(null)
    setQrDataUrl(null)
  }, [])

  // ── ホスト開始 ──
  const startHost = useCallback(async () => {
    const code = generateRoomCode()
    setRoomCode(code)
    setPhase('hosting')
    setError(null)

    // QR生成
    try {
      const url = await QRCode.toDataURL(code, { width: 160, margin: 2 })
      setQrDataUrl(url)
    } catch (_) {}

    sessionRef.current = hostSession(code, {
      includeAuth: true,
      onStatus: setStatus,
      onComplete: (res) => {
        setResult(res)
        setPhase('done')
      },
      onError: (msg) => {
        setError(msg)
        setPhase('error')
      },
    })
  }, [])

  // ── ジョイン ──
  const startJoin = useCallback(() => {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) return
    setPhase('joining')
    setError(null)

    sessionRef.current = joinSession(code, {
      onStatus: setStatus,
      onComplete: (res) => {
        setResult(res)
        setPhase('done')
      },
      onError: (msg) => {
        setError(msg)
        setPhase('error')
      },
    })
  }, [joinCode])

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── idle: 選択画面 ──
  if (phase === 'idle') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          2台のデバイスをブラウザだけで直接つないで、ドラフトと設定を同期します。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={startHost}
            className="p-3 rounded-xl border-2 border-sky-200 bg-white hover:border-sky-400 hover:shadow-sm transition-all text-center"
          >
            <Wifi className="w-5 h-5 text-sky-500 mx-auto mb-1" />
            <div className="text-sm font-semibold text-gray-700">ホスト</div>
            <div className="text-xs text-gray-400">コードを発行</div>
          </button>
          <button
            onClick={() => setPhase('join-input')}
            className="p-3 rounded-xl border-2 border-gray-200 bg-white hover:border-sky-400 hover:shadow-sm transition-all text-center"
          >
            <WifiOff className="w-5 h-5 text-gray-400 mx-auto mb-1" />
            <div className="text-sm font-semibold text-gray-700">ジョイン</div>
            <div className="text-xs text-gray-400">コードを入力</div>
          </button>
        </div>
      </div>
    )
  }

  // ── join-input: コード入力 ──
  if (phase === 'join-input') {
    return (
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">ルームコード</label>
        <input
          type="text"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="6文字のコード"
          maxLength={6}
          className="w-full px-3 py-2.5 rounded-xl border border-sky-200 text-center text-lg font-mono tracking-[0.3em] bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 uppercase"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={startJoin}
            disabled={joinCode.trim().length !== 6}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              joinCode.trim().length === 6
                ? 'bg-sky-500 hover:bg-sky-600 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            接続
          </button>
          <button
            onClick={reset}
            className="px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            戻る
          </button>
        </div>
      </div>
    )
  }

  // ── hosting: コード表示 + 接続待ち ──
  if (phase === 'hosting') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-xs text-gray-500">もう一方のデバイスでこのコードを入力してください</p>
        <div className="bg-sky-50 rounded-2xl p-4 space-y-3">
          <div className="text-3xl font-mono font-bold tracking-[0.4em] text-sky-700">
            {roomCode}
          </div>
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              copied ? 'bg-green-500 text-white' : 'bg-sky-100 text-sky-700 hover:bg-sky-200'
            }`}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'コピーしました' : 'コピー'}
          </button>
          {qrDataUrl && (
            <div className="flex justify-center">
              <img src={qrDataUrl} alt="QR Code" className="w-32 h-32 rounded-lg" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          {status || '接続待ち...'}
        </div>
        <button
          onClick={reset}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          キャンセル
        </button>
      </div>
    )
  }

  // ── joining / syncing ──
  if (phase === 'joining' || phase === 'syncing') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        <p className="text-sm text-gray-600">{status || '接続中...'}</p>
        <button
          onClick={reset}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          キャンセル
        </button>
      </div>
    )
  }

  // ── done ──
  if (phase === 'done') {
    return (
      <div className="text-center space-y-3 py-2">
        <div className="w-12 h-12 mx-auto rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">同期完了</p>
          {result && (
            <p className="text-xs text-gray-500 mt-1">
              {result.imported > 0 ? `${result.imported} 件取り込み` : '新しいデータなし'}
              {result.sent > 0 && ` / ${result.sent} 件送信`}
            </p>
          )}
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl text-sm text-sky-600 hover:bg-sky-50 transition-colors"
        >
          閉じる
        </button>
      </div>
    )
  }

  // ── error ──
  if (phase === 'error') {
    return (
      <div className="text-center space-y-3 py-2">
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl text-sm text-sky-600 hover:bg-sky-50 transition-colors"
        >
          やり直す
        </button>
      </div>
    )
  }

  return null
}
