/**
 * GitHub リポジトリ内の任意の単一ファイルを取得・更新する。
 *
 * 用途：now.json, 各種設定 JSON, .airpubre/ 配下のメタデータなど、
 *       ブログ記事ではないが頻繁に書き換えたいファイルを AirPubre から直接編集する。
 */

import { deployToGitHub } from './deploy/github.js'

const RAW_BASE = 'https://raw.githubusercontent.com'

/**
 * リポジトリ内の 1 ファイルをテキストで取得
 * @returns {Promise<string|null>} ファイルが無ければ null
 */
export async function fetchRepoFile({ owner, repo, branch = 'main', path, token }) {
  const url = `${RAW_BASE}/${owner}/${repo}/${branch}/${path}`
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`fetchRepoFile: ${res.status} ${res.statusText}`)
  return res.text()
}

/**
 * リポジトリ内の 1 ファイルを更新（または新規作成）して push
 * fast-forward + リトライで競合安全。
 */
export async function pushRepoFile({ owner, repo, branch = 'main', path, content, token, message }) {
  if (!owner || !repo) throw new Error('owner / repo を指定してください')
  if (!token) throw new Error('GitHub Token が必要です')
  if (!path) throw new Error('path を指定してください')

  const files = new Map([[path, content]])
  return deployToGitHub(files, {
    token,
    owner,
    repo,
    branch,
    message: message || `update: ${path} via AirPubre`,
    safePush: true,
  })
}
