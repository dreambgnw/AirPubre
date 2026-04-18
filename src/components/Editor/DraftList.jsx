import { useState, useEffect } from 'react'
import { X, PenLine, Clock, Globe, Upload, CheckCircle, Loader2, RefreshCw } from 'lucide-react'
import { getDrafts, deleteDraft, getSiteConfig, saveDraft, getSyncCredential, addPendingDeletion, getPendingDeletions, deduplicateDrafts } from '../../lib/storage.js'
import { buildSite, buildManifest } from '../../lib/builder.js'
import { buildSyncFiles, syncDraftsToGitHub } from '../../lib/sync.js'
import { encryptSyncConfig } from '../../lib/crypto.js'
import { deployToGitHub } from '../../lib/deploy/github.js'
import { deployToVercel } from '../../lib/deploy/vercel.js'
import { downloadAsZip } from '../../lib/deploy/zip.js'
import { deployHeadless } from '../../lib/deploy/headlessGithub.js'

const DEPLOY_TARGET_LABELS = {
  github: 'GitHub Pages',
  vercel: 'Vercel',
  zip:    'ZIPダウンロード',
  'headless-github': 'Headless GitHub',
}

/** 前回デプロイ以降に変更があるか判定 */
function isChanged(draft) {
  if (!draft.lastDeployedAt) return true
  return draft.updatedAt > draft.lastDeployedAt
}

