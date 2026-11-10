// Generator PDF laporan uji OPM per FAT — format sama seperti rekap manual
// lama (header info proyek + grid 8 kartu port per FAT, foto + nilai dBm).
// Dipakai dari DUA tempat: server (API route generate laporan, Node — lihat
// src/app/api/laporan/generate/route.ts) dan browser (portal klien publik,
// hidePhotos:true, tidak pernah memuat foto). Karena itu loadImageAsJpegDataUrl
// di bawah mendukung kedua lingkungan.
import jsPDF from "jspdf";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

/** Bangun URL file lewat instance PocketBase yang dipakai fetch data —
 *  supaya base URL-nya cocok (internal docker utk server, publik utk browser). */
function urlFor(client: ReturnType<typeof pb>, record: RecordModel, filename?: string | null, thumb?: string) {
  if (!filename) return "";
  return client.files.getURL(record, filename, thumb ? { thumb } : undefined);
}

export type OpmReportProject = {
  cluster_name: string;
  cluster_id: string;
  region: string;
  olt: string;
  fdt_input_dbm?: number;
};

export type OpmReportPort = {
  port: number;
  dbm: number | null;
  photoUrl?: string | null;
};

export type OpmReportFat = {
  code: string; // kode tampil, mis. "B01" atau "TMU123.035.B01"
  line: string;
  ports: number;
  tests: OpmReportPort[]; // hanya port yang sudah ada hasilnya
};

