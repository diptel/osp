// Laporan Manajemen Proyek (internal BRIIX): tenaga kerja, biaya, opname,
// untung/rugi. Dibangun di server (API route generate, Node) dengan jsPDF —
// hanya tabel/teks, tanpa foto. Data diambil lewat instance PocketBase yang
// sudah login sebagai admin (jaringan internal).
import jsPDF from "jspdf";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type Client = ReturnType<typeof pb>;

export type ManajemenData = {
  project: {
    cluster_name: string;
    cluster_id: string;
    region: string;
    client: string;
    status: string;
    start_date?: string;
    target_date?: string;
    target_days?: number;
    budget?: number;
  };
  workers: { name: string; employment: string; days: number; overtime: number; daily: number; overtimeRate: number; cost: number }[];
  workDays: number;
  laborTotal: number;
  expensesByCat: { category: string; label: string; count: number; amount: number }[];
  expenses: { date: string; category: string; amount: number; note: string; by: string }[];
  expenseTotal: number;
  opname: { name: string; unit: string; volume: number; approved_qty: number; unit_price: number; amount: number }[];
  revenue: number;
  bas: { label: string; qty: number; amount: number; paid: number; status: string; created: string }[];
  baTotal: number;
  baPaid: number;
};

const CAT: Record<string, string> = {
  alat: "Alat",
  makan: "Uang makan",
  transport: "Transport",
  sewa_pickup: "Sewa pickup",
  material: "Material tambahan",
  lain: "Lain-lain",
};
const UNIT: Record<string, string> = { m: "m", tiang: "tiang", titik: "titik", port: "port", fat: "FAT", core: "core", paket: "paket" };
const STATUS: Record<string, string> = {
  draft: "Draf",
  terbit: "Terbit",
  dibayar_sebagian: "Dibayar sebagian",
  lunas: "Lunas",
};

export async function fetchManajemenData(projectId: string, client: Client): Promise<ManajemenData> {
  const p = await client.collection("projects").getOne<RecordModel & Record<string, unknown>>(projectId, { expand: "client" });
  const expandClient = (p.expand as { client?: { name?: string } } | undefined)?.client;
  const [workers, rates, att, expenses, opnameRes, bas] = await Promise.all([
    client.collection("workers").getFullList<RecordModel & Record<string, unknown>>({ sort: "name" }),
    client.collection("project_rates").getFullList<RecordModel & Record<string, unknown>>({ filter: `project = "${projectId}"` }),
    client.collection("attendance").getFullList<RecordModel & Record<string, unknown>>({ filter: `project = "${projectId}"`, sort: "date" }),
    client
      .collection("project_expenses")
      .getFullList<RecordModel & Record<string, unknown>>({ filter: `project = "${projectId}"`, sort: "date", expand: "entered_by" }),
    client.send(`/api/briix/projects/${projectId}/opname`, { method: "GET" }) as Promise<{
      packages: { name: string; unit: string; volume: number; approved_qty: number; unit_price: number; amount: number }[];
      total_amount: number;
    }>,
    client.collection("opnames").getFullList<RecordModel & Record<string, unknown>>({ filter: `project = "${projectId}"`, sort: "created", expand: "package" }),
  ]);

  const byWorker = new Map<string, { days: number; overtime: number }>();
  const dates = new Set<string>();
  for (const a of att) {
    if (!a.present) continue;
    dates.add(String(a.date).slice(0, 10));
    const cur = byWorker.get(String(a.worker)) || { days: 0, overtime: 0 };
    cur.days += 1;
    cur.overtime += Number(a.overtime || 0);
    byWorker.set(String(a.worker), cur);
  }
  const wrows = workers
    .filter((w) => byWorker.has(w.id))
    .map((w) => {
      const s = byWorker.get(w.id)!;
      const o = rates.find((r) => r.worker === w.id);
      const daily = o && Number(o.daily_rate) > 0 ? Number(o.daily_rate) : Number(w.daily_rate || 0);
      const overtimeRate = o && Number(o.overtime_rate) > 0 ? Number(o.overtime_rate) : Number(w.overtime_rate || 0);
      return {
        name: String(w.name),
        employment: String(w.employment),
        days: s.days,
        overtime: s.overtime,
        daily,
        overtimeRate,
        // bulanan: gaji ditanggung perusahaan, proyek hanya bayar lembur
        cost: (String(w.employment) === "bulanan" ? 0 : s.days * daily) + s.overtime * overtimeRate,
      };
    })
    .sort((a, b) => b.cost - a.cost);
  const laborTotal = wrows.reduce((s, r) => s + r.cost, 0);

  const catMap = new Map<string, { count: number; amount: number }>();
  for (const e of expenses) {
    const c = String(e.category);
    const cur = catMap.get(c) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(e.amount || 0);
    catMap.set(c, cur);
  }
  const expensesByCat = Object.keys(CAT)
    .filter((k) => catMap.has(k))
    .map((k) => ({ category: k, label: CAT[k], ...catMap.get(k)! }));
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  const basRows = bas.map((b) => ({
    label: String((b.expand as { package?: { name?: string } } | undefined)?.package?.name || "Paket"),
    qty: Number(b.approved_qty || 0),
    amount: Number(b.amount || 0),
    paid: Number(b.paid_amount || 0),
    status: String(b.status),
    created: String(b.created).slice(0, 10),
  }));

  return {
    project: {
      cluster_name: String(p.cluster_name || p.name || ""),
      cluster_id: String(p.cluster_id || p.code || ""),
      region: String(p.region || ""),
      client: String(expandClient?.name || ""),
      status: String(p.status || ""),
      start_date: p.start_date ? String(p.start_date).slice(0, 10) : undefined,
      target_date: p.target_date ? String(p.target_date).slice(0, 10) : undefined,
      target_days: Number(p.target_days || 0) || undefined,
      budget: Number(p.budget || 0) || undefined,
    },
    workers: wrows,
    workDays: dates.size,
    laborTotal,
    expensesByCat,
    expenses: expenses.map((e) => ({
      date: String(e.date).slice(0, 10),
      category: CAT[String(e.category)] || String(e.category),
      amount: Number(e.amount || 0),
      note: String(e.note || ""),
      by: String((e.expand as { entered_by?: { name?: string; email?: string } } | undefined)?.entered_by?.name || (e.expand as { entered_by?: { email?: string } } | undefined)?.entered_by?.email || ""),
    })),
    expenseTotal,
    opname: opnameRes.packages,
    revenue: opnameRes.total_amount,
    bas: basRows,
    baTotal: basRows.reduce((s, b) => s + b.amount, 0),
    baPaid: basRows.reduce((s, b) => s + b.paid, 0),
  };
}

