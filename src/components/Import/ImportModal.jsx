import { useState, useRef, useCallback } from 'react'
import { Upload, X, FileText, Archive, Code, CheckCircle, AlertCircle, ChevronRight, Github, Loader2, GitBranch } from 'lucide-react'
import { importFile } from '../../lib/importer.js'
import { saveDraft } from '../../lib/storage.js'
import { importFromGitHub } from '../../lib/githubImporter.js'

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

/** "https://github.com/owner/repo" / "owner/repo" / "owner/repo/tree/branch/path" を分解する */
function parseGithubUrl(input) {
  if (!input) return null
  let s = input.trim()
  // URL 形式
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/\s]+)\/([^\/\s]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^\/\s]+)(?:\/(.+))?)?\/?$/)
  if (m) {
    return { owner: m[1], repo: m[2], branch: m[3] || null, path: m[4] || null }
  }
  // owner/repo 形式
  const m2 = s.match(/^([^\/\s]+)\/([^\/\s]+?)(?:\.git)?$/)
  if (m2) return { owner: m2[1], repo: m2[2], branch: null, path: null }
  return null
}

export default function ImportModal({ onClose, onImported }) {
  const [tab, setTab] = useState('file') // 'file' | 'github'
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState([])      // { file, status, posts, error }
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef()

  // GitHub クローンタブ用ステート
  const [ghUrl, setGhUrl] = useState('')
  const [ghBranch, setGhBranch] = useState('')
  const [ghPostsDir, setGhPostsDir] = useState('blog/posts')
  const [ghThumbDir, setGhThumbDir] = useState('blog/thumbnails')
  const [ghToken, setGhToken] = useState('')
  const [ghForce, setGhForce] = useState(true)
  const [ghCloning, setGhCloning] = useState(false)
  const [ghProgress, setGhProgress] = useState(null)
  const [ghResult, setGhResult] = useState(null)
  const [ghError, setGhError] = useState(null)

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

  // ── GitHub クローン実行 ─────────────────────────────
  const handleGithubClone = async () => {
    setGhError(null)
    setGhResult(null)
    const parsed = parseGithubUrl(ghUrl)
    if (!parsed) {
      setGhError('URL を正しく解析できませんでした（例: https://github.com/user/repo）')
      return
    }
    setGhCloning(true)
    setGhProgress({ done: 0, total: 0, name: '' })
    try {
      const branch = ghBranch || parsed.branch || 'main'
      // URL 内の path が指定されていれば postsDir として優先
      const postsDir = (parsed.path && parsed.path.trim()) || ghPostsDir || 'blog/posts'
      const result = await importFromGitHub({
        owner: parsed.owner,
        repo: parsed.repo,
        branch,
        postsDir,
        thumbnailsDir: ghThumbDir || 'blog/thumbnails',
        token: ghToken || undefined,
        force: ghForce,
        onProgress: (p) => setGhProgress(p),
      })
      setGhResult(result)
      if (result.imported > 0) onImported?.(result.imported)
    } catch (e) {
      setGhError(e.message)
    } finally {
      setGhCloning(false)
    }
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
            <p className="text-xs text-gray-400 mt-0.5">ファイル / GitHub リポジトリ対応</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-sky-100 px-3">
          <button
            onClick={() => setTab('file')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === 'file'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            ファイルから
          </button>
          <button
            onClick={() => setTab('github')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === 'github'
                ? 'border-sky-500 text-sky-600'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            GitHub から
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ドロップゾーン */}
          {tab === 'file' && !done && (
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
          {tab === 'file' && files.length > 0 && (
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

          {/* 完了サマリー（ファイル） */}
          {tab === 'file' && done && (
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

          {/* ── GitHub クローンパネル ───────────────────────────── */}
          {tab === 'github' && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-sky-100 p-4 space-y-3 bg-sky-50/40">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    リポジトリ URL
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-sky-300">
                    <GitBranch className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <input
                      type="text"
                      value={ghUrl}
                      onChange={e => setGhUrl(e.target.value)}
                      placeholder="https://github.com/user/repo  または  user/repo"
                      className="flex-1 bg-transparent text-sm outline-none font-mono"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    <span className="font-mono">/tree/branch/path</span> を含む URL も OK。path が指定されていれば記事ディレクトリとして優先される。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">ブランチ</label>
                    <input
                      type="text"
                      value={ghBranch}
                      onChange={e => setGhBranch(e.target.value)}
                      placeholder="main"
                      className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">記事 dir</label>
                    <input
                      type="text"
                      value={ghPostsDir}
                      onChange={e => setGhPostsDir(e.target.value)}
                      placeholder="blog/posts"
                      className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">サムネイル dir</label>
                  <input
                    type="text"
                    value={ghThumbDir}
                    onChange={e => setGhThumbDir(e.target.value)}
                    placeholder="blog/thumbnails"
                    className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Token（private リポジトリのみ）
                  </label>
                  <input
                    type="password"
                    value={ghToken}
                    onChange={e => setGhToken(e.target.value)}
                    placeholder="ghp_... / 空欄可"
                    className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white font-mono"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={ghForce}
                    onChange={e => setGhForce(e.target.checked)}
                    className="rounded border-sky-300"
                  />
                  ローカル未デプロイ変更があっても上書きする（クローン用途）
                </label>
              </div>

              {/* 進捗 */}
              {ghCloning && ghProgress && (
                <div className="rounded-xl border border-sky-100 bg-white p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-sky-600">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="font-mono truncate flex-1">{ghProgress.name || '一覧を取得中…'}</span>
                    <span className="text-gray-400 shrink-0">
                      {ghProgress.done}/{ghProgress.total || '?'}
                    </span>
                  </div>
                  {ghProgress.total > 0 && (
                    <div className="h-1 bg-sky-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 transition-all"
                        style={{ width: `${(ghProgress.done / ghProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 結果 */}
              {ghResult && !ghCloning && (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-center space-y-1">
                  <CheckCircle className="w-7 h-7 text-sky-500 mx-auto" />
                  <p className="text-sm font-bold text-gray-800">クローン完了！</p>
                  <p className="text-xs text-gray-500">
                    {ghResult.imported} 件取り込み
                    {ghResult.skipped > 0 && ` / ${ghResult.skipped} 件スキップ`}
                  </p>
                </div>
              )}

              {ghError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {ghError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-4 border-t border-sky-100">
          {tab === 'file' && done ? (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm transition-colors"
            >
              閉じる
            </button>
          ) : tab === 'file' ? (
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
          ) : ghResult ? (
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm transition-colors"
            >
              閉じる
            </button>
          ) : (
            <button
              onClick={handleGithubClone}
              disabled={!ghUrl.trim() || ghCloning}
              className={`w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
                ghUrl.trim() && !ghCloning
                  ? 'bg-sky-500 hover:bg-sky-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {ghCloning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Github className="w-4 h-4" />
                  リポジトリからクローン
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
