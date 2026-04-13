import { useState, useEffect, useRef } from 'react'
import { KeyRound, Eye, EyeOff, ShieldAlert, ChevronRight, Fingerprint, Wifi, Loader2 } from 'lucide-react'
import { verifyKey } from '../lib/crypto.js'
import { getAuthInfo, getPasskeyCredentials } from '../lib/storage.js'
import { isPasskeySupported, authenticatePasskey } from '../lib/passkey.js'
import { joinSession } from '../lib/p2pSync.js'

/**
 * ログイン方式
 * - challenge: 「○個目と○個目の単語を入力」（サブキー→マスターキー昇格 / セッション復元）
 * - full:      スペース区切りで全12単語入力（通常マスターキーログイン）
 * - subkey:    サブキー文字列を入力（日常ログイン）
 */

function pickChallengeIndices() {
  const a = Math.floor(Math.random() * 12)
  let b = Math.floor(Math.random() * 11)
  if (b >= a) b++
  return [a, b].sort((x, y) => x - y)
}

export default function Login({ onLogin, privileged = false }) {
  const [tab, setTab] = useState('subkey') // 'subkey' | 'master'
  const [masterMode, setMasterMode] = useState('challenge') // 'challenge' | 'full'
  const [subKeyInput, setSubKeyInput] = useState('')
  const [fullInput, setFullInput] = useState('')
  const [challengeInputs, setChallengeInputs] = useState(['', ''])
  const [challengeIdx, setChallengeIdx] = useState([0, 3])
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasPasskey, setHasPasskey] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)
  const [p2pOpen, setP2pOpen] = useState(false)
  const [p2pCode, setP2pCode] = useState('')
  const [p2pStatus, setP2pStatus] = useState(null) // null | 'connecting' | 'syncing' | 'done' | 'error'
  const [p2pMsg, setP2pMsg] = useState('')
  const p2pSessionRef = useRef(null)

  const handleP2pJoin = () => {
    const code = p2pCode.trim().toUpperCase()
    if (code.length !== 6) return
    setP2pStatus('connecting')
    setP2pMsg('接続中...')
    setError('')

    p2pSessionRef.current = joinSession(code, {
      includeAuth: true,
      onStatus: (msg) => { setP2pStatus('syncing'); setP2pMsg(msg) },
      onComplete: () => {
        setP2pStatus('done')
        setP2pMsg('同期完了！ログインします...')
        setTimeout(() => onLogin({ level: 'normal' }), 1000)
      },
      onError: (msg) => {
        setP2pStatus('error')
        setP2pMsg(msg)
      },
    })
  }

  useEffect(() => {
    return () => p2pSessionRef.current?.cancel()
  }, [])

  useEffect(() => {
    setChallengeIdx(pickChallengeIndices())
    // パスキーが登録済みか確認
    if (isPasskeySupported()) {
      getPasskeyCredentials().then(creds => {
        if (creds.length > 0) setHasPasskey(true)
      })
    }
  }, [])

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true)
    setError('')
    try {
      const credentials = await getPasskeyCredentials()
      await authenticatePasskey(credentials)
      onLogin({ level: 'normal' })
    } catch (e) {
      setError(e.message || 'パスキー認証に失敗しました')
    }
    setPasskeyLoading(false)
  }

  const handleSubKeyLogin = async () => {
    if (!subKeyInput.trim()) return
    setLoading(true)
    setError('')
    try {
      const { subKeyHash } = await getAuthInfo()
      const ok = await verifyKey(subKeyInput.trim(), subKeyHash)
      if (ok) {
        onLogin({ level: 'normal' })
      } else {
        setError('サブキーが正しくありません')
      }
    } catch {
      setError('認証中にエラーが発生しました')
    }
    setLoading(false)
  }

  const handleMasterFullLogin = async () => {
    const words = fullInput.trim().split(/[\s・]+/).filter(Boolean)
    if (words.length !== 12) {
      setError('12個の単語をスペース区切りで入力してください')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { masterKeyHash } = await getAuthInfo()
      const ok = await verifyKey(words.join('・'), masterKeyHash)
      if (ok) {
        onLogin({ level: 'privileged' })
      } else {
        setError('マスターキーが正しくありません')
      }
    } catch {
      setError('認証中にエラーが発生しました')
    }
    setLoading(false)
  }

  const handleMasterChallengeLogin = async () => {
    if (challengeInputs.some(v => !v.trim())) {
      setError('両方の単語を入力してください')
      return
    }
    // チャレンジはフルキー検証できないため、ここでは昇格のみ（本実装では署名チャレンジが必要）
    // デモ実装: 入力値を記録して次フェーズで確認
    setLoading(true)
    setError('')
    try {
      const { masterKeyHash } = await getAuthInfo()
      // 実際には入力2単語だけでは検証不能なため、fullモードへ誘導
      setMasterMode('full')
      setError('セキュリティのため、全12単語での確認が必要です')
    } catch {
      setError('エラーが発生しました')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col">
      {/* ヘッダー */}
      <header className="py-6 px-4 flex items-center justify-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center">
          <span className="text-white text-sm font-bold">AP</span>
        </div>
        <span className="text-xl font-bold text-gray-800">
          Air<span className="text-sky-500">Pubre</span>
        </span>
      </header>

      <main className="flex-1 px-4 pb-8 max-w-md mx-auto w-full space-y-4">

        {/* パスキーログイン */}
        {hasPasskey && (
          <div className="bg-white rounded-2xl border border-sky-100 shadow-sm p-5 space-y-3">
            <button
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
            >
              {passkeyLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  パスキーでログイン
                </>
              )}
            </button>
            {error && !tab && <p className="text-xs text-red-500 text-center">{error}</p>}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-sky-100 shadow-sm overflow-hidden">

          {/* タブ */}
          <div className="flex border-b border-sky-100">
            <button
              onClick={() => { setTab('subkey'); setError('') }}
              className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'subkey'
                  ? 'text-sky-600 border-b-2 border-sky-500'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              サブキー
            </button>
            <button
              onClick={() => { setTab('master'); setError('') }}
              className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                tab === 'master'
                  ? 'text-sky-600 border-b-2 border-sky-500'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              マスターキー
            </button>
          </div>

          <div className="p-5 space-y-4">

            {/* サブキーログイン */}
            {tab === 'subkey' && (
              <>
                <div>
                  <p className="text-xs text-gray-500 mb-3">
                    日常の投稿・編集に使うサブキーでログインします。
                  </p>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={subKeyInput}
                      onChange={e => setSubKeyInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubKeyLogin()}
                      placeholder="サブキーを入力..."
                      className="w-full px-4 py-3 pr-10 rounded-xl border border-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm font-mono"
                    />
                    <button
                      onClick={() => setShowKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <button
                  onClick={handleSubKeyLogin}
                  disabled={!subKeyInput || loading}
                  className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                    subKeyInput && !loading
                      ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>ログイン <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </>
            )}

            {/* マスターキーログイン */}
            {tab === 'master' && (
              <>
                {/* モード切替 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMasterMode('challenge'); setError('') }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      masterMode === 'challenge'
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    単語チャレンジ
                  </button>
                  <button
                    onClick={() => { setMasterMode('full'); setError('') }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                      masterMode === 'full'
                        ? 'bg-sky-100 text-sky-700'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    全単語入力
                  </button>
                </div>

                {/* チャレンジ方式 */}
                {masterMode === 'challenge' && (
                  <div className="space-y-3">
                    <p className="text-xs text-gray-500">
                      マスターキーの単語を確認します。
                    </p>
                    {challengeIdx.map((idx, i) => (
                      <div key={idx}>
                        <label className="block text-xs font-medium text-sky-600 mb-1">
                          {idx + 1}個目の単語
                        </label>
                        <input
                          type="text"
                          value={challengeInputs[i]}
                          onChange={e => {
                            const next = [...challengeInputs]
                            next[i] = e.target.value
                            setChallengeInputs(next)
                          }}
                          placeholder={`${idx + 1}番目の単語`}
                          className="w-full px-4 py-2.5 rounded-xl border border-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm"
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => { setChallengeIdx(pickChallengeIndices()); setChallengeInputs(['', '']); setError('') }}
                      className="text-xs text-gray-400 hover:text-sky-500 transition-colors"
                    >
                      別の単語で確認する
                    </button>
                  </div>
                )}

                {/* 全単語入力方式 */}
                {masterMode === 'full' && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">
                      12個の単語をスペース区切りで入力してください。
                    </p>
                    <textarea
                      value={fullInput}
                      onChange={e => setFullInput(e.target.value)}
                      placeholder="さくら うみ そら つき はな かぜ ..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl border border-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 text-sm resize-none"
                    />
                    <p className="text-xs text-gray-400">
                      スペース・「・」どちらの区切りでも可
                    </p>
                  </div>
                )}

                {error && <p className="text-xs text-red-500">{error}</p>}

                <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  <p className="text-xs text-amber-600">
                    マスターキーはアカウント削除など重要操作専用です
                  </p>
                </div>

                <button
                  onClick={masterMode === 'challenge' ? handleMasterChallengeLogin : handleMasterFullLogin}
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>特権ログイン <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </>
            )}

          </div>
        </div>

        {/* P2P 同期 */}
        <div className="border-t border-sky-100 pt-3">
          <button
            onClick={() => { setP2pOpen(v => !v); setP2pStatus(null); setP2pMsg('') }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-sky-500 hover:text-sky-700 transition-colors"
          >
            <Wifi className="w-3.5 h-3.5" />
            別のデバイスから P2P 同期
          </button>

          {p2pOpen && (
            <div className="mt-3 bg-white rounded-2xl border border-sky-100 shadow-sm p-4 space-y-3">
              {!p2pStatus && (
                <>
                  <p className="text-xs text-gray-500">
                    もう一方のデバイスの設定画面で「P2P 同期」→「ホスト」を開き、表示されたコードを入力してください。
                  </p>
                  <input
                    type="text"
                    value={p2pCode}
                    onChange={e => setP2pCode(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="6文字のコード"
                    maxLength={6}
                    className="w-full px-3 py-2.5 rounded-xl border border-sky-200 text-center text-lg font-mono tracking-[0.3em] bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 uppercase"
                  />
                  <button
                    onClick={handleP2pJoin}
                    disabled={p2pCode.trim().length !== 6}
                    className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      p2pCode.trim().length === 6
                        ? 'bg-sky-500 hover:bg-sky-600 text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    接続して同期
                  </button>
                </>
              )}
              {(p2pStatus === 'connecting' || p2pStatus === 'syncing') && (
                <div className="flex items-center justify-center gap-2 py-3">
                  <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                  <span className="text-sm text-gray-600">{p2pMsg}</span>
                </div>
              )}
              {p2pStatus === 'done' && (
                <div className="text-center py-3">
                  <p className="text-sm text-green-600 font-medium">{p2pMsg}</p>
                </div>
              )}
              {p2pStatus === 'error' && (
                <div className="space-y-2">
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{p2pMsg}</p>
                  <button
                    onClick={() => { setP2pStatus(null); setP2pMsg('') }}
                    className="text-xs text-sky-500 hover:text-sky-700"
                  >
                    やり直す
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
