// Form ATP E2E — satu halaman per FAT, mengikuti format form pengecekan
// klien/main vendor (logo vendor kiri, logo klien kanan, tabel 2 kolom:
// CLUSTER NAME, DATE, OUT PUT FDT / OPM TEST, LINE, FAT NO, PORT FAT, FDT ID).
// Data proyek sudah terisi; kolom hasil pengecekan dibiarkan kosong untuk
// ditulis tangan oleh pihak pengecek di lapangan. Dibangun di server.
import jsPDF from "jspdf";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type Client = ReturnType<typeof pb>;

export type AtpFormData = {
  cluster_name: string;
  cluster_id: string;
  fdt_code: string;
  fdt_input_dbm?: number;
  fdt_check_dbm?: number;
  fats: { code: string; line: string; ports: number }[];
  clientLogoUrl: string | null;
  vendorLogoUrl: string | null;
};

function urlFor(client: Client, record: RecordModel, filename?: string | null, thumb?: string) {
  if (!filename) return null;
  return client.files.getURL(record, filename, thumb ? { thumb } : undefined);
}

export async function fetchAtpFormData(projectId: string, client: Client): Promise<AtpFormData> {
  const p = await client.collection("projects").getOne<RecordModel & Record<string, unknown>>(projectId, { expand: "client" });
  const fats = await client
    .collection("assets")
    .getFullList<RecordModel & { code: string; line?: string; ports?: number }>({ filter: `project = "${projectId}" && kind = "fat"`, sort: "line,code" });
  let fdtCode = "";
  try {
    const fdt = await client.collection("assets").getFirstListItem<RecordModel & { code: string }>(`project = "${projectId}" && (kind = "fdt" || kind = "odc")`);
    fdtCode = fdt.code;
  } catch {
    /* tidak ada FDT */
  }
  let fdtCheck: number | undefined;
  try {
    const ph = await client.collection("photos").getFirstListItem<RecordModel & { value_dbm?: number }>(`project = "${projectId}" && purpose = "fdt_opm"`, { sort: "-created" });
    fdtCheck = ph.value_dbm;
  } catch {
    /* belum ada */
  }
  const expandClient = (p.expand as { client?: RecordModel & { logo?: string } } | undefined)?.client;
  return {
    cluster_name: String(p.cluster_name || p.name || ""),
    cluster_id: String(p.cluster_id || p.code || ""),
    fdt_code: fdtCode,
    fdt_input_dbm: p.fdt_input_dbm ? Number(p.fdt_input_dbm) : undefined,
    fdt_check_dbm: fdtCheck,
    fats: fats.map((f) => ({ code: f.code, line: f.line || "", ports: f.ports || 8 })),
    clientLogoUrl: expandClient?.logo ? urlFor(client, expandClient, expandClient.logo) : null,
    vendorLogoUrl: p.atp_logo ? urlFor(client, p, String(p.atp_logo), "400x0") : null,
  };
}

