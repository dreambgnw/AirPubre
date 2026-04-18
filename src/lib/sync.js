/**
 * AirPubre デバイス間同期
 * WebAuthn パスキー + AES-GCM 暗号化
 *
 * デプロイ先に _sync/pubkey.json と _sync/data.enc.json を配置し、
 * 別デバイスがそれを fetch して復号することで記事データを同期する。
 */

// ── バッファ変換ユーティリティ ────────────────────────────────────

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBuf(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function bufToBase64url(buf) {
  return bufToBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuf(b64url) {
  return base64ToBuf(b64url.replace(/-/g, '+').replace(/_/g, '/'))
}

function concatBufs(a, b) {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(new Uint8Array(a), 0)
  out.set(new Uint8Array(b), a.byteLength)
  return out.buffer
}

// ── WebAuthn パスキー ─────────────────────────────────────────────

/**
 * パスキーを登録する（RP ID = 現在のホスト名）
 * @returns {{ credentialId: string, publicKey: string, rpId: string }}
 */
export async function registerSyncPasskey() {
  const rpId = window.location.hostname
  const challenge = crypto.getRandomValues(new Uint8Array(32))

  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { id: rpId, name: 'AirPubre Sync' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'airpubre-sync',
        displayName: 'AirPubre Sync',
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },    // ES256
        { type: 'public-key', alg: -257 },   // RS256
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    },
  })

  const pubKeyDer = cred.response.getPublicKey()
  return {
    credentialId: bufToBase64url(cred.rawId),
    publicKey:    pubKeyDer ? bufToBase64(pubKeyDer) : null,
    rpId,
  }
}

/**
 * パスキーで認証して署名を検証する
 * RP ID が合わない環境（別ホスト）では false を返し、パスフレーズ認証のみに fallback。
 * @param {{ credentialId: string, publicKey: string, rpId: string }} passkeyInfo
 * @returns {Promise<boolean>}
 */
export async function authenticateSyncPasskey(passkeyInfo) {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  let assertion
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        rpId: passkeyInfo.rpId,
        challenge,
        allowCredentials: [
          { type: 'public-key', id: base64urlToBuf(passkeyInfo.credentialId) },
        ],
        userVerification: 'required',
      },
    })
  } catch {
    // RP ID の不一致など → パスフレーズのみで続行
    return false
  }

  if (!passkeyInfo.publicKey || !assertion) return false

  try {
    const pubKeyDer = base64ToBuf(passkeyInfo.publicKey)
    const cryptoKey = await crypto.subtle.importKey(
      'spki', pubKeyDer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false, ['verify']
    )
    const clientDataHash = await crypto.subtle.digest(
      'SHA-256', assertion.response.clientDataJSON
    )
    const signedData = concatBufs(assertion.response.authenticatorData, clientDataHash)
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      assertion.response.signature,
      signedData
    )
  } catch {
    return false
  }
}

// ── データ暗号化 / 復号 ───────────────────────────────────────────

async function deriveKey(passphrase, salt, usage) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase),
    'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(salt), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, [usage]
  )
}

/**
 * 全記事を暗号化してシリアライズ
 * @param {Array} drafts
 * @param {string} passphrase
 * @returns {string} JSON 文字列
 */
export async function encryptDrafts(drafts, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const aesKey = await deriveKey(passphrase, salt, 'encrypt')
  const plaintext = new TextEncoder().encode(JSON.stringify(drafts))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext)
  return JSON.stringify({
    version: 1,
    iv:   bufToBase64(iv),
    salt: bufToBase64(salt),
    data: bufToBase64(ciphertext),
  })
}

/**
 * 暗号化データを復号
 * @param {Object|string} encObjOrJson
 * @param {string} passphrase
 * @returns {Array} drafts
 */
export async function decryptDrafts(encObjOrJson, passphrase) {
  const enc = typeof encObjOrJson === 'string' ? JSON.parse(encObjOrJson) : encObjOrJson
  const salt       = base64ToBuf(enc.salt)
  const iv         = base64ToBuf(enc.iv)
  const ciphertext = base64ToBuf(enc.data)
  const aesKey = await deriveKey(passphrase, salt, 'decrypt')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext))
}

// ── デプロイ用ファイル生成 ────────────────────────────────────────

/**
 * デプロイに含める _sync/ ファイルを生成
 * @param {Array} drafts - 全記事（下書き含む）
 * @param {{ credentialId, publicKey, rpId }} passkeyInfo
 * @param {string} passphrase
 * @returns {Map<string, string>} path → content
 */
export async function buildSyncFiles(drafts, passkeyInfo, passphrase) {
  const files = new Map()
  files.set('_sync/pubkey.json', JSON.stringify(passkeyInfo, null, 2))
  files.set('_sync/data.enc.json', await encryptDrafts(drafts, passphrase))
  return files
}

// ── GitHub への同期専用プッシュ ────────────────────────────────

/**
 * フルデプロイなしで _sync/ ファイルだけ GitHub に push する。
 * deployTarget が 'github' / 'headless-github' のときに使用。
 *
 * PC で下書きを書いた後、すぐにスマホから参照したい場合など
 * 記事を公開せずに同期データだけ更新したいときに使う。
 *
 * @param {Array} drafts - 全記事（下書き含む）
 * @param {{ credentialId, publicKey, rpId }} passkeyInfo
 * @param {string} passphrase
 * @param {{ githubToken, githubRepo, githubBranch }} config
 */
export async function syncDraftsToGitHub(drafts, passkeyInfo, passphrase, config) {
  const { deployToGitHub } = await import('./deploy/github.js')
  const files = await buildSyncFiles(drafts, passkeyInfo, passphrase)
  const [owner, repo] = (config.githubRepo ?? '').split('/')
  if (!owner || !repo) throw new Error('GitHub リポジトリ名が未設定です（設定画面で owner/repo 形式で入力）')
  if (!config.githubToken) throw new Error('GitHub Token が未設定です')
  return deployToGitHub(files, {
    token:  config.githubToken,
    owner,
    repo,
    branch: config.githubBranch || 'gh-pages',
    message: 'sync: update draft data via AirPubre',
  })
}

// ── インポート ────────────────────────────────────────────────────

/**
 * 別端末の公開済みサイトからデータを取り込む
 * @param {string} syncUrl - ブログURL（例: https://mysite.github.io）
 * @param {string} passphrase
 * @param {(msg: string) => void} onStatus - 進捗コールバック
 * @returns {Array} drafts
 */
export async function importFromSyncUrl(syncUrl, passphrase, onStatus = () => {}) {
  const base = syncUrl.replace(/\/$/, '')

  onStatus('同期データを確認中...')
  const pubkeyRes = await fetch(`${base}/_sync/pubkey.json`)
  if (!pubkeyRes.ok) {
    throw new Error('同期データが見つかりませんでした。ブログURLを確認してください。\n（まだデプロイしていない場合は、先にサイトを更新してください）')
  }
  const passkeyInfo = await pubkeyRes.json()

  onStatus('パスキーで認証中...')
  const verified = await authenticateSyncPasskey(passkeyInfo)
  if (!verified) {
    // パスキー認証は任意（RP ID が違う環境では失敗するが続行）
    onStatus('パスキー認証をスキップ（パスフレーズで復号します）')
  } else {
    onStatus('パスキー認証に成功しました')
  }

  onStatus('データを取得中...')
  const dataRes = await fetch(`${base}/_sync/data.enc.json`)
  if (!dataRes.ok) throw new Error('同期データの取得に失敗しました。')
  const encObj = await dataRes.json()

  onStatus('復号中...')
  return await decryptDrafts(encObj, passphrase)
}
