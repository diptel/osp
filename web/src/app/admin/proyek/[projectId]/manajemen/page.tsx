"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";
import { AttendanceForm, type Worker } from "@/components/AttendanceForm";
import { ExpenseList, EXPENSE_CATEGORY, rupiah, type ExpenseRow } from "@/components/ExpenseList";
import { ReportList } from "@/components/ReportList";

type Project = RecordModel & {
  cluster_name: string;
  cluster_id: string;
  name: string;
  status: string;
  start_date?: string;
  target_date?: string;
  target_days?: number;
  budget?: number;
};
type AttendanceRow = RecordModel & { worker: string; date: string; present: boolean; overtime: number };
type RateRow = RecordModel & { worker: string; daily_rate?: number; overtime_rate?: number };
type Opname = { total_amount: number; packages: { name: string; amount: number }[] };

type Tab = "ringkasan" | "absensi" | "biaya" | "tarif" | "laporan";

function isoDate(v?: string) {
  return v ? v.slice(0, 10) : "";
}

/**
 * Manajemen proyek (admin): ringkasan tenaga kerja & biaya vs target/anggaran
 * dan nilai opname (untung/rugi), plus tab input absensi, biaya, dan tarif
 * khusus per proyek.
 */
export default function ManajemenProyekPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = String(projectId);
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [project, setProject] = useState<Project | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [att, setAtt] = useState<AttendanceRow[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [opname, setOpname] = useState<Opname | null>(null);
  const [targetForm, setTargetForm] = useState({ start_date: "", target_date: "", target_days: "", budget: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    pb()
      .collection("projects")
      .getOne<Project>(pid)
      .then((p) => {
        setProject(p);
        setTargetForm({
          start_date: isoDate(p.start_date),
          target_date: isoDate(p.target_date),
          target_days: p.target_days != null ? String(p.target_days) : "",
          budget: p.budget != null ? String(p.budget) : "",
        });
      })
      .catch(() => void 0);
    pb().collection("workers").getFullList<Worker>({ sort: "name" }).then(setWorkers).catch(() => setWorkers([]));
    pb()
      .collection("attendance")
      .getFullList<AttendanceRow>({ filter: `project = "${pid}"`, sort: "date" })
      .then(setAtt)
      .catch(() => setAtt([]));
    pb()
      .collection("project_rates")
      .getFullList<RateRow>({ filter: `project = "${pid}"` })
      .then(setRates)
      .catch(() => setRates([]));
    pb()
      .collection("project_expenses")
      .getFullList<ExpenseRow>({ filter: `project = "${pid}"` })
      .then(setExpenses)
      .catch(() => setExpenses([]));
    pb()
      .send(`/api/briix/projects/${pid}/opname`, { method: "GET" })
      .then((r: Opname) => setOpname(r))
      .catch(() => setOpname(null));
  }, [pid]);

  useEffect(load, [load]);
  // muat ulang ringkasan tiap kali balik ke tab Ringkasan (setelah input absensi/biaya)
  useEffect(() => {
    if (tab === "ringkasan") load();
  }, [tab, load]);

  const rateOf = useCallback(
    (w: Worker) => {
      const o = rates.find((r) => r.worker === w.id);
      return {
        daily: o?.daily_rate != null && o.daily_rate > 0 ? o.daily_rate : w.daily_rate || 0,
        overtime: o?.overtime_rate != null && o.overtime_rate > 0 ? o.overtime_rate : w.overtime_rate || 0,
        overridden: !!o && ((o.daily_rate || 0) > 0 || (o.overtime_rate || 0) > 0),
      };
    },
    [rates]
  );

  const labor = useMemo(() => {
    const byWorker = new Map<string, { days: number; overtime: number }>();
    const dates = new Set<string>();
    for (const a of att) {
      if (!a.present) continue;
      dates.add(a.date.slice(0, 10));
      const cur = byWorker.get(a.worker) || { days: 0, overtime: 0 };
      cur.days += 1;
      cur.overtime += a.overtime || 0;
      byWorker.set(a.worker, cur);
    }
    const rows = workers
      .filter((w) => byWorker.has(w.id))
      .map((w) => {
        const s = byWorker.get(w.id)!;
        const r = rateOf(w);
        const cost = s.days * r.daily + s.overtime * r.overtime;
        return { w, days: s.days, overtime: s.overtime, rate: r, cost };
      })
      .sort((a, b) => b.cost - a.cost);
    const total = rows.reduce((s, r) => s + r.cost, 0);
    const bulanan = rows.filter((r) => r.w.employment === "bulanan").length;
    const freelance = rows.filter((r) => r.w.employment === "freelance").length;
    const overtimeTotal = rows.reduce((s, r) => s + r.overtime, 0);
    return { rows, total, workDays: dates.size, bulanan, freelance, overtimeTotal };
  }, [att, workers, rateOf]);

  const expenseByCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) m.set(e.category, (m.get(e.category) || 0) + (e.amount || 0));
    return m;
  }, [expenses]);
  const expenseTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const costTotal = labor.total + expenseTotal;
  const revenue = opname?.total_amount || 0;
  const margin = revenue - costTotal;
  const budget = project?.budget || 0;

  async function saveTargets() {
    try {
      await pb()
        .collection("projects")
        .update(pid, {
          start_date: targetForm.start_date ? `${targetForm.start_date} 00:00:00` : null,
          target_date: targetForm.target_date ? `${targetForm.target_date} 00:00:00` : null,
          target_days: Number(targetForm.target_days) || 0,
          budget: Number(targetForm.budget) || 0,
        });
      setMsg("Target & anggaran tersimpan.");
      load();
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function saveRate(w: Worker, daily: string, overtime: string) {
    const existing = rates.find((r) => r.worker === w.id);
    const data = { project: pid, worker: w.id, daily_rate: Number(daily) || 0, overtime_rate: Number(overtime) || 0 };
    try {
      if (existing) await pb().collection("project_rates").update(existing.id, data);
      else await pb().collection("project_rates").create(data);
      load();
    } catch (e) {
      alert("Gagal menyimpan tarif: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const TABS: [Tab, string][] = [
    ["ringkasan", "Ringkasan"],
    ["absensi", "Absensi"],
    ["biaya", "Biaya"],
    ["tarif", "Tarif per proyek"],
    ["laporan", "Laporan PDF"],
  ];

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <Link href="/admin" className="text-xs text-accent underline">
          ← Dashboard
        </Link>
        <p className="font-mono text-xs text-muted mt-2">{project?.cluster_id}</p>
        <h1 className="text-xl font-semibold">Manajemen — {project?.cluster_name || project?.name || "Memuat..."}</h1>
        <p className="text-sm text-muted">Tenaga kerja, biaya, target, dan untung/rugi proyek.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === k ? "bg-ink text-white border-ink" : "border-border text-subtle"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "ringkasan" && (
        <div className="flex flex-col gap-5">
          {/* Kartu angka utama */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Nilai opname (disetujui QC)" value={rupiah(revenue)} sub={opname ? `${opname.packages.length} paket` : "—"} />
            <Stat label="Biaya tenaga kerja" value={rupiah(labor.total)} sub={`${labor.rows.length} pekerja · ${labor.overtimeTotal}× lembur`} />
            <Stat label="Biaya lain-lain" value={rupiah(expenseTotal)} sub={`${expenses.length} transaksi`} />
            <Stat
              label={margin >= 0 ? "Untung (sementara)" : "Rugi (sementara)"}
              value={rupiah(Math.abs(margin))}
              sub={revenue ? `${Math.round((margin / revenue) * 100)}% dari opname` : "belum ada opname"}
              tone={margin >= 0 ? "ok" : "warn"}
            />
          </div>

          {/* Target & anggaran */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Target & anggaran</p>
              <p className="text-xs text-muted">
                Hari kerja terpakai: <b>{labor.workDays}</b>
                {project?.target_days ? ` / ${project.target_days} hari target` : ""}
                {budget ? ` · Biaya ${Math.round((costTotal / budget) * 100)}% dari anggaran` : ""}
              </p>
            </div>
            {project?.target_days ? <Bar value={labor.workDays} max={project.target_days} /> : null}
            {budget ? <Bar value={costTotal} max={budget} warnOver /> : null}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="text-xs text-muted flex flex-col gap-1">
                Mulai
                <input type="date" value={targetForm.start_date} onChange={(e) => setTargetForm({ ...targetForm, start_date: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card" />
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">
                Target selesai
                <input type="date" value={targetForm.target_date} onChange={(e) => setTargetForm({ ...targetForm, target_date: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card" />
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">
                Target hari kerja
                <input type="number" min={0} value={targetForm.target_days} onChange={(e) => setTargetForm({ ...targetForm, target_days: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card" />
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">
                Anggaran biaya (Rp)
                <input type="number" min={0} value={targetForm.budget} onChange={(e) => setTargetForm({ ...targetForm, budget: e.target.value })} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card" />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveTargets} className="self-start px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white">
                Simpan target
              </button>
              {msg && <p className="text-xs text-subtle">{msg}</p>}
            </div>
          </div>

          {/* Tenaga kerja */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Tenaga kerja</p>
              <p className="text-xs text-muted">
                {labor.bulanan} bulanan · {labor.freelance} freelance
              </p>
            </div>
            {labor.rows.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted">Belum ada absensi. Isi lewat tab Absensi (atau surveyor dari app).</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#FAFAF8] text-xs text-muted">
                  <tr>
                    <th className="text-left px-4 py-2">Pekerja</th>
                    <th className="text-right px-3 py-2">Hari</th>
                    <th className="text-right px-3 py-2">Lembur</th>
                    <th className="text-right px-3 py-2">Tarif/hari</th>
                    <th className="text-right px-4 py-2">Biaya</th>
                  </tr>
                </thead>
                <tbody>
                  {labor.rows.map((r) => (
                    <tr key={r.w.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <span className="font-semibold">{r.w.name}</span>
                        <span className="block text-[11px] text-faint">
                          {r.w.employment === "bulanan" ? "Bulanan" : "Freelance"}
                          {r.rate.overridden ? " · tarif khusus proyek" : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{r.days}</td>
                      <td className="px-3 py-2 text-right">{r.overtime}×</td>
                      <td className="px-3 py-2 text-right">{rupiah(r.rate.daily)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{rupiah(r.cost)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-[#FAFAF8]">
                    <td className="px-4 py-2 font-semibold" colSpan={4}>
                      Total tenaga kerja
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{rupiah(labor.total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Biaya per kategori */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3">
              <p className="text-sm font-semibold">Biaya per kategori</p>
            </div>
            {expenses.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted">Belum ada biaya tercatat. Isi lewat tab Biaya (atau surveyor dari app).</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(EXPENSE_CATEGORY)
                    .filter(([k]) => expenseByCat.has(k))
                    .map(([k, label]) => (
                      <tr key={k} className="border-t border-border">
                        <td className="px-4 py-2">{label}</td>
                        <td className="px-4 py-2 text-right">{rupiah(expenseByCat.get(k) || 0)}</td>
                      </tr>
                    ))}
                  <tr className="border-t border-border bg-[#FAFAF8]">
                    <td className="px-4 py-2 font-semibold">Total biaya lain-lain</td>
                    <td className="px-4 py-2 text-right font-semibold">{rupiah(expenseTotal)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Opname */}
          {opname && opname.packages.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Nilai opname (pekerjaan disetujui QC)</p>
                <Link href="/admin/opname" className="text-xs text-accent underline">
                  Detail opname
                </Link>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {opname.packages.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2">{p.name}</td>
                      <td className="px-4 py-2 text-right">{rupiah(p.amount)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-[#FAFAF8]">
                    <td className="px-4 py-2 font-semibold">Total opname</td>
                    <td className="px-4 py-2 text-right font-semibold">{rupiah(revenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "laporan" && (
        <div className="max-w-2xl flex flex-col gap-2">
          <p className="text-sm text-muted">
            Laporan manajemen proyek (internal BRIIX, bukan untuk klien): nilai opname, berita acara, tenaga kerja, biaya per
            kategori, untung/rugi, dan lampiran rincian biaya. Tersimpan per proyek — generate ulang kalau data berubah.
          </p>
          <ReportList projectId={pid} kind="manajemen" canDelete />
        </div>
      )}

      {tab === "absensi" && (
        <div className="max-w-xl">
          <AttendanceForm projectId={pid} />
        </div>
      )}

      {tab === "biaya" && (
        <div className="max-w-xl">
          <ExpenseList projectId={pid} canDelete />
        </div>
      )}

      {tab === "tarif" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden max-w-3xl">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold">Tarif khusus proyek ini</p>
            <p className="text-xs text-muted">Kosongkan (0) untuk memakai tarif default dari menu Pekerja.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAF8] text-xs text-muted">
              <tr>
                <th className="text-left px-4 py-2">Pekerja</th>
                <th className="text-right px-3 py-2">Default/hari</th>
                <th className="text-right px-3 py-2">Khusus/hari</th>
                <th className="text-right px-3 py-2">Khusus lembur</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {workers
                .filter((w) => w.active)
                .map((w) => (
                  <RateRowEdit key={w.id} w={w} existing={rates.find((r) => r.worker === w.id)} onSave={saveRate} />
                ))}
            </tbody>
          </table>
        </div>
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

function Bar({ value, max, warnOver }: { value: number; max: number; warnOver?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const over = warnOver && value > max;
  return (
    <div className="h-2 rounded-full bg-[#EEF0F2] overflow-hidden">
      <div className={`h-full ${over ? "bg-warn" : "bg-ok"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function RateRowEdit({
  w,
  existing,
  onSave,
}: {
  w: Worker;
  existing?: RateRow;
  onSave: (w: Worker, daily: string, overtime: string) => Promise<void>;
}) {
  const [daily, setDaily] = useState(existing?.daily_rate ? String(existing.daily_rate) : "");
  const [overtime, setOvertime] = useState(existing?.overtime_rate ? String(existing.overtime_rate) : "");
  useEffect(() => {
    setDaily(existing?.daily_rate ? String(existing.daily_rate) : "");
    setOvertime(existing?.overtime_rate ? String(existing.overtime_rate) : "");
  }, [existing]);
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2">
        <span className="font-semibold">{w.name}</span>
        <span className="block text-[11px] text-faint">{w.employment === "bulanan" ? "Bulanan" : "Freelance"}</span>
      </td>
      <td className="px-3 py-2 text-right text-xs text-muted">
        {rupiah(w.daily_rate || 0)}
        <span className="block">lembur {rupiah(w.overtime_rate || 0)}</span>
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" min={0} value={daily} onChange={(e) => setDaily(e.target.value)} className="w-28 border border-border rounded-md px-2 py-1 text-sm text-right bg-card" />
      </td>
      <td className="px-3 py-2 text-right">
        <input type="number" min={0} value={overtime} onChange={(e) => setOvertime(e.target.value)} className="w-28 border border-border rounded-md px-2 py-1 text-sm text-right bg-card" />
      </td>
      <td className="px-3 py-2 text-right">
        <button onClick={() => onSave(w, daily, overtime)} className="text-xs text-accent underline">
          Simpan
        </button>
      </td>
    </tr>
  );
}
