import { useState } from 'react'
import { Fingerprint, ChevronRight, CheckCircle } from 'lucide-react'
import { isPasskeySupported, registerPasskey } from '../../lib/passkey.js'
import { addPasskeyCredential } from '../../lib/storage.js'

export default function StepPasskey({ next }) {
  const [registered, setRegistered] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const supported = isPasskeySupported()

  const handleRegister = async () => {
    setLoading(true)
    setError(null)
    try {
      const credential = await registerPasskey('AirPubre User')
      await addPasskeyCredential(credential)
      setRegistered(true)
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('パスキーの登録がキャンセルされました')
      } else {
        setError(e.message || 'パスキーの登録に失敗しました')
      }
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center mx-auto">
          <Fingerprint className="w-7 h-7 text-sky-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">パスキー</h1>
        <p className="text-gray-500 text-sm">
          生体認証やパスワードマネージャーで<br />かんたんにログインできます。
        </p>
      </div>

      {supported ? (
        <div className="space-y-4">
          {registered ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700">パスキーを登録しました</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  次回から生体認証でログインできます。
                </p>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={handleRegister}
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="w-5 h-5" />
                    パスキーを登録する
                  </>
                )}
              </button>
              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
              )}
            </>
          )}

          <div className="bg-sky-50/50 border border-sky-100 rounded-xl px-4 py-3 space-y-1.5">
            <p className="text-xs text-gray-500 leading-relaxed">
              BitWarden や Google パスワードマネージャー、iCloud キーチェーンに保存すれば、
              別のデバイスでも使えます。
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl">
          <p className="text-sm text-gray-500 text-center">
            この環境ではパスキーを利用できません。
          </p>
        </div>
      )}

      <button
        onClick={() => next()}
        className="w-full py-3 rounded-xl border-2 border-sky-200 text-sky-600 font-semibold text-sm hover:border-sky-400 transition-colors flex items-center justify-center gap-1"
      >
        {registered ? '次へ' : 'スキップ'}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
