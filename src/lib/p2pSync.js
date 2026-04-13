/**
 * WebRTC P2P デバイス間同期
 *
 * PeerJS DataChannel を使い、2台のブラウザ間で
 * ドラフトと siteConfig を直接同期する。
 */

import Peer from 'peerjs'
import { getDrafts, importDrafts, getSiteConfig, saveSiteConfig, getAuthInfo, saveAuthInfo, getSetupState, saveSetupState } from './storage.js'

const PEER_PREFIX = 'airpubre-'
const CHUNK_SIZE = 60_000          // 60KB — DataChannel 安全サイズ
const CONNECT_TIMEOUT = 30_000     // 30秒
const SENSITIVE_KEYS = ['githubToken', 'vercelToken', 'syncPassphrase']

// ── ルームコード ──────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 0/O/1/I/L 除外

export function generateRoomCode() {
  const buf = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(buf, b => CODE_CHARS[b % CODE_CHARS.length]).join('')
}

// ── チャンク送受信 ────────────────────────────────────────────

function sendChunked(conn, msg) {
  const json = JSON.stringify(msg)
  if (json.length <= CHUNK_SIZE) {
    conn.send(json)
    return
  }
  const id = crypto.randomUUID()
  const total = Math.ceil(json.length / CHUNK_SIZE)
  for (let i = 0; i < total; i++) {
    conn.send(JSON.stringify({
      type: 'chunk', id, index: i, total,
      data: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    }))
  }
}

function createChunkAssembler() {
  const buffers = new Map() // id -> { total, parts: Map<index, data> }
  return function assemble(raw) {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (msg.type !== 'chunk') return msg
    let entry = buffers.get(msg.id)
    if (!entry) {
      entry = { total: msg.total, parts: new Map() }
      buffers.set(msg.id, entry)
    }
    entry.parts.set(msg.index, msg.data)
    if (entry.parts.size < entry.total) return null // まだ揃ってない
    // 全チャンク揃った → 結合
    const parts = []
    for (let i = 0; i < entry.total; i++) parts.push(entry.parts.get(i))
    buffers.delete(msg.id)
    return JSON.parse(parts.join(''))
  }
}

// ── siteConfig サニタイズ ─────────────────────────────────────

function sanitizeConfig(config) {
  const clean = { ...config }
  for (const k of SENSITIVE_KEYS) delete clean[k]
  return clean
}

// ── 同期プロトコル ────────────────────────────────────────────

async function runSyncProtocol(conn, onStatus, { includeAuth = false } = {}) {
  const localDrafts = await getDrafts()
  const localConfig = await getSiteConfig()

  return new Promise((resolve, reject) => {
    const assemble = createChunkAssembler()
    let phase = 'manifest'
    let importedCount = 0
    let gotData = false
    let gotDone = false
    let remoteSent = 0

    const tryFinish = () => {
      if (gotData && gotDone) {
        resolve({ imported: importedCount, sent: remoteSent })
      }
    }

    // Phase 1: マニフェスト送信
    const manifest = {
      type: 'manifest',
      drafts: localDrafts.map(d => ({ id: d.id, updatedAt: d.updatedAt })),
    }
    sendChunked(conn, manifest)
    onStatus?.('マニフェストを交換中...')

    conn.on('data', async (raw) => {
      try {
        const msg = assemble(raw)
        if (!msg) return // チャンク未完成

        if (msg.type === 'manifest' && phase === 'manifest') {
          phase = 'request'

          // 差分計算: ローカルにない or リモートの方が新しいドラフトのIDを収集
          const localMap = new Map(localDrafts.map(d => [d.id, d.updatedAt ?? '']))
          const needIds = []
          for (const rd of msg.drafts) {
            const localUpdated = localMap.get(rd.id)
            if (localUpdated === undefined || (rd.updatedAt ?? '') > localUpdated) {
              needIds.push(rd.id)
            }
          }

          // リクエスト送信
          sendChunked(conn, { type: 'request', ids: needIds, wantConfig: true, wantAuth: includeAuth })
          onStatus?.(`${needIds.length} 件のドラフトをリクエスト中...`)
        }

        if (msg.type === 'request') {
          // 相手が要求するドラフトを送信
          const requestedDrafts = localDrafts.filter(d => msg.ids.includes(d.id))
          const payload = { type: 'data', drafts: requestedDrafts }
          if (msg.wantConfig) payload.config = sanitizeConfig(localConfig)
          if (msg.wantAuth) {
            try {
              payload.auth = await getAuthInfo()
              const setup = await getSetupState()
              if (setup) payload.setup = setup
            } catch (_) {}
          }
          sendChunked(conn, payload)
          onStatus?.(`${requestedDrafts.length} 件のドラフトを送信中...`)
        }

        if (msg.type === 'data') {
          onStatus?.('データを取り込み中...')
          // ドラフト取り込み
          if (msg.drafts?.length) {
            importedCount = await importDrafts(msg.drafts)
          }
          // config マージ
          if (msg.config) {
            const current = await getSiteConfig()
            const merged = { ...current }
            for (const [k, v] of Object.entries(msg.config)) {
              if (v && !SENSITIVE_KEYS.includes(k) && !current[k]) {
                merged[k] = v
              }
            }
            await saveSiteConfig(merged)
          }
          // 認証情報の取り込み
          if (msg.auth?.masterKeyHash && msg.auth?.subKeyHash) {
            await saveAuthInfo(msg.auth)
          }
          // セットアップ状態の取り込み（未セットアップの場合）
          if (msg.setup) {
            const local = await getSetupState()
            if (!local?.completed) {
              await saveSetupState({ ...msg.setup, createdAt: new Date().toISOString() })
            }
          }
          // 完了通知
          sendChunked(conn, { type: 'done', imported: importedCount })
          onStatus?.('同期完了')
          gotData = true
          tryFinish()
        }

        if (msg.type === 'done') {
          remoteSent = msg.imported
          gotDone = true
          tryFinish()
        }
      } catch (e) {
        reject(e)
      }
    })

    conn.on('error', reject)
  })
}