// ---------- gambar ----------
const W = 595.28; // A4 pt
const H = 841.89;
const M = 40;
const INK: [number, number, number] = [22, 24, 29];
const MUTED: [number, number, number] = [95, 102, 112];
const LINE: [number, number, number] = [201, 205, 211];
const BG: [number, number, number] = [242, 243, 245];

function rp(n: number) {
  return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
}
function fmtDate(iso?: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  const B = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${d} ${B[(m || 1) - 1]} ${y}`;
}

type Col = { w: number; align?: "left" | "right" | "center" };

class Page {
  y = 0;
  constructor(public doc: jsPDF, public title: string, public sub: string) {
    this.newPage(true);
  }
  newPage(first = false) {
    if (!first) this.doc.addPage();
    const d = this.doc;
    d.setFillColor(...INK);
    d.rect(0, 0, W, 34, "F");
    d.setTextColor(255, 255, 255);
    d.setFont("helvetica", "bold");
    d.setFontSize(10);
    d.text(this.title, M, 21);
    d.setFont("helvetica", "normal");
    d.setFontSize(8);
    d.text(this.sub, W - M, 21, { align: "right" });
    d.setTextColor(...INK);
    this.y = 56;
    const n = d.getNumberOfPages();
    d.setFontSize(7.5);
    d.setTextColor(...MUTED);
    d.text(`Internal BRIIX OSP — tidak untuk klien · hal. ${n}`, W / 2, H - 20, { align: "center" });
    d.setTextColor(...INK);
  }
  need(h: number) {
    if (this.y + h > H - 40) this.newPage();
  }
  h1(t: string) {
    this.need(30);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.doc.text(t, M, this.y + 12);
    this.y += 24;
  }
  h2(t: string, right?: string) {
    this.need(24);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(11);
    this.doc.text(t, M, this.y + 10);
    if (right) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(right, W - M, this.y + 10, { align: "right" });
      this.doc.setTextColor(...INK);
    }
    this.y += 18;
  }
  p(t: string, size = 9) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(size);
    const lines = this.doc.splitTextToSize(t, W - 2 * M) as string[];
    this.need(lines.length * (size + 3) + 4);
    this.doc.text(lines, M, this.y + size);
    this.y += lines.length * (size + 3) + 4;
  }
  stats(items: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }[]) {
    const gap = 8;
    const w = (W - 2 * M - gap * (items.length - 1)) / items.length;
    const h = 46;
    this.need(h + 8);
    items.forEach((it, i) => {
      const x = M + i * (w + gap);
      this.doc.setDrawColor(...LINE);
      this.doc.setFillColor(255, 255, 255);
      this.doc.roundedRect(x, this.y, w, h, 4, 4, "FD");
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(7);
      this.doc.setTextColor(...MUTED);
      this.doc.text(it.label, x + 8, this.y + 12);
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(11);
      if (it.tone === "ok") this.doc.setTextColor(31, 122, 77);
      else if (it.tone === "warn") this.doc.setTextColor(180, 50, 40);
      else this.doc.setTextColor(...INK);
      this.doc.text(it.value, x + 8, this.y + 27);
      this.doc.setTextColor(...MUTED);
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(6.8);
      if (it.sub) this.doc.text(it.sub, x + 8, this.y + 38);
      this.doc.setTextColor(...INK);
    });
    this.y += h + 10;
  }
  table(cols: Col[], head: string[], rows: string[][], opts?: { total?: string[]; zebra?: boolean }) {
    const d = this.doc;
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const scale = (W - 2 * M) / totalW;
    const ws = cols.map((c) => c.w * scale);
    const fs = 8;
    const pad = 4;
    const drawRow = (cells: string[], bold: boolean, fill: boolean) => {
      d.setFont("helvetica", bold ? "bold" : "normal");
      d.setFontSize(fs);
      const wrapped = cells.map((c, i) => d.splitTextToSize(c, ws[i] - 2 * pad) as string[]);
      const lines = Math.max(1, ...wrapped.map((w) => w.length));
      const rh = lines * (fs + 2.5) + 2 * pad;
      this.need(rh);
      if (fill) {
        d.setFillColor(...BG);
        d.rect(M, this.y, W - 2 * M, rh, "F");
      }
      let x = M;
      cells.forEach((_, i) => {
        const a = cols[i].align || "left";
        const tx = a === "right" ? x + ws[i] - pad : a === "center" ? x + ws[i] / 2 : x + pad;
        d.text(wrapped[i], tx, this.y + pad + fs, { align: a });
        x += ws[i];
      });
      d.setDrawColor(...LINE);
      d.line(M, this.y + rh, W - M, this.y + rh);
      this.y += rh;
    };
    drawRow(head, true, true);
    rows.forEach((r, i) => drawRow(r, false, !!opts?.zebra && i % 2 === 1));
    if (opts?.total) drawRow(opts.total, true, true);
    this.y += 8;
  }
}

export function buildManajemenReportPdf(data: ManajemenData, generatedBy: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const P = data.project;
  const stamp = new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" });
  const pg = new Page(doc, `Laporan Manajemen Proyek — ${P.cluster_name}`, `${P.cluster_id} · ${stamp}`);

  pg.h1("Laporan Manajemen Proyek");
  pg.p(`${P.cluster_name} (${P.cluster_id}) · ${P.client || "-"} · ${P.region || "-"} · status: ${P.status}`, 9.5);
  pg.p(
    `Mulai ${fmtDate(P.start_date)} · target selesai ${fmtDate(P.target_date)} · target ${P.target_days || "-"} hari kerja · anggaran ${P.budget ? rp(P.budget) : "-"} · dibuat oleh ${generatedBy}`,
    8.5
  );

  const cost = data.laborTotal + data.expenseTotal;
  const margin = data.revenue - cost;
  pg.stats([
    { label: "NILAI OPNAME (DISETUJUI QC)", value: rp(data.revenue), sub: `${data.opname.length} paket` },
    { label: "BIAYA TENAGA KERJA", value: rp(data.laborTotal), sub: `${data.workers.length} pekerja · ${data.workDays} hari kerja` },
    { label: "BIAYA LAIN-LAIN", value: rp(data.expenseTotal), sub: `${data.expenses.length} transaksi` },
    {
      label: margin >= 0 ? "UNTUNG (SEMENTARA)" : "RUGI (SEMENTARA)",
      value: rp(Math.abs(margin)),
      sub: data.revenue ? `${Math.round((margin / data.revenue) * 100)}% dari opname` : "belum ada opname",
      tone: margin >= 0 ? "ok" : "warn",
    },
  ]);
  if (P.target_days || P.budget) {
    const parts: string[] = [];
    if (P.target_days) parts.push(`Hari kerja terpakai ${data.workDays} dari ${P.target_days} hari target (${Math.round((data.workDays / P.target_days) * 100)}%).`);
    if (P.budget) parts.push(`Total biaya ${rp(cost)} = ${Math.round((cost / P.budget) * 100)}% dari anggaran ${rp(P.budget)}${cost > P.budget ? " — MELEBIHI ANGGARAN" : ""}.`);
    pg.p(parts.join(" "), 8.5);
  }

  // Opname
  pg.h2("1. Nilai pekerjaan (opname dari progres disetujui QC)", `Total ${rp(data.revenue)}`);
  pg.table(
    [{ w: 46 }, { w: 10, align: "center" }, { w: 14, align: "right" }, { w: 14, align: "right" }, { w: 18, align: "right" }, { w: 22, align: "right" }],
    ["Paket", "Sat.", "Volume", "Disetujui", "Harga satuan", "Nilai"],
    data.opname.map((o) => [o.name, UNIT[o.unit] || o.unit, String(o.volume), String(o.approved_qty), rp(o.unit_price), rp(o.amount)]),
    { total: ["Total", "", "", "", "", rp(data.revenue)], zebra: true }
  );
  if (data.bas.length) {
    pg.h2("Berita acara opname", `Terbit ${rp(data.baTotal)} · dibayar ${rp(data.baPaid)} · sisa ${rp(data.baTotal - data.baPaid)}`);
    pg.table(
      [{ w: 16 }, { w: 40 }, { w: 12, align: "right" }, { w: 20, align: "right" }, { w: 20, align: "right" }, { w: 18 }],
      ["Tanggal", "Paket", "Qty", "Nilai", "Dibayar", "Status"],
      data.bas.map((b) => [fmtDate(b.created), b.label, String(b.qty), rp(b.amount), rp(b.paid), STATUS[b.status] || b.status]),
      { zebra: true }
    );
  }

  // Tenaga kerja
  pg.h2("2. Tenaga kerja", `${data.workers.filter((w) => w.employment === "bulanan").length} bulanan · ${data.workers.filter((w) => w.employment === "freelance").length} freelance`);
  if (data.workers.length === 0) pg.p("Belum ada absensi tercatat.");
  else
    pg.table(
      [{ w: 34 }, { w: 14 }, { w: 10, align: "right" }, { w: 12, align: "right" }, { w: 18, align: "right" }, { w: 18, align: "right" }, { w: 22, align: "right" }],
      ["Pekerja", "Tipe", "Hari", "Lembur", "Tarif/hari", "Tarif lembur", "Dibayar proyek"],
      data.workers.map((w) => [w.name, w.employment === "bulanan" ? "Bulanan" : "Freelance", String(w.days), `${w.overtime}×`, w.employment === "bulanan" ? "gaji perush." : rp(w.daily), rp(w.overtimeRate), rp(w.cost)]),
      { total: ["Total tenaga kerja", "", String(data.workers.reduce((s, w) => s + w.days, 0)), `${data.workers.reduce((s, w) => s + w.overtime, 0)}×`, "", "", rp(data.laborTotal)], zebra: true }
    );

  // Biaya
  pg.h2("3. Biaya lain-lain per kategori", `Total ${rp(data.expenseTotal)}`);
  if (data.expensesByCat.length === 0) pg.p("Belum ada biaya tercatat.");
  else
    pg.table(
      [{ w: 50 }, { w: 16, align: "right" }, { w: 26, align: "right" }],
      ["Kategori", "Transaksi", "Jumlah"],
      data.expensesByCat.map((c) => [c.label, String(c.count), rp(c.amount)]),
      { total: ["Total biaya lain-lain", String(data.expenses.length), rp(data.expenseTotal)], zebra: true }
    );

  // Ringkasan untung/rugi
  pg.h2("4. Ringkasan untung/rugi (sementara)");
  pg.table(
    [{ w: 60 }, { w: 30, align: "right" }],
    ["Uraian", "Jumlah"],
    [
      ["Nilai opname (pendapatan)", rp(data.revenue)],
      ["Biaya tenaga kerja", `(${rp(data.laborTotal)})`],
      ["Biaya lain-lain", `(${rp(data.expenseTotal)})`],
    ],
    { total: [margin >= 0 ? "Untung sementara" : "Rugi sementara", rp(margin)] }
  );
  pg.p(
    "Catatan: nilai opname dihitung dari volume yang disetujui QC × harga satuan paket, belum tentu sama dengan yang sudah ditagihkan/dibayar klien. Biaya tenaga kerja yang dibebankan ke proyek: freelance = hari hadir × tarif/hari + lembur × tarif lembur; pegawai bulanan digaji perusahaan sehingga hanya lemburnya yang dihitung (tarif khusus proyek menimpa tarif profil).",
    7.5
  );

  // Lampiran rincian biaya
  if (data.expenses.length) {
    pg.newPage();
    pg.h1("Lampiran — rincian biaya");
    pg.table(
      [{ w: 16 }, { w: 22 }, { w: 40 }, { w: 18 }, { w: 20, align: "right" }],
      ["Tanggal", "Kategori", "Keterangan", "Diinput", "Jumlah"],
      data.expenses.map((e) => [fmtDate(e.date), e.category, e.note || "-", e.by, rp(e.amount)]),
      { total: ["Total", "", "", "", rp(data.expenseTotal)], zebra: true }
    );
  }
  return doc;
}
