/**
 * ZIPダウンロード デプロイアダプター
 * ビルド済みファイルをZIPにしてブラウザからダウンロードさせる
 */

import { filesToZipBlob } from '../builder.js'

/**
 * ファイル群をZIPにしてダウンロードする
 * @param {Map<string, string>} files
 * @param {string} filename
 */
export async function downloadAsZip(files, filename = 'airpubre-site.zip') {
  const blob = await filesToZipBlob(files)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
