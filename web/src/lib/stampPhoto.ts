"use client";

/**
 * Bakar stempel (tanggal/jam, koordinat GPS, akurasi, label) ke dalam foto
 * — kotak gelap transparan di pojok kanan bawah, seperti aplikasi kamera
 * GPS. Hasil JPEG ≤ 1600px sisi terpanjang supaya ringan diunggah.
 */
export async function stampPhoto(file: Blob, lines: string[], maxSide = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, w, h);

  const fs = Math.max(14, Math.round(w / 42));
  const lh = Math.round(fs * 1.3);
  const pad = Math.round(fs * 0.7);
  ctx.font = `600 ${fs}px system-ui, -apple-system, Roboto, sans-serif`;
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = textW + pad * 2;
  const boxH = lines.length * lh + pad * 2 - (lh - fs);
  const x = w - boxW - pad;
  const y = h - boxH - pad;

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  const r = Math.round(fs * 0.5);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
  ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
  ctx.arcTo(x, y + boxH, x, y, r);
  ctx.arcTo(x, y, x + boxW, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + pad + i * lh));

  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b || file), "image/jpeg", 0.88));
}

export function fmtStampTime(d = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
