/**
 * AirPubre パスキー (WebAuthn) ライブラリ
 *
 * ブラウザの WebAuthn API を使ったパスキー登録・認証。
 * パスワードマネージャー（BitWarden, Google, iCloud Keychain 等）経由で
 * クロスデバイスでもパスキーを共有できる。
 *
 * クライアントサイド完結のため、challenge はランダム生成し
 * authenticator の応答が成功すれば認証とみなす。
 */

const RP_NAME = 'AirPubre'

/** WebAuthn が使えるか */
export function isPasskeySupported() {
  return !!(navigator.credentials && window.PublicKeyCredential)
}

/**
 * パスキーを登録する
 * @param {string} userName - 表示用ユーザー名
 * @returns {Promise<{ credentialId: string, publicKey: string }>}
 */
export async function registerPasskey(userName = 'AirPubre User') {
  if (!isPasskeySupported()) throw new Error('この環境ではパスキーを利用できません')

  const challenge = crypto.getRandomValues(new Uint8Array(32))

  // RP ID はホスト名（ポート番号なし）
  const rpId = location.hostname

  const credential = await navigator.credentials.create({
    publicKey: {
      rp: { id: rpId, name: RP_NAME },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: userName,
        displayName: userName,
      },
      challenge,
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' },  // RS256
      ],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      timeout: 120000,
    },
  })

  if (!credential) throw new Error('パスキーの登録がキャンセルされました')

  return {
    credentialId: bufToBase64(credential.rawId),
    publicKey: bufToBase64(credential.response.getPublicKey?.() ?? new ArrayBuffer(0)),
    transports: credential.response.getTransports?.() ?? [],
  }
}

/**
 * パスキーで認証する
 * @param {{ credentialId: string, transports?: string[] }[]} credentials - 登録済みクレデンシャル
 * @returns {Promise<{ credentialId: string, success: boolean }>}
 */
export async function authenticatePasskey(credentials) {
  if (!isPasskeySupported()) throw new Error('この環境ではパスキーを利用できません')
  if (!credentials?.length) throw new Error('登録済みのパスキーがありません')

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const rpId = location.hostname

  const allowCredentials = credentials.map(c => ({
    id: base64ToBuf(c.credentialId),
    type: 'public-key',
    transports: c.transports || [],
  }))

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 120000,
    },
  })

  if (!assertion) throw new Error('パスキー認証がキャンセルされました')

  return {
    credentialId: bufToBase64(assertion.rawId),
    success: true,
  }
}

// ── helpers ──

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function base64ToBuf(b64) {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}
