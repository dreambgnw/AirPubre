/**
 * AirPubre 画像ユーティリティ
 * Canvas API を使った WebP 変換・リサイズ（ブラウザ専用）
 */

// SVG（ベクター）と GIF（アニメーション）は変換しない
const SKIP_EXTS = new Set(['.svg', '.gif'])

/**
 * 画像 Blob を WebP（Base64 data URL）に変換する。
 * maxW / maxH を超える場合はアスペクト比を保ってリサイズする。
 *
 * @param {Blob} blob
 * @param {object} [opts]
 * @param {number} [opts.maxW=1200]
 * @param {number} [opts.maxH=900]
 * @param {number} [opts.quality=0.85]
 * @returns {Promise<string>} WebP の data URL
 */
export function imageToWebP(blob, { maxW = 1200, maxH = 900, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)

    img.onload = () => {
      let { width: w, height: h } = img
      const ratio = Math.min(maxW / w, maxH / h, 1)
      if (ratio < 1) {
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/webp', quality))
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('画像の読み込みに失敗しました'))
    }

    img.src = url
  })
}

/**
 * ファイル名から WebP 変換をすべきか判定する
 * @param {string} filename
 * @returns {boolean}
 */
export function shouldConvertToWebP(filename) {
  const e = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return !SKIP_EXTS.has(e)
}
