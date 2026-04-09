/**
 * Vercel デプロイアダプター
 * Vercel Deploy APIを使ってブラウザから直接デプロイする
 */

/**
 * ファイル群をVercelにデプロイする
 * @param {Map<string, string>} files
 * @param {Object} config
 * @param {string} config.token - Vercel Access Token
 * @param {string} config.projectName - プロジェクト名
 */
export async function deployToVercel(files, config) {
  const { token, projectName } = config
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  // ファイルをVercel形式に変換
  const vercelFiles = Array.from(files.entries()).map(([path, content]) => ({
    file: path,
    data: content,
    encoding: 'utf-8',
  }))

  const res = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectName,
      files: vercelFiles,
      projectSettings: {
        framework: null,
        buildCommand: null,
        outputDirectory: null,
      },
      target: 'production',
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message ?? 'Vercelデプロイに失敗しました')
  }

  const data = await res.json()
  return {
    deploymentId: data.id,
    url: `https://${data.url}`,
  }
}