async function loadImage(url: string | null, authToken?: string): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, authToken ? { headers: { Authorization: authToken } } : undefined);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "";
    const fmt = ct.includes("png") ? "PNG" : "JPEG";
    const data = `data:image/${fmt.toLowerCase()};base64,${buf.toString("base64")}`;
    const size = fmt === "PNG" ? pngSize(buf) : jpegSize(buf);
    return { data, w: size?.w || 4, h: size?.h || 1 };
  } catch {
    return null;
  }
}
function pngSize(b: Buffer) {
  if (b.length < 24) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function jpegSize(b: Buffer) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

export async function buildAtpFormPdf(data: AtpFormData, authToken?: string): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = 612;
  const M = 56;
  const [clientLogo, vendorLogo] = await Promise.all([loadImage(data.clientLogoUrl, authToken), loadImage(data.vendorLogoUrl, authToken)]);

  const fitImg = (img: { data: string; w: number; h: number }, x: number, y: number, maxW: number, maxH: number, align: "left" | "right") => {
    const s = Math.min(maxW / img.w, maxH / img.h);
    const w = img.w * s;
    const h = img.h * s;
    const dx = align === "right" ? x - w : x;
    doc.addImage(img.data, img.data.startsWith("data:image/png") ? "PNG" : "JPEG", dx, y + (maxH - h) / 2, w, h);
  };

  const page = (fat: AtpFormData["fats"][number] | null) => {
    // logo kiri (vendor utama) & kanan (klien)
    if (vendorLogo) fitImg(vendorLogo, M, 44, 140, 44, "left");
    if (clientLogo) fitImg(clientLogo, W - M, 44, 150, 44, "right");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Form ATP E2E", W / 2, 112, { align: "center" });
    doc.setLineWidth(0.8);
    doc.line(W / 2 - 42, 115, W / 2 + 42, 115);

    const x0 = M;
    const x1 = M + 132;
    const x2 = W - M;
    let y = 150;
    const draw = (label: string, value: string, h: number, sub?: { label: string; value: string }) => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.8);
      doc.rect(x0, y, x2 - x0, h);
      doc.line(x1, y, x1, y + h);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.text(label, x0 + 8, y + 16);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      if (value) doc.text(value, x1 + 10, y + 17);
      if (sub) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.text(sub.label, x0 + 8, y + h / 2 + 12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        if (sub.value) doc.text(sub.value, x1 + 10, y + h / 2 + 13);
      }
      y += h;
    };
    const fdtOut = data.fdt_input_dbm != null ? `${data.fdt_input_dbm} dBm` : "";
    const fdtCheck = data.fdt_check_dbm != null ? `cek lapangan: ${data.fdt_check_dbm} dBm` : "";
    draw("CLUSTER NAME", `${data.cluster_name}${data.cluster_id ? `  (${data.cluster_id})` : ""}`, 56);
    draw("DATE", "", 56);
    draw("OUT PUT FDT", fdtOut, 112, { label: "OPM TEST", value: fdtCheck });
    draw("LINE", fat ? fat.line || "-" : "", 56);
    draw("FAT NO", fat ? fat.code : "", 56);
    // PORT FAT: kotak kecil per port untuk diisi pengecek
    const ph = 56;
    doc.rect(x0, y, x2 - x0, ph);
    doc.line(x1, y, x1, y + ph);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text("PORT FAT", x0 + 8, y + 16);
    if (fat) {
      const n = fat.ports;
      const gap = 4;
      const bw = Math.min(44, (x2 - x1 - 20 - gap * (n - 1)) / n);
      doc.setFontSize(7.5);
      for (let i = 0; i < n; i++) {
        const bx = x1 + 10 + i * (bw + gap);
        doc.setLineWidth(0.5);
        doc.rect(bx, y + 10, bw, 36);
        doc.text(`P${i + 1}`, bx + bw / 2, y + 19, { align: "center" });
      }
      doc.setFontSize(7);
      doc.setTextColor(110, 110, 110);
      doc.text("dBm", x1 + 10 + n * (bw + gap) + 2, y + 44);
      doc.setTextColor(0, 0, 0);
    }
    y += ph;
    draw("FDT ID", data.fdt_code, 56);

    // keterangan kecil & tanda tangan
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(110, 110, 110);
    doc.text(`Dicetak dari BRIIX OSP · ${new Date().toLocaleDateString("id-ID", { dateStyle: "long" })} · ${fat ? `FAT ${fat.code}` : ""}`, M, y + 16);
    doc.setTextColor(0, 0, 0);
    const sy = y + 60;
    doc.setFontSize(9);
    doc.text("Pelaksana (BRIIX OSP)", M + 70, sy, { align: "center" });
    doc.text("Pengecek", W / 2, sy, { align: "center" });
    doc.text("Pemilik proyek", W - M - 70, sy, { align: "center" });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    for (const cx of [M + 70, W / 2, W - M - 70]) doc.line(cx - 60, sy + 56, cx + 60, sy + 56);
  };

  if (data.fats.length === 0) page(null);
  data.fats.forEach((f, i) => {
    if (i > 0) doc.addPage();
    page(f);
  });
  return doc;
}
