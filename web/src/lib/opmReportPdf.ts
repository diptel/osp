"use client";
// Generator PDF laporan uji OPM per FAT — format sama seperti rekap manual
// lama (header info proyek + grid 8 kartu port per FAT, foto + nilai dBm).
import jsPDF from "jspdf";
import { pb, fileUrl } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

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

async function loadImageAsJpegDataUrl(url: string): Promise<string | null> {
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
  hidePhotos: boolean
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
        const img = await loadImageAsJpegDataUrl(t.photoUrl);
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

export async function buildOpmReportPdf(opts: {
  project: OpmReportProject;
  fats: OpmReportFat[];
  clientLogoUrl?: string | null;
  dateLabel?: string;
  /** Sembunyikan panel foto (dipakai portal klien publik — file foto tidak bisa diakses tanpa login). */
  hidePhotos?: boolean;
}): Promise<jsPDF> {
  const clientLogo = opts.clientLogoUrl ? await loadImageAsJpegDataUrl(opts.clientLogoUrl) : null;
  const dateLabel =
    opts.dateLabel ||
    new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let first = true;
  for (const fat of opts.fats) {
    if (!first) doc.addPage();
    first = false;
    await drawFatPage(doc, fat, opts.project, dateLabel, clientLogo, !!opts.hidePhotos);
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
    const photoUrl = t.expand?.photo ? fileUrl(t.expand.photo, t.expand.photo.file) : null;
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
      project.expand?.client?.logo ? fileUrl(project.expand.client, project.expand.client.logo) : null,
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

async function drawFatFinishCard(doc: jsPDF, entry: FatFinishEntry, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(1);
  doc.rect(x, y, w, h);

  const labelW = 90;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(entry.code, x + 10, y + 26);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text("Line " + (entry.line || "-"), x + 10, y + 40);
  doc.setFontSize(7.5);
  doc.text(`${entry.photoUrls.length} foto`, x + 10, y + 52);
  doc.line(x + labelW, y, x + labelW, y + h);

  const maxThumbs = 4;
  const shown = entry.photoUrls.slice(0, maxThumbs);
  const pad = 8;
  const gap = 6;
  const areaW = w - labelW - pad * 2;
  const thumbSize = Math.min(h - pad * 2, (areaW - gap * (shown.length - 1)) / Math.max(shown.length, 1));
  let tx = x + labelW + pad;
  const ty = y + (h - thumbSize) / 2;
  for (let i = 0; i < shown.length; i++) {
    const img = await loadImageAsJpegDataUrl(shown[i]);
    if (img) doc.addImage(img, "JPEG", tx, ty, thumbSize, thumbSize);
    else {
      doc.setFillColor(235, 235, 235);
      doc.rect(tx, ty, thumbSize, thumbSize, "F");
    }
    if (i === maxThumbs - 1 && entry.photoUrls.length > maxThumbs) {
      doc.setFillColor(20, 20, 20);
      doc.rect(tx, ty, thumbSize, thumbSize, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`+${entry.photoUrls.length - maxThumbs + 1}`, tx + thumbSize / 2, ty + thumbSize / 2 + 4, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }
    tx += thumbSize + gap;
  }
  if (shown.length === 0) {
    doc.setFillColor(235, 235, 235);
    doc.rect(x + labelW + pad, y + pad, areaW, h - pad * 2, "F");
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Belum ada foto", x + labelW + pad + areaW / 2, y + h / 2 + 3, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
}

export async function buildFatFinishReportPdf(opts: {
  project: OpmReportProject;
  entries: FatFinishEntry[];
  clientLogoUrl?: string | null;
}): Promise<jsPDF> {
  const clientLogo = opts.clientLogoUrl ? await loadImageAsJpegDataUrl(opts.clientLogoUrl) : null;
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const top = 110;
  const cardH = 150;
  const gap = 14;
  const perPage = Math.max(1, Math.floor((H - top - M + gap) / (cardH + gap)));

  let first = true;
  for (let i = 0; i < opts.entries.length; i += perPage) {
    if (!first) doc.addPage();
    first = false;
    drawFatFinishHeader(doc, opts.project, clientLogo);
    const slice = opts.entries.slice(i, i + perPage);
    for (let j = 0; j < slice.length; j++) {
      const y = top + j * (cardH + gap);
      await drawFatFinishCard(doc, slice[j], M, y, W - 2 * M, cardH);
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
    byFat.get(p.asset)!.push(fileUrl(p, p.file));
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
      project.expand?.client?.logo ? fileUrl(project.expand.client, project.expand.client.logo) : null,
    clusterName: project.cluster_name,
  };
}
