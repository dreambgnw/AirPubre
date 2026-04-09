/**
 * デバイス間同期設定セクション
 * パスキー登録 + 同期パスフレーズ設定 + 別端末から取り込む
 */
import { useState, useEffect } from 'react'
import { RefreshCw, Smartphone, ShieldCheck, ShieldOff, Download, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { getSyncCredential, saveSyncCredential, importDrafts } from '../../lib/storage.js'
import { registerSyncPasskey, importFromSyncUrl } from '../../lib/sync.js'

function SecretInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 pr-10 rounded-lg border border-sky-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

export default function SyncSection({ syncPassphrase, onPassphraseChange }) {
  const [credential, setCredential] = useState(null)
  const [registering, setRegistering] = useState(false)
  const [regError, setRegError] = useState(null)

  // インポート UI ステート
  const [importUrl, setImportUrl] = useState('')
  const [importPassphrase, setImportPassphrase] = useState('')
  const [importStatus, setImportStatus] = useState(null) // null | 'running' | 'success' | 'error'
  const [importMessage, setImportMessage] = useState('')
  const [importCount, setImportCount] = useState(0)

  useEffect(() => {
    getSyncCredential().then(setCredential)
  }, [])

  // ── パスキー登録 ──────────────────────────────────────────────

  const handleRegister = async () => {
    setRegistering(true)
    setRegError(null)
    try {
      const cred = await registerSyncPasskey()
      await saveSyncCredential(cred)
      setCredential(cred)
    } catch (e) {
      setRegError(e.message)
    } finally {
      setRegistering(false)
    }
  }

  // ── インポート ────────────────────────────────────────────────

  const handleImport = async () => {
    if (!importUrl.trim() || !importPassphrase.trim()) return
    setImportStatus('running')
    setImportMessage('')
    try {
      const drafts = await importFromSyncUrl(
        importUrl.trim(),
        importPassphrase.trim(),
        msg => setImportMessage(msg)
      )
      const count = await importDrafts(drafts)
      setImportCount(count)
      setImportStatus('success')
    } catch (e) {
      setImportMessage(e.message)
      setImportStatus('error')
    }
  }

  const syncReady = credential && syncPassphrase

  return (
    <div className="space-y-5">
      {/* ── 同期の有効状態 ──────────────────────────────────────── */}
      <div className={`flex items-center gap-3 p-3 rounded-xl ${
        syncReady ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'
      }`}>
        {syncReady
          ? <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
          : <ShieldOff   className="w-5 h-5 text-gray-400 shrink-0" />}
        <div>
          <p className={`text-sm font-semibold ${syncReady ? 'text-emerald-700' : 'text-gray-500'}`}>
            {syncReady ? '同期が有効です' : '同期が無効です'}
          </p>
          <p className="text-xs text-gray-400">
            {syncReady
              ? '次回のサイト更新から _sync/ ファイルが自動的に含まれます'
              : 'パスキーの登録と同期パスフレーズの設定が必要です'}
          </p>
        </div>
      </div>

      {/* ── パスキー ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600">パスキー</label>
        {credential ? (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-sky-50 border border-sky-200 rounded-lg">
            <Smartphone className="w-4 h-4 text-sky-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sky-700">登録済み</p>
              <p className="text-xs text-gray-400 font-mono truncate">
                RP: {credential.rpId}
              </p>
            </div>
            <button
              onClick={handleRegister}
              disabled={registering}
              className="text-xs text-sky-500 hover:text-sky-700 font-medium shrink-0"
            >
              再登録
            </button>
          </div>
        ) : (
          <button
            onClick={handleRegister}
            disabled={registering}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-sky-200 text-sky-500 hover:border-sky-400 hover:bg-sky-50 text-sm font-medium px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {registering
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Smartphone className="w-4 h-4" />}
            {registering ? '登録中...' : 'パスキーを登録する'}
          </button>
        )}
        {regError && (
          <p className="text-xs text-red-500">{regError}</p>
        )}
        <p className="text-xs text-gray-400">
          iCloud Keychain や 1Password などのパスワードマネージャーに保存されます。デバイス間で自動的に同期されます。
        </p>
      </div>

      {/* ── 同期パスフレーズ ──────────────────────────────────────── */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-gray-600">同期パスフレーズ</label>
        <SecretInput
          value={syncPassphrase}
          onChange={onPassphraseChange}
          placeholder="記事データの暗号化に使うパスフレーズ"
        />
        <p className="text-xs text-gray-400">
          記事データを AES-256 で暗号化します。別端末でのインポート時に必要です。忘れると復元できません。
        </p>
      </div>

      {/* ── 別端末から取り込む ────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-gray-400" />
          <p className="text-xs font-semibold text-gray-600">別端末から取り込む</p>
        </div>

        <div className="space-y-2">
          <input
            type="url"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            placeholder="https://mysite.github.io"
            disabled={importStatus === 'running'}
            className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50"
          />
          <SecretInput
            value={importPassphrase}
            onChange={setImportPassphrase}
            placeholder="同期パスフレーズ"
            disabled={importStatus === 'running'}
          />
        </div>

        {importStatus === 'running' && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {importMessage}
          </div>
        )}
        {importStatus === 'success' && (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg">
            <CheckCircle className="w-3.5 h-3.5" />
            {importCount} 件の記事を取り込みました。記事一覧を確認してください。
          </div>
        )}
        {importStatus === 'error' && (
          <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{importMessage}</span>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!importUrl.trim() || !importPassphrase.trim() || importStatus === 'running'}
          className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          {importStatus === 'running'
            ? <><Loader2 className="w-4 h-4 animate-spin" />取り込み中...</>
            : <><Download className="w-4 h-4" />データを取り込む</>}
        </button>
      </div>
    </div>
  )
}
