/**
 * useSummarizer
 * Transformers.js Web Worker を React から扱うカスタムフック
 *
 * 使い方:
 *   const { modelStatus, progress, loadModel, summarize } = useSummarizer()
 *
 *   // OGPタブを開いたとき or ボタン押下時にモデルをロード
 *   await loadModel()
 *
 *   // テキストを渡して要約を取得
 *   const summary = await summarize(markdownBody)
 */
import { useRef, useState, useCallback, useEffect } from 'react'

/**
 * モデルの状態
 *  'idle'     - まだロードしていない
 *  'loading'  - ダウンロード / 初期化中
 *  'ready'    - 使用可能
 *  'error'    - エラー
 */

let workerSingleton = null // Worker はアプリ全体で 1 つだけ

export function useSummarizer() {
  const [modelStatus, setModelStatus] = useState(() => {
    // すでに Worker が存在するならステータスを引き継ぐ
    return workerSingleton ? 'ready' : 'idle'
  })
  const [progress, setProgress] = useState(null) // { status, name, file, progress }
  const pendingRef = useRef(new Map()) // id → { resolve, reject }
  const idRef = useRef(0)

  // ── Worker のセットアップ ──────────────────────────────────────────
  const getWorker = useCallback(() => {
    if (workerSingleton) return workerSingleton

    workerSingleton = new Worker(
      new URL('./summarize.worker.js', import.meta.url),
      { type: 'module' }
    )
    return workerSingleton
  }, [])

  useEffect(() => {
    const worker = getWorker()

    const handler = (e) => {
      const msg = e.data
      switch (msg.type) {
        case 'status':
          setModelStatus(msg.status)
          break

        case 'progress':
          setProgress(msg)
          break

        case 'ready':
          setModelStatus('ready')
          setProgress(null)
          break

        case 'result': {
          const p = pendingRef.current.get(msg.id)
          if (p) {
            p.resolve({ summary: msg.summary, method: msg.method ?? 'ai' })
            pendingRef.current.delete(msg.id)
          }
          break
        }

        case 'error': {
          if (msg.id != null) {
            const p = pendingRef.current.get(msg.id)
            if (p) {
              p.reject(new Error(msg.error))
              pendingRef.current.delete(msg.id)
            }
          } else {
            setModelStatus('error')
            console.error('[Summarizer Worker]', msg.error)
          }
          break
        }
      }
    }

    worker.addEventListener('message', handler)
    return () => worker.removeEventListener('message', handler)
  }, [getWorker])

  // ── モデルのロード（冪等: 2回目以降はno-op） ────────────────────────
  const loadModel = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (modelStatus === 'ready') { resolve(); return }
      if (modelStatus === 'loading') {
        // ロード中なら完了を待つ
        const interval = setInterval(() => {
          if (modelStatus === 'ready') { clearInterval(interval); resolve() }
          if (modelStatus === 'error')  { clearInterval(interval); reject(new Error('Model load failed')) }
        }, 300)
        return
      }

      const worker = getWorker()

      const onReady = (e) => {
        if (e.data.type === 'ready') {
          worker.removeEventListener('message', onReady)
          resolve()
        }
        if (e.data.type === 'error' && e.data.id == null) {
          worker.removeEventListener('message', onReady)
          reject(new Error(e.data.error))
        }
      }
      worker.addEventListener('message', onReady)
      worker.postMessage({ type: 'load' })
    })
  }, [modelStatus, getWorker])

  // ── 要約の実行 ───────────────────────────────────────────────────
  const summarize = useCallback((text) => {
    return new Promise((resolve, reject) => {
      const worker = getWorker()
      const id = ++idRef.current
      pendingRef.current.set(id, { resolve, reject })
      worker.postMessage({ type: 'summarize', text, id })
    })
  }, [getWorker])

  return { modelStatus, progress, loadModel, summarize }
}
