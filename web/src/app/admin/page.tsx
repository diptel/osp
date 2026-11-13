"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { rupiah } from "@/components/ExpenseList";

/**
 * Dasbor admin: ringkasan nilai proyek (kontrak), opname, biaya, dan
 * untung/rugi semua proyek yang tidak diarsip. Daftar proyek lengkap ada
 * di halaman /admin/proyek.
 */
type Row = {
  id: string;
  code: string;
  cluster_id: string;
  cluster_name: string;
  name: string;
  status: string;
  contract_value: number;
  opname_total: number;
  labor: number;
  labor_tunai: number;
  expenses: number;
  margin: number;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  survei: "Survei",
  desain: "Desain",
  berjalan: "Berjalan",
  rfs: "RFS",
  atp: "ATP",
  revisi_atp: "Revisi ATP",
  lunas: "Lunas",
  selesai: "Selesai",
  ditahan: "Ditahan",
  dibatalkan: "Dibatalkan",
};
// Dikerjakan = sudah masuk lapangan sampai menunggu pelunasan; belum = tahap persiapan.
const ONGOING = new Set(["berjalan", "rfs", "atp", "revisi_atp", "ditahan"]);
const PENDING = new Set(["draft", "survei", "desain"]);
const DONE = new Set(["lunas", "selesai"]);

export default function AdminDashboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    pb()
      .send("/api/briix/dashboard/summary", { method: "GET" })
      .then((r: { projects: Row[] }) => setRows(r.projects))
      .catch((e) => setErr("Gagal memuat ringkasan: " + (e instanceof Error ? e.message : String(e))));
  }, []);

  const sum = useMemo(() => {
    const live = (rows || []).filter((r) => r.status !== "dibatalkan");
    const pick = (set: Set<string>) => live.filter((r) => set.has(r.status));
    const agg = (xs: Row[]) => ({
      n: xs.length,
      contract: xs.reduce((s, r) => s + r.contract_value, 0),
      opname: xs.reduce((s, r) => s + r.opname_total, 0),
      cost: xs.reduce((s, r) => s + r.labor + r.expenses, 0),
      margin: xs.reduce((s, r) => s + r.margin, 0),
    });
    return { all: agg(live), ongoing: agg(pick(ONGOING)), pending: agg(pick(PENDING)), done: agg(pick(DONE)), live };
  }, [rows]);

  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">Nilai proyek, opname, dan untung/rugi seluruh proyek BRIIX OSP.</p>
        </div>
        <Link href="/admin/proyek" className="text-sm font-semibold px-3 py-2 rounded-lg bg-ink text-white">
          Daftar proyek →
        </Link>
      </div>

      {err && <p className="text-sm text-warn">{err}</p>}
      {!rows && !err && <p className="text-sm text-muted">Memuat...</p>}

      {rows && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Nilai semua proyek" value={rupiah(sum.all.contract)} sub={`${sum.all.n} proyek aktif (tanpa arsip & batal)`} />
            <Stat label="Sedang dikerjakan" value={rupiah(sum.ongoing.contract)} sub={`${sum.ongoing.n} proyek · berjalan s.d. ATP`} />
            <Stat label="Belum dikerjakan" value={rupiah(sum.pending.contract)} sub={`${sum.pending.n} proyek · draf/survei/desain`} />
            <Stat label="Selesai / lunas" value={rupiah(sum.done.contract)} sub={`${sum.done.n} proyek`} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Opname disetujui QC" value={rupiah(sum.all.opname)} sub={`${pct(sum.all.opname, sum.all.contract)} dari nilai semua proyek`} />
            <Stat label="Total biaya" value={rupiah(sum.all.cost)} sub="tenaga kerja + pengeluaran" />
            <Stat
              label={sum.all.margin >= 0 ? "Untung (sementara)" : "Rugi (sementara)"}
              value={rupiah(Math.abs(sum.all.margin))}
              sub={`margin ${pct(sum.all.margin, sum.all.opname)} dari opname`}
              tone={sum.all.margin >= 0 ? "ok" : "warn"}
            />
            <Stat
              label="L/R proyek berjalan"
              value={rupiah(Math.abs(sum.ongoing.margin))}
              sub={sum.ongoing.margin >= 0 ? "untung sementara" : "rugi sementara"}
              tone={sum.ongoing.margin >= 0 ? "ok" : "warn"}
            />
          </div>

          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Per proyek</p>
              <p className="text-xs text-muted">Nilai = Σ volume × harga satuan paket. Opname = volume disetujui QC. L/R = opname − biaya.</p>
            </div>
            {sum.live.length === 0 ? (
              <p className="text-sm text-muted p-4">
                Belum ada proyek.{" "}
                <Link href="/admin/proyek-baru" className="text-accent underline">
                  Buat proyek baru
                </Link>
                .
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Proyek</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Nilai proyek</th>
                    <th className="text-right px-3 py-2 font-medium">Opname</th>
                    <th className="text-right px-3 py-2 font-medium">Biaya</th>
                    <th className="text-right px-4 py-2 font-medium">L/R</th>
                  </tr>
                </thead>
                <tbody>
                  {sum.live.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <Link href={`/admin/proyek/${r.id}/manajemen`} className="font-semibold hover:underline">
                          {r.cluster_name || r.name}
                        </Link>
                        <div className="font-mono text-[11px] text-muted">{r.cluster_id || r.code}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{STATUS_LABEL[r.status] || r.status}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(r.contract_value)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {rupiah(r.opname_total)}
                        <div className="text-[11px] text-faint">{pct(r.opname_total, r.contract_value)}</div>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{rupiah(r.labor + r.expenses)}</td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap font-semibold ${r.margin >= 0 ? "text-ok" : "text-warn"}`}>
                        {r.margin < 0 ? "−" : ""}
                        {rupiah(Math.abs(r.margin))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm font-semibold">
                  <tr className="border-t border-border bg-[#FAFAF8]">
                    <td className="px-4 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right">{rupiah(sum.all.contract)}</td>
                    <td className="px-3 py-2 text-right">{rupiah(sum.all.opname)}</td>
                    <td className="px-3 py-2 text-right">{rupiah(sum.all.cost)}</td>
                    <td className={`px-4 py-2 text-right ${sum.all.margin >= 0 ? "text-ok" : "text-warn"}`}>
                      {sum.all.margin < 0 ? "−" : ""}
                      {rupiah(Math.abs(sum.all.margin))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  const toneCls = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col gap-0.5">
      <span className="text-[11px] text-muted">{label}</span>
      <span className={`text-lg font-semibold leading-tight ${toneCls}`}>{value}</span>
      {sub && <span className="text-[11px] text-faint">{sub}</span>}
    </div>
  );
}