/** デプロイ記事選択＋実行モーダル */
function DeploySelectModal({ onClose }) {
  const [publishedDrafts, setPublishedDrafts] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [deployState, setDeployState] = useState('select')
  const [deployResult, setDeployResult] = useState(null)
  const [deployError, setDeployError] = useState(null)
  const [targetLabel, setTargetLabel] = useState('ZIPダウンロード')
  const [pendingDeletions, setPendingDeletions] = useState([])
  const [isHeadless, setIsHeadless] = useState(false)

  useEffect(() => {
    getDrafts().then(drafts => {
      const published = drafts.filter(d => d.status === 'published')
      setPublishedDrafts(published)
      // 変更ありのもののみデフォルト選択
      setSelected(new Set(published.filter(isChanged).map(d => d.id)))
    })
    getSiteConfig().then(cfg => {
      setTargetLabel(DEPLOY_TARGET_LABELS[cfg.deployTarget] ?? 'ZIPダウンロード')
      setIsHeadless(cfg.deployTarget === 'headless-github')
    })
    getPendingDeletions().then(setPendingDeletions)
  }, [])

  const toggleAll = () => {
    setSelected(s =>
      s.size === publishedDrafts.length
        ? new Set()
        : new Set(publishedDrafts.map(d => d.id))
    )
  }

  const toggle = (id) => {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDeploy = async () => {
    setDeployState('building')
    setDeployError(null)

    try {
      const siteConfig = await getSiteConfig()
      const posts = publishedDrafts.filter(d => selected.has(d.id))

      // Headless モード：静的ビルドをスキップして .md と画像だけ push
      if (siteConfig.deployTarget === 'headless-github') {
        setDeployState('deploying')
        const result = await deployHeadless(posts, siteConfig)

        const deployedAt = new Date().toISOString()
        await Promise.all(
          posts.map(d => saveDraft({ ...d, lastDeployedAt: deployedAt }))
        )
        setDeployResult(result)
        setDeployState('success')
        return
      }

      const normalizedConfig = {
        ...siteConfig,
        title:       siteConfig.siteTitle       || 'My AirPubre Site',
        description: siteConfig.siteDescription || 'Powered by AirPubre',
      }
      const files = await buildSite(posts, normalizedConfig)
      files.set('manifest.json', buildManifest(posts, normalizedConfig))

      // 同期が有効なら _sync/ ファイルを追加
      const syncCred = await getSyncCredential()
      if (syncCred && siteConfig.syncPassphrase) {
        const allDrafts = await getDrafts()
        const syncFiles = await buildSyncFiles(allDrafts, syncCred, siteConfig.syncPassphrase)
        for (const [path, content] of syncFiles) files.set(path, content)
      }

      // クロスデバイス同期用 airpubre/sync.enc（syncPassphrase で暗号化した設定）
      if (siteConfig.syncPassphrase) {
        try {
          const { githubToken: _t, vercelToken: _v, syncPassphrase: _s, ...safe } = siteConfig
          const encrypted = await encryptSyncConfig(safe, siteConfig.syncPassphrase)
          files.set('airpubre/sync.enc', encrypted)
          files.set('airpubre/config.json', JSON.stringify(safe, null, 2))
        } catch (_) { /* 暗号化失敗時は skip */ }
      }

      setDeployState('deploying')

      const target = siteConfig.deployTarget
      let result

      if (target === 'github') {
        const [owner, repo] = (siteConfig.githubRepo ?? '').split('/')
        if (!owner || !repo) throw new Error('GitHub リポジトリ名が未設定です（設定画面で owner/repo 形式で入力）')
        if (!siteConfig.githubToken) throw new Error('GitHub Token が未設定です')
        const ghSiteUrl = siteConfig.baseUrl && siteConfig.baseUrl !== '/'
          ? siteConfig.baseUrl.replace(/\/$/, '') + '/' : undefined
        result = await deployToGitHub(files, {
          token:  siteConfig.githubToken,
          owner, repo,
          branch: siteConfig.githubBranch || 'gh-pages',
          siteUrl: ghSiteUrl,
        })
      } else if (target === 'vercel') {
        // Vercel × GitHub 連携：GitHub にプッシュ → Vercel が自動デプロイ
        if (siteConfig.vercelFromGitHub) {
          const [owner, repo] = (siteConfig.githubRepo ?? '').split('/')
          if (!owner || !repo) throw new Error('GitHub リポジトリ名が未設定です（設定画面で owner/repo 形式で入力）')
          if (!siteConfig.githubToken) throw new Error('GitHub Token が未設定です')
          result = await deployToGitHub(files, {
            token:  siteConfig.githubToken,
            owner, repo,
            branch: siteConfig.githubBranch || 'main',
          })
        } else {
          if (!siteConfig.vercelToken) throw new Error('Vercel Token が未設定です')
          result = await deployToVercel(files, {
            token:       siteConfig.vercelToken,
            projectName: siteConfig.vercelProjectId || 'airpubre-site',
          })
        }
      } else {
        await downloadAsZip(files)
        result = { url: null }
      }

      // デプロイした記事に lastDeployedAt をセット
      const deployedAt = new Date().toISOString()
      await Promise.all(
        publishedDrafts
          .filter(d => selected.has(d.id))
          .map(d => saveDraft({ ...d, lastDeployedAt: deployedAt }))
      )

      setDeployResult(result)
      setDeployState('success')
    } catch (err) {
      setDeployError(err.message)
      setDeployState('error')
    }
  }

  const isProcessing = deployState === 'building' || deployState === 'deploying'
  const steps = [
    { id: 'building',  label: 'サイトを生成中' },
    { id: 'deploying', label: targetLabel === 'ZIPダウンロード' ? 'ZIPを作成中' : `${targetLabel} へ送信中` },
  ]
  const stepIndex = steps.findIndex(s => s.id === deployState)

  const changedDrafts   = publishedDrafts.filter(isChanged)
  const unchangedCount  = publishedDrafts.length - changedDrafts.length
  const [showUnchanged, setShowUnchanged] = useState(false)
  const visibleDrafts   = showUnchanged ? publishedDrafts : changedDrafts

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 space-y-5 max-h-[90vh] overflow-y-auto">

        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-500" />
            <h2 className="text-sm font-bold text-gray-800">
              {deployState === 'success' ? 'サイト更新完了'
               : deployState === 'error'   ? 'サイト更新に失敗しました'
               : isProcessing              ? `${targetLabel} にサイトを更新中`
               : `サイトを更新 — ${targetLabel}`}
            </h2>
          </div>
          {!isProcessing && (
            <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 記事選択 */}
        {deployState === 'select' && (
          <>
            {publishedDrafts.length === 0 && !(isHeadless && pendingDeletions.length > 0) ? (
              <p className="text-sm text-gray-400 py-4 text-center">
                掲載済みの記事がないよ。<br />
                記事を開いて「下書き完了」を押してね。
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  {/* 全選択（表示中の記事のみ） */}
                  {visibleDrafts.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="flex items-center gap-2 text-xs text-sky-500 hover:text-sky-700 mb-2"
                    >
                      <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                        selected.size === publishedDrafts.length
                          ? 'bg-sky-500 border-sky-500'
                          : 'border-gray-300'
                      }`}>
                        {selected.size === publishedDrafts.length && (
                          <CheckCircle className="w-2.5 h-2.5 text-white" />
                        )}
                      </span>
                      すべて選択 / 解除
                    </button>
                  )}

                  {/* 変更ありが 0 件の場合 */}
                  {changedDrafts.length === 0 && !showUnchanged && (
                    <p className="text-sm text-gray-400 py-3 text-center">
                      前回から変更された記事はないよ
                    </p>
                  )}

                  {/* 記事リスト（変更ありのみ or 全件） */}
                  {visibleDrafts.map(draft => {
                    const isChecked  = selected.has(draft.id)
                    const changed    = isChanged(draft)
                    const date = new Date(draft.publishedAt ?? draft.updatedAt).toLocaleDateString('ja-JP', {
                      month: 'short', day: 'numeric',
                    })
                    return (
                      <button
                        key={draft.id}
                        onClick={() => toggle(draft.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                          isChecked
                            ? 'bg-sky-50 border border-sky-200'
                            : 'bg-gray-50 border border-transparent'
                        }`}
                      >
                        <span className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          isChecked ? 'bg-sky-500 border-sky-500' : 'border-gray-300'
                        }`}>
                          {isChecked && <CheckCircle className="w-2.5 h-2.5 text-white" />}
                        </span>

                        {/* サムネイル（あれば） */}
                        {draft.thumbnail && (
                          <img
                            src={draft.thumbnail}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                            onError={e => { e.target.style.display = 'none' }}
                          />
                        )}

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${changed ? 'text-gray-800' : 'text-gray-400'}`}>
                            {draft.title || '（タイトルなし）'}
                          </p>
                          <p className="text-xs text-gray-400 font-mono truncate">
                            {draft.slug || '—'} · {date}
                          </p>
                        </div>

                        {/* 変更なしバッジ */}
                        {!changed && (
                          <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                            変更なし
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* 変更なし記事の折りたたみ */}
                {unchangedCount > 0 && (
                  <button
                    onClick={() => setShowUnchanged(v => !v)}
                    className="w-full text-xs text-gray-400 hover:text-sky-500 transition-colors py-2 flex items-center justify-center gap-1"
                  >
                    {showUnchanged
                      ? '変更なしの記事を隠す'
                      : `変更なしの記事（${unchangedCount}件）を表示`}
                  </button>
                )}

                {/* 削除待ちの通知（headless モードのみ） */}
                {isHeadless && pendingDeletions.length > 0 && (
                  <div className="text-xs bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-rose-700">
                    <p className="font-semibold mb-1">🗑 削除伝播あり: {pendingDeletions.length} 件</p>
                    <p className="text-rose-600/80 font-mono truncate">
                      {pendingDeletions.slice(0, 3).map(p => p.slug).join(', ')}
                      {pendingDeletions.length > 3 && ` 他 ${pendingDeletions.length - 3} 件`}
                    </p>
                    <p className="text-rose-500/80 mt-1">次回プッシュ時に GitHub リポからも削除されるよ</p>
                  </div>
                )}

                {/* manifest.json の説明 */}
                {!isHeadless && (
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                    ZIPには選んだ記事のHTMLと <span className="font-mono text-gray-600">manifest.json</span>（slug ↔ パス対応表）が含まれるよ。
                  </p>
                )}

                <button
                  onClick={handleDeploy}
                  disabled={selected.size === 0 && !(isHeadless && pendingDeletions.length > 0)}
                  className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {selected.size > 0
                    ? `${selected.size} 件でサイトを更新`
                    : `${pendingDeletions.length} 件の削除を同期`}
                </button>
              </>
            )}
          </>
        )}

        {/* 進捗ステップ */}
        {isProcessing && (
          <div className="space-y-3">
            {steps.map((step, i) => {
              const isDone   = i < stepIndex
              const isActive = i === stepIndex
              return (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isDone   ? 'bg-sky-500' :
                    isActive ? 'bg-sky-100'  : 'bg-gray-100'
                  }`}>
                    {isDone   ? <CheckCircle className="w-3.5 h-3.5 text-white" /> :
                     isActive ? <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" /> :
                                <span className="w-2 h-2 rounded-full bg-gray-300 block" />}
                  </div>
                  <span className={`text-sm ${
                    isActive ? 'text-gray-800 font-medium' :
                    isDone   ? 'text-gray-500' : 'text-gray-300'
                  }`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* 成功 */}
        {deployState === 'success' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">
                {targetLabel === 'ZIPダウンロード' ? 'ZIPをダウンロードしたよ！' : 'サイトを更新したよ！'}
              </span>
            </div>
            {deployResult?.url && (
              <a
                href={deployResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-sky-500 hover:text-sky-700 underline break-all"
              >
                {deployResult.url}
              </a>
            )}
            <button
              onClick={onClose}
              className="w-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              閉じる
            </button>
          </div>
        )}

        {/* エラー */}
        {deployState === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-red-500 leading-relaxed">{deployError}</p>
            <button
              onClick={onClose}
              className="w-full border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 rounded-xl transition-colors hover:bg-gray-50"
            >
              閉じる
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-sky-100 p-4 animate-pulse">
          <div className="h-4 bg-gray-100 rounded-full w-3/4 mb-3" />
          <div className="h-3 bg-gray-100 rounded-full w-1/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded-full w-1/2" />
        </div>
      ))}
    </div>
  )
}

export default function DraftList({ onOpen, refreshKey }) {
  const [drafts, setDrafts]       = useState([])
  const [loading, setLoading]     = useState(true)
  const [showDeploy, setShowDeploy] = useState(false)
  const [pendingDeletionCount, setPendingDeletionCount] = useState(0)

  // 同期専用プッシュ
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState(null)   // null | { ok: boolean, text: string }
  const [canGitHubSync, setCanGitHubSync] = useState(false)

  useEffect(() => {
    setLoading(true)
    deduplicateDrafts()
      .then(count => {
        if (count > 0) setSyncMsg({ ok: true, text: `重複記事を ${count} 件自動削除しました（slug が同じで古い方）` })
        return getDrafts()
      })
      .then(d => {
        setDrafts(d)
        setLoading(false)
      })
    getPendingDeletions().then(p => setPendingDeletionCount(p.length))

    // GitHub 同期ボタンの表示判定
    Promise.all([getSiteConfig(), getSyncCredential()]).then(([cfg, cred]) => {
      setCanGitHubSync(
        !!cred && !!cfg.syncPassphrase &&
        (cfg.deployTarget === 'github' || cfg.deployTarget === 'headless-github')
      )
    })
  }, [refreshKey, showDeploy])

  const handleGitHubSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const [allDrafts, config, syncCred] = await Promise.all([
        getDrafts(),
        getSiteConfig(),
        getSyncCredential(),
      ])
      await syncDraftsToGitHub(allDrafts, syncCred, config.syncPassphrase, config)
      setSyncMsg({ ok: true, text: '同期データを GitHub に送信しました' })
    } catch (e) {
      setSyncMsg({ ok: false, text: e.message })
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('この下書きを削除しますか？')) return
    const draft = drafts.find(x => x.id === id)
    await deleteDraft(id)

    // headless モードでデプロイ済みの記事だった場合、次回プッシュで GitHub からも消す
    const cfg = await getSiteConfig()
    if (cfg.deployTarget === 'headless-github' && draft?.slug && draft?.lastDeployedAt) {
      let thumbnailFilename = null
      if (draft.thumbnail) {
        // buildHeadlessFiles と同じ命名ロジック（slug 最終セグメント + 拡張子）
        const baseName = draft.slug.split('/').pop().replace(/[^\w\-]/g, '_')
        if (draft.thumbnail.startsWith('data:')) {
          const m = /^data:image\/([a-z]+);/.exec(draft.thumbnail)
          const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : 'webp'
          thumbnailFilename = `${baseName}.${ext}`
        } else if (/^https?:\/\//.test(draft.thumbnail)) {
          thumbnailFilename = draft.thumbnail.split('/').pop()
        } else {
          thumbnailFilename = draft.thumbnail
        }
      }
      await addPendingDeletion({ slug: draft.slug, thumbnailFilename })
    }

    setDrafts(d => d.filter(x => x.id !== id))
  }

  if (loading) return <Skeleton />

  const publishedCount = drafts.filter(d => d.status === 'published').length

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-sky-50 flex items-center justify-center">
          <PenLine className="w-7 h-7 text-sky-300" />
        </div>
        <div>
          <p className="text-gray-600 font-medium mb-1">まだ記事がないよ</p>
          <p className="text-sm text-gray-400">「＋ 新規投稿」から書き始めよう！</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {showDeploy && <DeploySelectModal onClose={() => setShowDeploy(false)} />}

      <div className="space-y-4">
        {/* ヘッダー行 */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-gray-400">
            {drafts.length} 件
            {publishedCount > 0 && (
              <span className="ml-2 text-emerald-500 font-medium">（掲載済み {publishedCount} 件）</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {/* GitHub 同期専用ボタン（syncPassphrase + GitHub デプロイ設定済みのとき表示） */}
            {canGitHubSync && (
              <button
                onClick={handleGitHubSync}
                disabled={syncing}
                title="フルデプロイなしで下書きデータだけ GitHub に同期"
                className="flex items-center gap-1.5 text-xs font-semibold border border-sky-300 text-sky-600 hover:bg-sky-50 disabled:opacity-50 px-3 py-2 rounded-lg transition-colors"
              >
                {syncing
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                下書きを同期
              </button>
            )}
            {(publishedCount > 0 || pendingDeletionCount > 0) && (
              <button
                onClick={() => setShowDeploy(true)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white px-3 py-2 rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                サイトを更新
                {pendingDeletionCount > 0 && (
                  <span className="ml-0.5 bg-rose-400 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                    -{pendingDeletionCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 同期結果トースト */}
        {syncMsg && (
          <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${
            syncMsg.ok
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {syncMsg.ok
              ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              : <X className="w-3.5 h-3.5 shrink-0" />}
            {syncMsg.text}
          </div>
        )}

        {/* グリッド */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {drafts.map(draft => {
            const date = new Date(draft.updatedAt).toLocaleDateString('ja-JP', {
              month: 'short', day: 'numeric',
            })
            const time = new Date(draft.updatedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit', minute: '2-digit',
            })
            const excerpt = (draft.body ?? '')
              .replace(/^#{1,6}\s+/gm, '')
              .replace(/```[\s\S]*?```/g, '')
              .replace(/[*_`>]/g, '')
              .trim()
              .slice(0, 80)

            return (
              <div
                key={draft.id}
                onClick={() => onOpen(draft)}
                className="group bg-white rounded-2xl border border-sky-100 cursor-pointer hover:border-sky-300 hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* サムネイル */}
                {draft.thumbnail && (
                  <img
                    src={draft.thumbnail}
                    alt=""
                    className="w-full h-28 object-cover"
                    onError={e => { e.target.style.display = 'none' }}
                  />
                )}

                <div className="p-4 flex flex-col gap-2 flex-1">
                  {/* タイトル行 */}
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-gray-800 leading-snug line-clamp-2 flex-1">
                      {draft.title || '（タイトルなし）'}
                    </h2>
                    <button
                      onClick={e => handleDelete(draft.id, e)}
                      className="text-gray-200 hover:text-red-400 transition-colors shrink-0 p-0.5 opacity-0 group-hover:opacity-100"
                      title="削除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 本文プレビュー（PCのみ） */}
                  {excerpt && (
                    <p className="hidden md:block text-xs text-gray-400 line-clamp-2 leading-relaxed">
                      {excerpt}
                    </p>
                  )}

                  {/* タグ */}
                  {draft.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {draft.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs bg-sky-50 text-sky-600 px-2 py-0.5 rounded-full">
                          {tag}
                        </span>
                      ))}
                      {draft.tags.length > 3 && (
                        <span className="text-xs text-gray-400">+{draft.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* 日時 + ステータスバッジ */}
                  <div className="flex items-center gap-1 mt-auto pt-1">
                    <Clock className="w-3 h-3 text-gray-300" />
                    <span className="text-xs text-gray-400">{date} {time}</span>
                    <div className="ml-auto flex items-center gap-1">
                      {draft.status === 'published' ? (
                        <span className="flex items-center gap-0.5 text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                          <Globe className="w-2.5 h-2.5" />
                          掲載済み
                        </span>
                      ) : draft.summary ? (
                        <span className="text-xs bg-sky-50 text-sky-500 px-1.5 py-0.5 rounded font-medium">
                          概要あり
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