// ── ホストセッション ──────────────────────────────────────────

export function hostSession(roomCode, { onStatus, onComplete, onError, includeAuth = false }) {
  const peerId = PEER_PREFIX + roomCode
  const peer = new Peer(peerId)
  let settled = false

  const cleanup = () => {
    try { peer.destroy() } catch (_) {}
  }

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true
      cleanup()
      onError?.('接続がタイムアウトしました。もう一度お試しください。')
    }
  }, CONNECT_TIMEOUT)

  peer.on('open', () => {
    onStatus?.('接続待ち...')
  })

  peer.on('connection', (conn) => {
    clearTimeout(timeout)
    conn.on('open', async () => {
      if (settled) return
      onStatus?.('接続しました！同期中...')
      try {
        const result = await runSyncProtocol(conn, onStatus, { includeAuth })
        settled = true
        cleanup()
        onComplete?.(result)
      } catch (e) {
        settled = true
        cleanup()
        onError?.(e.message)
      }
    })
  })

  peer.on('error', (err) => {
    clearTimeout(timeout)
    if (!settled) {
      settled = true
      cleanup()
      onError?.(err.message || '接続エラーが発生しました')
    }
  })

  // 手動キャンセル用
  return { cancel: () => { settled = true; clearTimeout(timeout); cleanup() } }
}

// ── ジョインセッション ────────────────────────────────────────

export function joinSession(roomCode, { onStatus, onComplete, onError, includeAuth = false }) {
  const peerId = PEER_PREFIX + roomCode
  const peer = new Peer()
  let settled = false

  const cleanup = () => {
    try { peer.destroy() } catch (_) {}
  }

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true
      cleanup()
      onError?.('接続がタイムアウトしました。コードを確認してもう一度お試しください。')
    }
  }, CONNECT_TIMEOUT)

  peer.on('open', () => {
    onStatus?.('接続中...')
    const conn = peer.connect(peerId, { reliable: true })

    conn.on('open', async () => {
      clearTimeout(timeout)
      if (settled) return
      onStatus?.('接続しました！同期中...')
      try {
        const result = await runSyncProtocol(conn, onStatus, { includeAuth })
        settled = true
        cleanup()
        onComplete?.(result)
      } catch (e) {
        settled = true
        cleanup()
        onError?.(e.message)
      }
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      if (!settled) {
        settled = true
        cleanup()
        onError?.(err.message || '接続エラーが発生しました')
      }
    })
  })

  peer.on('error', (err) => {
    clearTimeout(timeout)
    if (!settled) {
      settled = true
      cleanup()
      // ピアが見つからない場合の分かりやすいメッセージ
      const msg = err.type === 'peer-unavailable'
        ? 'ルームが見つかりません。コードを確認してください。'
        : (err.message || '接続エラーが発生しました')
      onError?.(msg)
    }
  })

  return { cancel: () => { settled = true; clearTimeout(timeout); cleanup() } }
}