async function loadImageAsJpegDataUrl(url: string, authToken?: string): Promise<string | null> {
  if (typeof window === "undefined") {
    // Jalan di server (Node) — tidak ada Canvas/Image. Foto yang diminta di
    // sini sudah thumbnail kecil dari PocketBase, jadi tinggal fetch & ubah
    // ke base64, tidak perlu di-encode ulang. Butuh token karena viewRule
    // foto mensyaratkan login (office/anggota proyek).
    try {
      const res = await fetch(url, authToken ? { headers: { Authorization: authToken } } : undefined);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:image/jpeg;base64,${buf.toString("base64")}`;
    } catch {
      return null;
    }
  }
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("gagal muat " + url));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 400;
    canvas.height = img.naturalHeight || 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

const W = 612;
const H = 792;
const M = 36;

function drawHeader(
  doc: jsPDF,
  title: string,
  info: { region: string; olt: string; cluster_name: string; cluster_id: string },
  clientLogo: string | null
) {
  const top = 40;
  const h = 58;
  const x0 = M;
  const x1 = M + 190;
  const x2 = M + 300;
  const x3 = M + 410;

  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1);
  doc.rect(M, top, W - 2 * M, h);
  doc.line(x1, top, x1, top + h);
  doc.line(x2, top, x2, top + h);
  doc.line(x3, top, x3, top + h);

  if (clientLogo) doc.addImage(clientLogo, "JPEG", M + 14, top + 16, 90, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("EMR FTTH PROJECT", (x0 + x1) / 2, top + 50, { align: "center" });

  doc.setFontSize(11);
  doc.text(title, (x1 + x2) / 2, top + h / 2 + 4, { align: "center" });

  const rows: [string, string][] = [
    ["Region", info.region || "-"],
    ["OLT Name", info.olt || "-"],
    ["Cluster Name", info.cluster_name || "-"],
    ["Cluster ID", info.cluster_id || "-"],
  ];
  const rh = h / 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  for (let i = 0; i < 4; i++) {
    const rowBottom = top + (i + 1) * rh;
    if (i < 3) doc.line(x2, rowBottom, W - M, rowBottom);
    doc.text(rows[i][0], x2 + 3, rowBottom - rh / 2 + 3);
    doc.text(": " + rows[i][1], x3 + 3, rowBottom - rh / 2 + 3);
  }
  return top + h;
}

function drawPortCard(
  doc: jsPDF,
  x: number,
  yTop: number,
  cardw: number,
  h: number,
  port: number,
  dbmText: string,
  fatNo: string,
  fdtId: string,
  line: string,
  clusterName: string,
  dateLabel: string,
  inputFdt: string,
  clientLogo: string | null
) {
  doc.setFillColor(255, 255, 255);
  doc.rect(x, yTop, cardw, h, "F");
  if (clientLogo) doc.addImage(clientLogo, "JPEG", x + 4, yTop + 1.5, 46, 11);

  const boxTop = yTop + 16;
  const boxH = h - 19;
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.4);
  doc.rect(x + 3, boxTop, cardw - 6, boxH);
  const lw = 50;
  doc.line(x + 3 + lw, boxTop, x + 3 + lw, boxTop + boxH);

  const fields: [string, string, boolean][] = [
    ["CLUSTER NAME", clusterName, false],
    ["DATE", dateLabel, false],
    ["INPUT FDT", inputFdt, false],
    ["OPM TEST", dbmText, true],
    ["LINE", "Line " + line, false],
    ["FAT NO", fatNo, true],
    ["PORT FAT", String(port), true],
    ["FDT ID", fdtId, false],
  ];
  const rh = boxH / fields.length;
  for (let i = 0; i < fields.length; i++) {
    const [label, value, bold] = fields[i];
    const rowTop = boxTop + i * rh;
    if (i > 0) doc.line(x + 3, rowTop, x + cardw - 3, rowTop);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.4);
    doc.setTextColor(60, 60, 60);
    doc.text(label, x + 5, rowTop + rh / 2 + 1.5);

    const isOpm = label === "OPM TEST";
    doc.setFont("helvetica", bold ? "bold" : "normal");
    let fs = bold ? 8 : 7.2;
    doc.setFontSize(fs);
    if (isOpm) doc.setTextColor(190, 0, 0);
    else doc.setTextColor(0, 0, 0);
    const maxW = cardw - lw - 12;
    while (doc.getTextWidth(value) > maxW && fs > 4) {
      fs -= 0.2;
      doc.setFontSize(fs);
    }
    doc.text(value, x + 6 + lw, rowTop + rh / 2 + 1.8);
    doc.setTextColor(0, 0, 0);
  }
}

/** Satu halaman per FAT — grid 2x4 kartu port. */
async function drawFatPage(
  doc: jsPDF,
  fat: OpmReportFat,
  project: OpmReportProject,
  dateLabel: string,
  clientLogo: string | null,
  hidePhotos: boolean,
  authToken?: string
) {
  drawHeader(
    doc,
    "FAT " + fat.code,
    { region: project.region, olt: project.olt, cluster_name: project.cluster_name, cluster_id: project.cluster_id },
    clientLogo
  );

  const gridTop = 110;
  const cols = 2;
  const rowsN = 4;
  const gx = 36;
  const gy = 10;
  const cw = (W - 2 * M - gx) / cols;
  const ch = (H - gridTop - M - gy * (rowsN - 1)) / rowsN;
  const pw = hidePhotos ? 0 : ch * 0.75;
  const cardw = cw - pw;
  const total = fat.ports || 8;
  const byPort = new Map(fat.tests.map((t) => [t.port, t]));

  for (let i = 0; i < Math.min(total, 8); i++) {
    const port = i + 1;
    const r = Math.floor(i / cols);
    const k = i % cols;
    const x = M + k * (cw + gx);
    const yTop = gridTop + r * (ch + gy);
    const t = byPort.get(port);

    if (!hidePhotos) {
      if (t?.photoUrl) {
        const img = await loadImageAsJpegDataUrl(t.photoUrl, authToken);
        if (img) doc.addImage(img, "JPEG", x + cardw, yTop, pw, ch);
        else {
          doc.setFillColor(235, 235, 235);
          doc.rect(x + cardw, yTop, pw, ch, "F");
        }
      } else {
        doc.setFillColor(235, 235, 235);
        doc.rect(x + cardw, yTop, pw, ch, "F");
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text("BELUM ADA", x + cardw + pw / 2, yTop + ch / 2 - 3, { align: "center" });
        doc.text("HASIL UJI", x + cardw + pw / 2, yTop + ch / 2 + 9, { align: "center" });
        doc.setTextColor(0, 0, 0);
      }
    }

    drawPortCard(
      doc,
      x,
      yTop,
      cardw,
      ch,
      port,
      t ? `${t.dbm?.toFixed(2)} dBm` : "-",
      fat.code,
      project.cluster_id,
      fat.line,
      project.cluster_name,
      dateLabel,
      project.fdt_input_dbm != null ? String(project.fdt_input_dbm) : "-",
      clientLogo
    );
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(1.1);
    doc.rect(x, yTop, cw, ch);
  }
}

export class ReportCancelled extends Error {
  constructor() {
    super("Dibatalkan");
    this.name = "ReportCancelled";
  }
}

export async function buildOpmReportPdf(opts: {
  project: OpmReportProject;
  fats: OpmReportFat[];
  clientLogoUrl?: string | null;
  dateLabel?: string;
  /** Sembunyikan panel foto (dipakai portal klien publik — file foto tidak bisa diakses tanpa login). */
  hidePhotos?: boolean;
  /** Dicek di antara tiap halaman FAT — kalau true, generate dihentikan (lempar ReportCancelled). */
  isCancelled?: () => boolean;
  /** Token auth (dari Authorization header PocketBase) — perlu untuk fetch foto di server. */
  authToken?: string;
}): Promise<jsPDF> {
  const clientLogo = opts.clientLogoUrl ? await loadImageAsJpegDataUrl(opts.clientLogoUrl, opts.authToken) : null;
  const dateLabel =
    opts.dateLabel ||
    new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let first = true;
  for (const fat of opts.fats) {
    if (opts.isCancelled?.()) throw new ReportCancelled();
    if (!first) doc.addPage();
    first = false;
    await drawFatPage(doc, fat, opts.project, dateLabel, clientLogo, !!opts.hidePhotos, opts.authToken);
  }
  return doc;
}

type ProjectRec = RecordModel & {
  cluster_name: string;
  cluster_id: string;
  region: string;
  olt: string;
  fdt_input_dbm?: number;
  expand?: { client?: RecordModel & { name: string; logo?: string } };
};
type AssetRec = RecordModel & { kind: string; code: string; line: string; ports?: number };
type OpmTestRec = RecordModel & {
  fat: string;
  port_fat: number;
  opm_dbm: number;
  status: string;
  expand?: { photo?: RecordModel & { file: string } };
};

/** Ambil semua data laporan OPM (proyek + FAT + hasil uji disetujui) siap dipakai buildOpmReportPdf.
 *  `pbInstance` opsional: pakai instance PocketBase lain (mis. tanpa auth, untuk portal publik). */
export async function fetchOpmReportData(projectId: string, pbInstance?: ReturnType<typeof pb>) {
  const client = pbInstance || pb();
  const project = await client.collection("projects").getOne<ProjectRec>(projectId, { expand: "client" });
  const assets = await client
    .collection("assets")
    .getFullList<AssetRec>({ filter: `project = "${projectId}" && kind = "fat"`, sort: "line,code" });
  const tests = await client
    .collection("opm_tests")
    .getFullList<OpmTestRec>({
      filter: `project = "${projectId}" && status = "approved"`,
      expand: "photo",
      sort: "port_fat",
    });

  const testsByFat = new Map<string, OpmReportPort[]>();
  for (const t of tests) {
    if (!testsByFat.has(t.fat)) testsByFat.set(t.fat, []);
    // Pakai thumbnail (bukan foto resolusi asli) — 192 foto resolusi penuh
    // bikin PDF jadi puluhan-ratusan MB dan ditolak server (body terlalu
    // besar), padahal kartu di laporan cuma seukuran thumbnail.
    const photoUrl = t.expand?.photo ? urlFor(client, t.expand.photo, t.expand.photo.file, "400x0") : null;
    testsByFat.get(t.fat)!.push({ port: t.port_fat, dbm: t.opm_dbm, photoUrl });
  }

  const fats: OpmReportFat[] = assets
    .filter((a) => testsByFat.has(a.id))
    .map((a) => ({
      code: a.code.split(".").pop() || a.code,
      line: a.line,
      ports: a.ports || 8,
      tests: (testsByFat.get(a.id) || []).sort((x, y) => x.port - y.port),
    }));

  return {
    project: {
      cluster_name: project.cluster_name,
      cluster_id: project.cluster_id,
      region: project.region,
      olt: project.olt,
      fdt_input_dbm: project.fdt_input_dbm,
    } as OpmReportProject,
    fats,
    clientLogoUrl:
      project.expand?.client?.logo ? urlFor(client, project.expand.client, project.expand.client.logo) : null,
    clusterName: project.cluster_name,
  };
}

// ============================================================
// Rekap foto Finish FAT — satu kartu per FAT, berisi kode + foto-foto
// finish-nya. Beda dari laporan OPM (per port); ini rekap dokumentasi.
// ============================================================

export type FatFinishEntry = {
  code: string;
  line: string;
  photoUrls: string[];
};

function drawFatFinishHeader(doc: jsPDF, project: OpmReportProject, clientLogo: string | null) {
  drawHeader(
    doc,
    "Rekap Foto Finish FAT",
    { region: project.region, olt: project.olt, cluster_name: project.cluster_name, cluster_id: project.cluster_id },
    clientLogo
  );
}

/** Ukuran (px) sebuah JPEG dari data URL base64, dibaca dari marker SOF —
 *  supaya foto bisa dipasang mengikuti rasio aslinya (tidak digepengkan).
 *  Tanpa Canvas, jadi jalan di Node maupun browser. */
function jpegSize(dataUrl: string): { w: number; h: number } | null {
  try {
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const bin = atob(b64);
    const n = bin.length;
    let i = 2;
    while (i < n) {
      if (bin.charCodeAt(i) !== 0xff) {
        i++;
        continue;
      }
      const marker = bin.charCodeAt(i + 1);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6);
        const w = (bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8);
        return w > 0 && h > 0 ? { w, h } : null;
      }
      const segLen = (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
      i += 2 + segLen;
    }
  } catch {
    /* abaikan */
  }
  return null;
}

/** Gambar foto di dalam kotak (cx,cy,cw,ch) dengan rasio asli, di tengah,
 *  latar abu muda. Kalau gagal dimuat, kotak abu saja. */
function drawPhotoFit(doc: jsPDF, img: string | null, cx: number, cy: number, cw: number, ch: number) {
  doc.setFillColor(240, 240, 240);
  doc.rect(cx, cy, cw, ch, "F");
  if (!img) return;
  const size = jpegSize(img);
  let dw = cw;
  let dh = ch;
  if (size) {
    const scale = Math.min(cw / size.w, ch / size.h);
    dw = size.w * scale;
    dh = size.h * scale;
  }
  doc.addImage(img, "JPEG", cx + (cw - dw) / 2, cy + (ch - dh) / 2, dw, dh);
}

/** Satu kotak FAT di grid 2x2: strip judul (kode, line, jumlah foto) di
 *  atas, lalu foto-foto finish mengisi sisa kotak (1 foto penuh, 2 foto
 *  berdampingan, 3-4 foto grid 2x2). */
async function drawFatFinishCard(
  doc: jsPDF,
  entry: FatFinishEntry,
  x: number,
  y: number,
  w: number,
  h: number,
  authToken?: string
) {
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1);
  doc.rect(x, y, w, h);

  const headH = 30;
  doc.setFillColor(245, 245, 245);
  doc.rect(x, y, w, headH, "F");
  doc.setDrawColor(20, 20, 20);
  doc.line(x, y + headH, x + w, y + headH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("FAT " + entry.code, x + 8, y + 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`Line ${entry.line || "-"}  ·  ${entry.photoUrls.length} foto`, x + w - 8, y + 19, { align: "right" });
  doc.setTextColor(0, 0, 0);

  const maxThumbs = 4;
  const shown = entry.photoUrls.slice(0, maxThumbs);
  const pad = 6;
  const gap = 5;
  const ax = x + pad;
  const ay = y + headH + pad;
  const aw = w - pad * 2;
  const ah = h - headH - pad * 2;

  if (shown.length === 0) {
    doc.setFillColor(240, 240, 240);
    doc.rect(ax, ay, aw, ah, "F");
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Belum ada foto", ax + aw / 2, ay + ah / 2 + 3, { align: "center" });
    doc.setTextColor(0, 0, 0);
    return;
  }

  // Sel foto: 1 → penuh; 2 → dua kolom; 3-4 → grid 2x2.
  const cols = shown.length === 1 ? 1 : 2;
  const rows = shown.length <= 2 ? 1 : 2;
  const cw = (aw - gap * (cols - 1)) / cols;
  const ch = (ah - gap * (rows - 1)) / rows;

  for (let i = 0; i < shown.length; i++) {
    const cx = ax + (i % cols) * (cw + gap);
    const cy = ay + Math.floor(i / cols) * (ch + gap);
    const img = await loadImageAsJpegDataUrl(shown[i], authToken);
    drawPhotoFit(doc, img, cx, cy, cw, ch);
    if (i === maxThumbs - 1 && entry.photoUrls.length > maxThumbs) {
      doc.setFillColor(20, 20, 20);
      doc.rect(cx, cy, cw, ch, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`+${entry.photoUrls.length - maxThumbs + 1}`, cx + cw / 2, cy + ch / 2 + 5, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
  }
}

export async function buildFatFinishReportPdf(opts: {
  project: OpmReportProject;
  entries: FatFinishEntry[];
  clientLogoUrl?: string | null;
  /** Dicek di antara tiap kartu FAT — kalau true, generate dihentikan (lempar ReportCancelled). */
  isCancelled?: () => boolean;
  /** Token auth (dari Authorization header PocketBase) — perlu untuk fetch foto di server. */
  authToken?: string;
}): Promise<jsPDF> {
  const clientLogo = opts.clientLogoUrl ? await loadImageAsJpegDataUrl(opts.clientLogoUrl, opts.authToken) : null;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  // Grid 2 kolom x 2 baris = 4 kotak per halaman (folio dibagi empat).
  const top = 110;
  const cols = 2;
  const rows = 2;
  const gap = 12;
  const cardW = (W - 2 * M - gap * (cols - 1)) / cols;
  const cardH = (H - top - M - gap * (rows - 1)) / rows;
  const perPage = cols * rows;

  let first = true;
  for (let i = 0; i < opts.entries.length; i += perPage) {
    if (opts.isCancelled?.()) throw new ReportCancelled();
    if (!first) doc.addPage();
    first = false;
    drawFatFinishHeader(doc, opts.project, clientLogo);
    const slice = opts.entries.slice(i, i + perPage);
    for (let j = 0; j < slice.length; j++) {
      if (opts.isCancelled?.()) throw new ReportCancelled();
      const x = M + (j % cols) * (cardW + gap);
      const y = top + Math.floor(j / cols) * (cardH + gap);
      await drawFatFinishCard(doc, slice[j], x, y, cardW, cardH, opts.authToken);
    }
  }
  if (opts.entries.length === 0) {
    drawFatFinishHeader(doc, opts.project, clientLogo);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    doc.text("Belum ada foto Finish FAT yang diunggah.", W / 2, top + 40, { align: "center" });
  }
  return doc;
}

/** Ambil data rekap Finish FAT (proyek + daftar FAT yang punya foto finish). */
export async function fetchFatFinishReportData(projectId: string, pbInstance?: ReturnType<typeof pb>) {
  const client = pbInstance || pb();
  const project = await client.collection("projects").getOne<ProjectRec>(projectId, { expand: "client" });
  const assets = await client
    .collection("assets")
    .getFullList<AssetRec>({ filter: `project = "${projectId}" && kind = "fat"`, sort: "line,code" });
  const photos = await client
    .collection("photos")
    .getFullList<RecordModel & { asset: string; file: string }>({
      filter: `project = "${projectId}" && purpose = "fat_finish"`,
      sort: "-created",
    });

  const byFat = new Map<string, string[]>();
  for (const p of photos) {
    if (!p.asset) continue;
    if (!byFat.has(p.asset)) byFat.set(p.asset, []);
    // Thumbnail 1200px (bukan 400px seperti OPM): kotak Finish FAT seperempat
    // halaman, tulisan/label di FAT harus terbaca. Jumlah fotonya sedikit
    // (umumnya 1 per FAT), jadi PDF-nya tetap wajar.
    byFat.get(p.asset)!.push(urlFor(client, p, p.file, "1200x0"));
  }

  const entries: FatFinishEntry[] = assets
    .filter((a) => byFat.has(a.id))
    .map((a) => ({
      code: a.code.split(".").pop() || a.code,
      line: a.line,
      photoUrls: byFat.get(a.id) || [],
    }));

  return {
    project: {
      cluster_name: project.cluster_name,
      cluster_id: project.cluster_id,
      region: project.region,
      olt: project.olt,
      fdt_input_dbm: project.fdt_input_dbm,
    } as OpmReportProject,
    entries,
    clientLogoUrl:
      project.expand?.client?.logo ? urlFor(client, project.expand.client, project.expand.client.logo) : null,
    clusterName: project.cluster_name,
  };
}

// ============================================================
// Rekap foto Finish FDT: core feeder masuk FDT (N foto), foto akhir FDT
// luar + layar OPM 1 port (nilai dBm). Satu/dua halaman.
// ============================================================
export type FdtFinishData = {
  project: OpmReportProject;
  fdtCode: string;
  feederCores: number;
  feeder: { seq: number; url: string; place?: string; takenAt?: string }[];
  finish: { url: string; dbm?: number; place?: string; takenAt?: string } | null;
  inputDbm?: number;
  clientLogoUrl: string | null;
  clusterName: string;
};

export async function fetchFdtFinishReportData(projectId: string, pbInstance?: ReturnType<typeof pb>): Promise<FdtFinishData> {
  const client = pbInstance || pb();
  const project = await client.collection("projects").getOne<
    RecordModel & {
      cluster_name: string; cluster_id: string; region: string; olt: string; fdt_input_dbm?: number; feeder_cores?: number;
      expand?: { client?: RecordModel & { logo?: string } };
    }
  >(projectId, { expand: "client" });
  let fdtCode = "";
  try {
    const fdt = await client.collection("assets").getFirstListItem<RecordModel & { code: string }>(`project = "${projectId}" && (kind = "fdt" || kind = "odc")`);
    fdtCode = fdt.code;
  } catch { /* tidak ada */ }
  const photos = await client.collection("photos").getFullList<
    RecordModel & { file: string; purpose: string; seq?: number; value_dbm?: number; place?: string; taken_at?: string; far?: boolean; source?: string }
  >({ filter: `project = "${projectId}" && (purpose = "fdt_feeder" || purpose = "fdt_finish")`, sort: "seq,-created" });
  const ok = (p: (typeof photos)[number]) => p.source === "gallery" || !p.far;
  const feederMap = new Map<number, (typeof photos)[number]>();
  for (const p of photos) if (p.purpose === "fdt_feeder" && ok(p) && p.seq != null && !feederMap.has(p.seq)) feederMap.set(p.seq, p);
  const finishPhoto = photos.find((p) => p.purpose === "fdt_finish" && ok(p)) || photos.find((p) => p.purpose === "fdt_finish") || null;
  return {
    project: { cluster_name: project.cluster_name, cluster_id: project.cluster_id, region: project.region, olt: project.olt, fdt_input_dbm: project.fdt_input_dbm },
    fdtCode,
    feederCores: project.feeder_cores || feederMap.size,
    feeder: Array.from(feederMap.values()).sort((a, b) => (a.seq || 0) - (b.seq || 0)).map((p) => ({ seq: p.seq || 0, url: urlFor(client, p, p.file, "1200x0"), place: p.place, takenAt: p.taken_at })),
    finish: finishPhoto ? { url: urlFor(client, finishPhoto, finishPhoto.file, "1200x0"), dbm: finishPhoto.value_dbm, place: finishPhoto.place, takenAt: finishPhoto.taken_at } : null,
    inputDbm: project.fdt_input_dbm,
    clientLogoUrl: project.expand?.client?.logo ? urlFor(client, project.expand.client, project.expand.client.logo) : null,
    clusterName: project.cluster_name,
  };
}

export async function buildFdtFinishReportPdf(opts: { data: FdtFinishData; authToken?: string; isCancelled?: () => boolean }): Promise<jsPDF> {
  const d = opts.data;
  const clientLogo = d.clientLogoUrl ? await loadImageAsJpegDataUrl(d.clientLogoUrl, opts.authToken) : null;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const header = () =>
    drawHeader(doc, "Rekap Foto Finish FDT", { region: d.project.region, olt: d.project.olt, cluster_name: d.project.cluster_name, cluster_id: d.project.cluster_id }, clientLogo);
  header();
  const top = 110;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`FDT ${d.fdtCode || "-"}`, M, top);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  const info = [
    `Core feeder masuk FDT: ${d.feeder.length}/${d.feederCores || "-"}`,
    d.inputDbm != null ? `Input FDT terukur: ${d.inputDbm} dBm` : "",
    d.finish?.dbm != null ? `Cek redaman 1 port FDT: ${d.finish.dbm} dBm` : "Cek redaman 1 port FDT: -",
  ].filter(Boolean);
  doc.text(info.join("   ·   "), M, top + 14);
  doc.setTextColor(0, 0, 0);

  // Foto akhir FDT luar (besar) di kiri, keterangan di kanan
  let y = top + 28;
  const bigW = (W - 2 * M) * 0.6;
  const bigH = 250;
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1);
  doc.rect(M, y, W - 2 * M, bigH + 28);
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 22, "F");
  doc.line(M, y + 22, W - M, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Foto akhir FDT (luar) + layar OPM 1 port", M + 8, y + 15);
  const img = d.finish ? await loadImageAsJpegDataUrl(d.finish.url, opts.authToken) : null;
  drawPhotoFit(doc, img, M + 6, y + 28, bigW - 12, bigH - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const kx = M + bigW + 6;
  let ky = y + 44;
  const line = (t: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const ls = doc.splitTextToSize(t, W - M - kx - 6) as string[];
    doc.text(ls, kx, ky);
    ky += ls.length * 11 + 4;
  };
  if (d.finish) {
    line(`Redaman: ${d.finish.dbm != null ? d.finish.dbm + " dBm" : "-"}`, true);
    if (d.finish.takenAt) line(`Waktu: ${new Date(d.finish.takenAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}`);
    if (d.finish.place) line(`Lokasi: ${d.finish.place}`);
  } else line("Belum ada foto akhir FDT.");
  y += bigH + 28 + 14;

  // Grid foto core feeder: 3 kolom
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(`Core feeder masuk FDT (${d.feeder.length})`, M, y + 10);
  y += 18;
  const cols = 3;
  const gap = 10;
  const cw = (W - 2 * M - gap * (cols - 1)) / cols;
  const ch = 150;
  for (let i = 0; i < d.feeder.length; i++) {
    if (opts.isCancelled?.()) throw new ReportCancelled();
    const col = i % cols;
    if (col === 0 && y + ch + 22 > H - M) {
      doc.addPage();
      header();
      y = top;
    }
    const x = M + col * (cw + gap);
    const f = d.feeder[i];
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(0.8);
    doc.rect(x, y, cw, ch + 22);
    doc.setFillColor(245, 245, 245);
    doc.rect(x, y, cw, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Core feeder #${f.seq}`, x + 6, y + 12.5);
    const im = await loadImageAsJpegDataUrl(f.url, opts.authToken);
    drawPhotoFit(doc, im, x + 4, y + 22, cw - 8, ch - 4);
    if (col === cols - 1 || i === d.feeder.length - 1) y += ch + 22 + gap;
  }
  if (d.feeder.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Belum ada foto core feeder.", M, y + 12);
    doc.setTextColor(0, 0, 0);
  }
  return doc;
}
