/**
 * GitHub Pages デプロイアダプター
 * GitHub APIを使ってリポジトリに直接コミットする
 */

/** Uint8Array → base64 文字列（btoa では大きい配列が壊れるので分割） */
function bytesToBase64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/**
 * ファイル群をGitHubリポジトリにコミット・プッシュする
 * @param {Map<string, string|Uint8Array>} files - パス → コンテンツ（テキスト or バイナリ）
 * @param {Object} config
 * @param {string} config.token - GitHub Personal Access Token
 * @param {string} config.owner - リポジトリオーナー
 * @param {string} config.repo  - リポジトリ名
 * @param {string} config.branch - ブランチ名（デフォルト: gh-pages）
 * @param {string} [config.message] - コミットメッセージ
 * @param {boolean} [config.safePush=false] - true: fast-forward 必須（外部 commit と競合検知＋リトライ）
 *                                            false: force push（gh-pages 全上書きデプロイ向け）
 * @param {string[]} [config.deletions] - 削除対象のパス一覧（tree から sha:null で外す）
 */
export async function deployToGitHub(files, config) {
  const { token, owner, repo, branch = 'gh-pages', message, safePush = false, deletions = [] } = config
  const api = `https://api.github.com/repos/${owner}/${repo}`
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json',
  }

  // ── ヘルパー: 現ブランチの HEAD SHA を取得 ─────────────────────
  async function getBaseSha() {
    const refRes = await fetch(`${api}/git/ref/heads/${branch}`, { headers })
    if (refRes.ok) {
      const ref = await refRes.json()
      return ref.object.sha
    }
    // ブランチが存在しない → デフォルトブランチから作成
    const mainRef = await fetch(`${api}/git/ref/heads/main`, { headers }).then(r => r.json())
    if (!mainRef.object) {
      throw new Error('リポジトリへのアクセスに失敗しました。Token・リポジトリ名を確認してください。')
    }
    return mainRef.object.sha
  }

  // 1. blob を全部一気に作成（base_tree に依存しないので 1 回でいい）
  const blobShas = await Promise.all(
    Array.from(files.entries()).map(async ([, content]) => {
      const base64 = content instanceof Uint8Array
        ? bytesToBase64(content)
        : btoa(unescape(encodeURIComponent(content)))
      const res = await fetch(`${api}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: base64, encoding: 'base64' }),
      })
      return (await res.json()).sha
    })
  )

  const treeEntries = Array.from(files.keys()).map((path, i) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha: blobShas[i],
  }))

  // 削除エントリ: sha: null を渡すと GitHub tree API はそのパスを外す（= 削除）
  for (const path of deletions) {
    treeEntries.push({
      path,
      mode: '100644',
      type: 'blob',
      sha: null,
    })
  }

  if (treeEntries.length === 0) {
    throw new Error('デプロイ対象のファイルも削除もありません')
  }

  // ── tree → commit → ref 更新 を 1 試行する内部関数 ─────────────
  async function attempt() {
    const baseSha = await getBaseSha()

    // 2. ツリーを作成（base_tree に追記）
    const treeRes = await fetch(`${api}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
    })
    const treeData = await treeRes.json()
    if (!treeData.sha) throw new Error(`tree 作成に失敗: ${JSON.stringify(treeData)}`)

    // 3. コミット作成
    const commitRes = await fetch(`${api}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: message || `deploy: ${new Date().toISOString()} via AirPubre`,
        tree: treeData.sha,
        parents: [baseSha],
      }),
    })
    const commitData = await commitRes.json()
    if (!commitData.sha) throw new Error(`commit 作成に失敗: ${JSON.stringify(commitData)}`)

    // 4. ブランチ ref 更新
    const refUpdateRes = await fetch(`${api}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commitData.sha, force: !safePush }),
    })

    if (!refUpdateRes.ok) {
      const err = await refUpdateRes.json().catch(() => ({}))
      // safePush=true で fast-forward じゃないとき：呼び出し側でリトライ
      if (refUpdateRes.status === 422) {
        const e = new Error('NOT_FAST_FORWARD')
        e.code = 'NOT_FAST_FORWARD'
        e.detail = err
        throw e
      }
      throw new Error(`ref 更新に失敗: ${refUpdateRes.status} ${JSON.stringify(err)}`)
    }

    return commitData.sha
  }

  // 5. リトライループ（safePush の場合のみ意味がある）
  let lastErr
  const maxAttempts = safePush ? 3 : 1
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const sha = await attempt()
      return {
        commitSha: sha,
        url: `https://${owner}.github.io/${repo}/`,
      }
    } catch (e) {
      lastErr = e
      if (e.code !== 'NOT_FAST_FORWARD') throw e
      // 競合：少し待ってから新しい HEAD で再試行
      // （deploy-server.sh の auto-commit と被ったケース）
      await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw new Error(
    `リモートが更新されたためデプロイを ${maxAttempts} 回リトライしましたが失敗しました。`
    + `しばらく待ってからもう一度お試しください。`
    + (lastErr?.message ? ` (${lastErr.message})` : '')
  )
}
