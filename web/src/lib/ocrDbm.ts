"use client";

/**
 * Baca nilai redaman (dBm) dari foto layar OPM dengan OCR di browser
 * (tesseract.js, dimuat saat dibutuhkan). Mengembalikan angka seperti
 * -19.84, atau null kalau tidak terbaca. Hanya BANTUAN isi otomatis —
 * teknisi tetap wajib memastikan angkanya sama dengan layar alat.
 */
export async function ocrDbmFromPhoto(file: Blob): Promise<number | null> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_char_whitelist: "-0123456789.dBm ",
      preserve_interword_spaces: "1",
    });
    // perbesar kontras sederhana: gambar ke canvas grayscale
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g > 128 ? 255 : g < 70 ? 0 : g;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    const { data } = await worker.recognize(c);
    await worker.terminate();
    const text = (data.text || "").replace(/,/g, ".");
    // cari angka negatif dengan desimal, utamakan yang diikuti "dBm" / dalam rentang wajar
    const cands = Array.from(text.matchAll(/-\s?(\d{1,2})[.](\d{1,2})/g)).map((m) => -Number(`${m[1]}.${m[2]}`));
    const inRange = cands.filter((v) => v <= -3 && v >= -45);
    if (inRange.length) return inRange[0];
    return cands.length ? cands[0] : null;
  } catch {
    return null;
  }
}
