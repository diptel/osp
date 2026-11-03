// Sidik foto (dHash 64-bit) untuk PWA BRIIX OSP.
// Hasilnya 16 karakter hex, dikirim di field `phash` saat unggah foto.
// Server menolak foto yang beda <= 5 bit dari foto lain di proyek yang sama.
export async function dhash(fileOrBlob) {
  const bmp = await createImageBitmap(fileOrBlob)
  const c = new OffscreenCanvas(9, 8)
  const ctx = c.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0, 9, 8)
  const px = ctx.getImageData(0, 0, 9, 8).data
  const g = (x, y) => { const i = (y * 9 + x) * 4; return px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 }
  let hex = ""
  for (let y = 0; y < 8; y++) {
    let byte = 0
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (g(x, y) > g(x + 1, y) ? 1 : 0)
    hex += byte.toString(16).padStart(2, "0")
  }
  return hex
}
