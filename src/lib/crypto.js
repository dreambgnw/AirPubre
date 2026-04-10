/**
 * AirPubre 暗号・認証ライブラリ
 *
 * マスターキー（ひらがな12単語）
 *   → サブキー（128文字ランダム）
 *   → PBKDF2（Web Crypto API）でハッシュ化して保存・検証
 *   ※ argon2-browser を使わないので WASM 不要・Vite 互換
 */

import { generateMasterKeyWords, wordsToKeyString } from '../words/hiragana.js'

const enc = new TextEncoder()

// ============================================================
// マスターキー
// ============================================================

/**
 * 新しいマスターキーを生成する
 * @returns {{ words: string[], keyString: string }}
 */
export function generateMasterKey() {
  const words = generateMasterKeyWords(12)
  return {
    words,
    keyString: wordsToKeyString(words),
  }
}

// ============================================================
// サブキー
// ============================================================

/**
 * 暗号強度のあるサブキーを生成する（128文字）
 * @returns {string}
 */
export function generateSubKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const array = new Uint8Array(128)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => chars[b % chars.length]).join('')
}

// ============================================================
// ハッシュ（PBKDF2 / Web Crypto API）
// WASM不要・外部ライブラリ不要・ブラウザネイティブ
// ============================================================

/**
 * キー文字列をPBKDF2でハッシュ化する
 * @param {string} keyString
 * @returns {Promise<string>} "salt:hash" のBase64文字列
 */
export async function hashKey(keyString) {
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(keyString), 'PBKDF2', false, ['deriveBits']
  )
  const hashBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: 200000 },
    keyMaterial,
    256
  )
  const hashArr = new Uint8Array(hashBits)

  // salt(16byte) + hash(32byte) を結合してBase64化
  const combined = new Uint8Array(salt.length + hashArr.length)
  combined.set(salt)
  combined.set(hashArr, salt.length)
  return btoa(String.fromCharCode(...combined))
}

/**
 * 入力キーとハッシュを検証する
 * @param {string} keyString
 * @param {string} storedHash - hashKey() が返したBase64文字列
 * @returns {Promise<boolean>}
 */
export async function verifyKey(keyString, storedHash) {
  const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0))
  const salt = combined.slice(0, 16)
  const expectedHash = combined.slice(16)

  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(keyString), 'PBKDF2', false, ['deriveBits']
  )
  const hashBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, hash: 'SHA-256', iterations: 200000 },
    keyMaterial,
    256
  )
  const hashArr = new Uint8Array(hashBits)

  // 定数時間比較（タイミング攻撃対策）
  if (hashArr.length !== expectedHash.length) return false
  let diff = 0
  for (let i = 0; i < hashArr.length; i++) {
    diff |= hashArr[i] ^ expectedHash[i]
  }
  return diff === 0
}

// ============================================================
// AES-GCM 暗号化 / 復号（サブキーベースのクロスデバイス同期用）
// ============================================================

/**
 * サブキー文字列から AES-GCM 用の CryptoKey を派生する
 */
async function deriveAesKey(subKeyString) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(subKeyString), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('airpubre-sync-v1'), hash: 'SHA-256', iterations: 100000 },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * オブジェクトをサブキーで AES-GCM 暗号化し、Base64 文字列として返す
 * @param {Object} data
 * @param {string} subKeyString
 * @returns {Promise<string>}
 */
export async function encryptSyncConfig(data, subKeyString) {
  const aesKey = await deriveAesKey(subKeyString)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = enc.encode(JSON.stringify(data))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext)
  // iv(12) + ciphertext を結合して Base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

/**
 * Base64 暗号文をサブキーで復号してオブジェクトを返す
 * @param {string} encrypted - Base64 文字列
 * @param {string} subKeyString
 * @returns {Promise<Object>}
 */
export async function decryptSyncConfig(encrypted, subKeyString) {
  const aesKey = await deriveAesKey(subKeyString)
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext))
}

// ============================================================
// マスターキー → サブキー の派生
// ============================================================

/**
 * マスターキーからサブキーを派生させる（HKDF）
 * @param {string} masterKeyString
 * @param {string} info - 用途ラベル（例: 'subkey-v1'）
 * @returns {Promise<string>} 派生キー（Hex文字列）
 */
export async function deriveSubKeyFromMaster(masterKeyString, info = 'airpubre-subkey-v1') {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(masterKeyString),
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('airpubre-salt'),
      info: enc.encode(info),
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    true,
    ['sign']
  )
  const raw = await crypto.subtle.exportKey('raw', derivedKey)
  return Array.from(new Uint8Array(raw)).map(b => b.toString(16).padStart(2, '0')).join('')
}
