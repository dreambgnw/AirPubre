/**
 * セットアップウィザード — フォルダ選択ステップ
 *
 * iCloud Drive / Dropbox / OneDrive などの同期フォルダを選ぶと
 * デバイス間で記事・設定が自動的に同期される。
 * スキップすれば従来通り IndexedDB に保存（ブラウザ内のみ）。
 */

import { useState } from 'react'
import { FolderOpen, Cloud, RefreshCw, ArrowRight, Info } from 'lucide-react'
import { isFSSupported, pickFolder, migrateDraftsToFS } from '../../lib/fs.js'

const SYNC_SERVICES = [
  { name: 'iCloud Drive', emoji: '☁️' },
  { name: 'Dropbox',      emoji: '📦' },
  { name: 'OneDrive',     emoji: '🔵' },
  { name: 'Google Drive', emoji: '🔷' },
]

export default function StepFolder({ next }) {
  const [phase, setPhase] = useState('intro') // intro | picking | migrating | done | error
  const [error, setError]         = useState(null)
  const [folderName, setFolderName] = useState(null)
  const [migratedCount, setMigratedCount] = useState(0)

  const handlePick = async () => {
    setError(null)
    setPhase('picking')
    try {
      // フォルダ選択前に IDB の既存下書きを取得しておく（選択後は FS に切り替わるため）
      let existingDrafts = []
      try {
        const { openDB } = await import('idb')
        const db = await openDB('airpubre', 3)
        existingDrafts = await db.getAll('drafts')
      } catch (_) {}

      const handle = await pickFolder()
      setFolderName(handle.name)

      // 既存の IndexedDB 下書きがあれば FS に移行
      if (existingDrafts.length > 0) {
        setPhase('migrating')
        await migrateDraftsToFS(existingDrafts)
        setMigratedCount(existingDrafts.length)
      }

      setPhase('done')
    } catch (e) {
      if (e.name === 'AbortError') {
        // ユーザーがキャンセル → intro に戻る
        setPhase('intro')
      } else {
        setError(e.message)
        setPhase('error')
      }
    }
  }

  const handleSkip = () => next({ useFS: false })
  const handleNext = () => next({ useFS: true, folderName })

  // ── ブラウザ非対応 ──
  if (!isFSSupported()) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-800">フォルダ同期</h1>
          <p className="text-gray-500 text-sm">
            お使いのブラウザは File System Access API に対応していません。
          </p>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700 space-y-1">
          <p className="font-semibold">Chrome / Edge をお使いください</p>
          <p className="text-xs text-amber-600">
            Safari や Firefox では記事はブラウザ内（IndexedDB）にのみ保存されます。
            デバイス間同期には P2P 同期か GitHub 同期をご利用ください。
          </p>
        </div>
        <button
          onClick={handleSkip}
          className="w-full py-3 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-semibold transition-colors"
        >
          IndexedDB で続ける
        </button>
      </div>
    )
  }

  // ── intro ──
  if (phase === 'intro') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-800">フォルダを選ぶ</h1>
          <p className="text-gray-500 text-sm">
            記事の保存場所を選びます。同期フォルダを選ぶと<br />
            複数デバイスで自動的に記事が共有されます。
          </p>
        </div>

        {/* 同期サービス一覧 */}
        <div className="grid grid-cols-2 gap-2">
          {SYNC_SERVICES.map(s => (
            <div key={s.name} className="flex items-center gap-2 px-3 py-2.5 bg-sky-50 rounded-xl text-sm text-gray-700 font-medium">
              <span>{s.emoji}</span>
              <span>{s.name}</span>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
          <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
          <span>
            選んだフォルダ内に <code className="bg-white px-1 rounded">.airpubre/</code> サブフォルダが作られます。
            GitHub との記事公開は引き続き別途行います。
          </span>
        </div>

        <div className="space-y-3">
          <button
            onClick={handlePick}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-sky-300 bg-white hover:bg-sky-50 hover:border-sky-400 text-sky-600 font-semibold transition-all shadow-sm"
          >
            <FolderOpen className="w-5 h-5" />
            フォルダを選ぶ
          </button>
          <button
            onClick={handleSkip}
            className="w-full py-2.5 rounded-2xl border border-gray-200 text-gray-400 hover:text-gray-600 text-sm transition-colors"
          >
            スキップ（ブラウザ内に保存）
          </button>
        </div>
      </div>
    )
  }

  // ── picking / migrating ──
  if (phase === 'picking' || phase === 'migrating') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
          {phase === 'picking'
            ? <FolderOpen className="w-6 h-6 text-sky-500" />
            : <RefreshCw  className="w-6 h-6 text-sky-500 animate-spin" />}
        </div>
        <p className="text-sm text-gray-600">
          {phase === 'picking' ? 'フォルダ選択中...' : '既存の記事を移行中...'}
        </p>
      </div>
    )
  }

  // ── done ──
  if (phase === 'done') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Cloud className="w-7 h-7 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">フォルダ設定完了！</h1>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{folderName}</span> 内の
            <code className="mx-1 bg-sky-50 px-1 rounded text-sky-700">.airpubre/</code>
            に記事が保存されます。
          </p>
        </div>

        {migratedCount > 0 && (
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-700 text-center">
            既存の記事 {migratedCount} 件を移行しました ✓
          </div>
        )}

        <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 space-y-1">
          <p className="font-semibold">💡 同期フォルダを選んだ場合</p>
          <p>
            別のデバイスでも同じフォルダを選択すると、記事が自動的に共有されます。
            スマホ（Safari）では File System は使えないため、P2P 同期か GitHub 同期をお使いください。
          </p>
        </div>

        <button
          onClick={handleNext}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-600 text-white font-semibold transition-colors shadow-sm"
        >
          次へ
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── error ──
  return (
    <div className="space-y-4">
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
      <button
        onClick={() => setPhase('intro')}
        className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
      >
        やり直す
      </button>
      <button
        onClick={handleSkip}
        className="w-full py-2.5 rounded-xl text-gray-400 text-sm hover:text-gray-600"
      >
        スキップ
      </button>
    </div>
  )
}
