import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Archive, Code, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react'
import { importFile } from '../../lib/importer.js'
import { saveDraft } from '../../lib/storage.js'

const FORMAT_ICONS = {
  md: FileText,
  mdx: FileText,
  zip: Archive,
  xml: Code,
}

const FORMAT_COLORS = {
  md: 'text-sky-500',
  mdx: 'text-sky-500',
  zip: 'text-violet-500',
  xml: 'text-orange-500',
}

function getFileExt(name) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export default function ImportModal({ onClose, onImported }) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([])      // { file, status, posts, error }
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef()

  const addFiles = (newFiles) => {
    const items = Array.from(newFiles).map(file => ({
      file,
      status: 'pending',  // pending | loading | done | error
      posts: [],
      error: null,
    }))
    setFiles(prev => [...prev, ...items])
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleImport = async () => {
    setImporting(true)
    const updated = [...files]
    let totalImported = 0

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'done') continue
      updated[i] = { ...updated[i], status: 'loading' }
      setFiles([...updated])

      try {
        const posts = await importFile(updated[i].file)
        // IndexedDBに保存
        for (const post of posts) {
          await saveDraft({
            title: post.title,
            body: post.body,
            tags: post.tags,
            slug: post.slug,
            thumbnail: post.thumbnail,
            summary: post.summary,
            publishedAt: post.publishedAt,
            author: post.author,
          })
          totalImported++
        }
        updated[i] = { ...updated[i], status: 'done', posts }
      } catch (err) {
        updated[i] = { ...updated[i], status: 'error', error: err.message }
      }
      setFiles([...updated])
    }

    setImporting(false)
    setDone(true)
    if (totalImported > 0) onImported?.(totalImported)
  }

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const doneCount = files.filter(f => f.status === 'done').length
  const errorCount = files.filter(f => f.status === 'error').length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* モーダル */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl max-h-[85vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sky-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">過去記事をインポート</h2>
            <p className="text-xs text-gray-400 mt-0.5">.md .mdx .zip .xml（WordPress）対応</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ドロップゾーン */}
          {!done && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-sky-400 bg-sky-50 scale-[1.01]'
                  : 'border-sky-200 hover:border-sky-400 hover:bg-sky-50'
              }`}
            >
              <Upload className="w-8 h-8 text-sky-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">
                ここにファイルをドロップ
              </p>
              <p className="text-xs text-gray-400 mt-1">または クリックして選択</p>
              <p className="text-xs text-sky-400 mt-3 font-medium">
                .md / .mdx / .zip / .xml
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".md,.mdx,.zip,.xml"
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </div>
          )}

          {/* ファイルリスト */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((item, idx) => {
                const ext = getFileExt(item.file.name)
                const Icon = FORMAT_ICONS[ext] ?? FileText
                const color = FORMAT_COLORS[ext] ?? 'text-gray-400'
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      item.status === 'done' ? 'border-green-200 bg-green-50'
                      : item.status === 'error' ? 'border-red-200 bg-red-50'
                      : item.status === 'loading' ? 'border-sky-200 bg-sky-50'
                      : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{item.file.name}</p>
                      {item.status === 'done' && (
                        <p className="text-xs text-green-600">{item.posts.length}件取り込み完了</p>
                      )}
                      {item.status === 'error' && (
                        <p className="text-xs text-red-500">{item.error}</p>
                      )}
                      {item.status === 'loading' && (
                        <p className="text-xs text-sky-500">処理中...</p>
                      )}
                    </div>
                    {item.status === 'done' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                    {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    {item.status === 'loading' && (
                      <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                    {item.status === 'pending' && (
                      <button onClick={() => removeFile(idx)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 完了サマリー */}
          {done && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-center space-y-2">
              <CheckCircle className="w-8 h-8 text-sky-500 mx-auto" />
              <p className="text-sm font-bold text-gray-800">インポート完了！</p>
              <p className="text-xs text-gray-500">
                {doneCount}ファイル成功
                {errorCount > 0 && `・${errorCount}ファイルエラー`}
              </p>
              <p className="text-xs text-gray-400">
                取り込んだ記事は下書き一覧に追加されました
              </p>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-sky-100">
          {done ? (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm transition-colors"
            >
              閉じる
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={files.length === 0 || importing || pendingCount === 0}
              className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                files.length > 0 && !importing && pendingCount > 0
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {importing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {files.length > 0 ? `${pendingCount}件をインポート` : 'ファイルを選択してください'}
                  {files.length > 0 && <ChevronRight className="w-4 h-4" />}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
