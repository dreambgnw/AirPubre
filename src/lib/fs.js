/**
 * AirPubre File System Access API ラッパー
 *
 * ユーザーが選択したフォルダ内の .airpubre/ サブフォルダにデータを保存する。
 * iCloud Drive / Dropbox / OneDrive などの同期フォルダを選べば
 * デバイス間で自動的に記事が同期される。
 *
 * ブラウザが File System Access API に非対応の場合は hasFSAccess() が false を返し、
 * storage.js は IndexedDB にフォールバックする。
 */

import { openDB } from 'idb'

const DB_NAME = 'airpubre'
const DB_VERSION = 3
const BASE_DIR = '.airpubre'

// 同じ DB インスタンスを使い回す（storage.js と共有）
async function getDB() {
  return openDB(DB_NAME, DB_VERSION)
}

// メモリキャッシュ（ページロード中は再取得しない）
let _handle = null

// ── ブラウザ対応チェック ───────────────────────────────────────────

export function isFSSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// ── ハンドル管理 ──────────────────────────────────────────────────

/**
 * 保存済みの FileSystemDirectoryHandle を取得する。
 * パーミッションが失効している場合は requestPermission を試み、
 * ユーザーの操作なしに復元できない場合は null を返す。
 */
export async function getDirHandle() {
  if (_handle) {
    try {
      const perm = await _handle.queryPermission({ mode: 'readwrite' })
      if (perm === 'granted') return _handle
    } catch {}
    _handle = null
  }

  try {
    const db = await getDB()
    const stored = await db.get('setup', 'dirHandle')
    if (!stored) return null

    // 既に granted なら即返す
    const perm = await stored.queryPermission({ mode: 'readwrite' })
    if (perm === 'granted') {
      _handle = stored
      return _handle
    }

    // prompt 状態 → ユーザー操作が必要（呼び出し元でハンドルする）
    const req = await stored.requestPermission({ mode: 'readwrite' })
    if (req === 'granted') {
      _handle = stored
      return _handle
    }
  } catch {}

  return null
}

/**
 * dirHandle を IndexedDB に保存してメモリキャッシュも更新する
 */
export async function setDirHandle(handle) {
  _handle = handle
  const db = await getDB()
  await db.put('setup', handle, 'dirHandle')
}

/**
 * フォルダ選択ダイアログを表示して保存する
 * @returns {FileSystemDirectoryHandle}
 */
export async function pickFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await setDirHandle(handle)
  return handle
}

/**
 * FS バックエンドが利用可能か（ブラウザ対応 + パーミッション取得済み）
 */
export async function hasFSAccess() {
  if (!isFSSupported()) return false
  return (await getDirHandle()) !== null
}

/**
 * 選択済みフォルダ名を返す（未選択なら null）
 */
export async function getFolderName() {
  try {
    const db = await getDB()
    const stored = await db.get('setup', 'dirHandle')
    return stored?.name ?? null
  } catch {
    return null
  }
}

/**
 * フォルダ選択を解除する
 */
export async function clearDirHandle() {
  _handle = null
  try {
    const db = await getDB()
    await db.delete('setup', 'dirHandle')
  } catch {}
}

// ── 内部ユーティリティ ────────────────────────────────────────────

/** .airpubre/ サブフォルダを取得（なければ作成） */
async function getBaseDir(handle) {
  return handle.getDirectoryHandle(BASE_DIR, { create: true })
}

// ── ファイル操作 ──────────────────────────────────────────────────

/**
 * .airpubre/{path} のテキストを読む
 * @param {string} path - 例: 'drafts/abc123.json'
 * @returns {Promise<string|null>} ファイルが無ければ null
 */
export async function readFile(path) {
  const handle = await getDirHandle()
  if (!handle) return null
  try {
    const base = await getBaseDir(handle)
    const parts = path.split('/')
    let dir = base
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i])
    }
    const fileHandle = await dir.getFileHandle(parts.at(-1))
    const file = await fileHandle.getFile()
    return file.text()
  } catch {
    return null
  }
}

/**
 * .airpubre/{path} にテキストを書く（なければ作成、あれば上書き）
 */
export async function writeFile(path, content) {
  const handle = await getDirHandle()
  if (!handle) throw new Error('フォルダが選択されていません')
  const base = await getBaseDir(handle)
  const parts = path.split('/')
  let dir = base
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create: true })
  }
  const fileHandle = await dir.getFileHandle(parts.at(-1), { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

/**
 * .airpubre/{path} を削除（存在しなければ何もしない）
 */
export async function deleteFile(path) {
  const handle = await getDirHandle()
  if (!handle) return
  try {
    const base = await getBaseDir(handle)
    const parts = path.split('/')
    let dir = base
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i])
    }
    await dir.removeEntry(parts.at(-1))
  } catch {}
}

/**
 * .airpubre/{dirPath}/ 内のファイル名一覧を返す
 * @param {string} dirPath - 例: 'drafts'
 * @returns {Promise<string[]>}
 */
export async function listFiles(dirPath) {
  const handle = await getDirHandle()
  if (!handle) return []
  try {
    const base = await getBaseDir(handle)
    const parts = dirPath.split('/').filter(Boolean)
    let dir = base
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part)
    }
    const names = []
    for await (const [name] of dir.entries()) {
      names.push(name)
    }
    return names
  } catch {
    return []
  }
}

/**
 * IndexedDB の drafts を FS に一括移行する（初回フォルダ選択時に使用）
 * @param {Array} drafts - IDB から取得した draft 配列
 */
export async function migrateDraftsToFS(drafts) {
  for (const draft of drafts) {
    await writeFile(`drafts/${draft.id}.json`, JSON.stringify(draft, null, 2))
  }
}
