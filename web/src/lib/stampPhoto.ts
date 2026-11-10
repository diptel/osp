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

/**
 * Nama lokasi (desa, kecamatan, kabupaten, provinsi) dari koordinat —
 * Nominatim/OpenStreetMap, bahasa Indonesia. Gagal/offline → "" (foto
 * tetap bisa diunggah, stempel tanpa nama tempat).
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=16&accept-language=id`,
      { signal: ctrl.signal, headers: { Accept: "application/json" } }
    );
    clearTimeout(t);
    if (!res.ok) return "";
    const j = (await res.json()) as { address?: Record<string, string> };
    const a = j.address || {};
    const desa = a.village || a.hamlet || a.suburb || a.neighbourhood || a.quarter || "";
    const kec = a.city_district || a.municipality || a.town || a.district || "";
    const kab = a.county || a.regency || a.city || a.state_district || "";
    const prov = a.state || "";
    const parts = [desa, kec, kab, prov].filter((x, i, arr) => x && arr.indexOf(x) === i);
    return parts.join(", ");
  } catch {
    return "";
  }
}
