"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pb, fileUrl } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";
import { rupiah } from "@/components/ExpenseList";
import { formatTanggalId } from "@/components/DatePickerId";

type ProjectRow = RecordModel & { cluster_name: string; cluster_id: string; name: string; status: string };
type OpnamePkg = {
  package: string;
  type: string;
  name: string;
  line: string;
  unit: string;
  volume: number;
  approved_qty: number;
  count_mode?: string;
  unit_price: number;
  amount: number;
  executor_type: string;
};
type OpnameCalc = { project: string; packages: OpnamePkg[]; total_amount: number; fats_done?: number; cores_done?: number; ports_approved?: number };
const MODE_SHORT: Record<string, string> = {
  ports_approved: "per port OPM",
  fats_approved: "per FAT selesai",
  fat_cores_approved: "per core FAT selesai",
  work_items: "progres kerja QC",
  manual: "manual",
};
type OpnameRow = RecordModel & {
  project: string;
  package: string;
  period_start?: string;
  period_end?: string;
  approved_qty?: number;
  amount?: number;
  paid_amount?: number;
  status: string;
  doc?: string;
  note?: string;
  expand?: { package?: RecordModel & { name: string; unit: string }; project?: RecordModel & { cluster_name: string } };
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  terbit: "Terbit",
  dibayar_sebagian: "Dibayar sebagian",
  lunas: "Lunas",
};
const STATUS_ORDER = ["draft", "terbit", "dibayar_sebagian", "lunas"];
const UNIT_LABEL: Record<string, string> = { m: "meter", tiang: "tiang", titik: "titik", port: "port", fat: "FAT", core: "core", paket: "paket" };

/**
 * Opname & pembayaran: pilih proyek → hitungan otomatis per paket (volume
 * disetujui QC × harga satuan, dari endpoint /api/briix/projects/{id}/opname)
 * → buat berita acara opname (snapshot qty & nilai saat itu) → kelola status
 * & pembayaran. Nilai yang sudah pernah di-opname dikurangkan supaya opname
 * berikutnya hanya memuat progres baru.
 */
export default function OpnamePage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [pid, setPid] = useState("");
  const [calc, setCalc] = useState<OpnameCalc | null>(null);
  const [rows, setRows] = useState<OpnameRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  // Semua konfirmasi/isian di dalam halaman — bukan confirm()/prompt()
  // browser yang bisa dibisukan Chrome setelah beberapa dialog.
  const [ask, setAsk] = useState<{ pkg: OpnamePkg; qty: number; amount: number } | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ id: string; value: string } | null>(null);
  const [paidEdit, setPaidEdit] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ filter: "archived != true", sort: "-created" })
      .then((list) => {
        setProjects(list);
        if (list.length && !pid) setPid(list[0].id);
      })
      .catch(() => setProjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    if (!pid) return;
    setCalc(null);
    pb()
      .send(`/api/briix/projects/${pid}/opname`, { method: "GET" })
      .then((r: OpnameCalc) => setCalc(r))
      .catch(() => setCalc({ project: pid, packages: [], total_amount: 0 }));
    pb()
      .collection("opnames")
      .getFullList<OpnameRow>({ filter: `project = "${pid}"`, expand: "package,project", sort: "-created" })
      .then(setRows)
      .catch(() => setRows([]));
  }, [pid]);

  useEffect(load, [load]);

  // qty & nilai yang sudah pernah dituangkan ke berita acara per paket
  const already = new Map<string, { qty: number; amount: number }>();
  for (const r of rows || []) {
    const cur = already.get(r.package) || { qty: 0, amount: 0 };
    cur.qty += r.approved_qty || 0;
    cur.amount += r.amount || 0;
    already.set(r.package, cur);
  }

  function createOpname(p: OpnamePkg) {
    const done = already.get(p.package) || { qty: 0, amount: 0 };
    const qty = Math.max(0, p.approved_qty - done.qty);
    const amount = Math.round(qty * p.unit_price);
    if (qty <= 0) {
      setMsg("Tidak ada progres baru yang disetujui QC untuk paket ini sejak opname terakhir.");
      return;
    }
    setMsg("");
    setAsk({ pkg: p, qty, amount });
  }

  async function doCreateOpname() {
    if (!ask) return;
    const { pkg: p, qty, amount } = ask;
    setBusy(p.package);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const last = (rows || []).filter((r) => r.package === p.package).sort((a, b) => (a.created < b.created ? 1 : -1))[0];
      await pb().collection("opnames").create({
        project: pid,
        package: p.package,
        period_start: last?.period_end || last?.created || null,
        period_end: `${today} 00:00:00`,
        approved_qty: qty,
        amount,
        paid_amount: 0,
        status: "draft",
      });
      setMsg(`Berita acara opname "${p.name}" dibuat (${rupiah(amount)}).`);
      setAsk(null);
      load();
    } catch (e) {
      setMsg("Gagal membuat opname: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function setStatus(r: OpnameRow, status: string) {
    if (status === "dibayar_sebagian") {
      setPaidEdit({ id: r.id, value: String(r.paid_amount || "") });
      return;
    }
    const data: Record<string, unknown> = { status };
    if (status === "lunas") data.paid_amount = r.amount || 0;
    if (status === "draft" || status === "terbit") data.paid_amount = 0;
    setBusy(r.id);
    try {
      await pb().collection("opnames").update(r.id, data);
      load();
    } catch (e) {
      setMsg("Gagal mengubah status: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function savePaid(r: OpnameRow) {
    if (!paidEdit) return;
    const paid = Number(paidEdit.value) || 0;
    setBusy(r.id);
    try {
      await pb().collection("opnames").update(r.id, { status: paid >= (r.amount || 0) ? "lunas" : "dibayar_sebagian", paid_amount: paid });
      setPaidEdit(null);
      load();
    } catch (e) {
      setMsg("Gagal menyimpan pembayaran: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function uploadDoc(r: OpnameRow, file: File) {
    const form = new FormData();
    form.append("doc", file);
    setBusy(r.id);
    try {
      await pb().collection("opnames").update(r.id, form);
      load();
    } catch (e) {
      setMsg("Gagal unggah dokumen: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function savePrice(p: OpnamePkg) {
    if (!priceEdit) return;
    const price = Number(String(priceEdit.value).replace(/[^0-9.]/g, "")) || 0;
    setBusy(p.package);
    try {
      await pb().collection("work_packages").update(p.package, { unit_price: price });
      setPriceEdit(null);
      load();
    } catch (e) {
      setMsg("Gagal menyimpan harga: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  const [delAsk, setDelAsk] = useState("");
  async function remove(r: OpnameRow) {
    setBusy(r.id);
    try {
      await pb().collection("opnames").delete(r.id);
      setDelAsk("");
      load();
    } finally {
      setBusy("");
    }
  }

  const totalOpname = (rows || []).reduce((s, r) => s + (r.amount || 0), 0);
  const totalPaid = (rows || []).reduce((s, r) => s + (r.paid_amount || 0), 0);

  return (
    <div className="max-w-4xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Opname &amp; pembayaran</h1>
        <p className="text-sm text-muted">
          Berita acara opname per paket pekerjaan — dihitung dari volume yang sudah disetujui QC × harga satuan paket.
        </p>
      </div>

      <label className="text-xs text-muted flex flex-col gap-1 max-w-md">
        Proyek
        <select value={pid} onChange={(e) => setPid(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-card">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.cluster_id ? `${p.cluster_id} — ` : ""}
              {p.cluster_name || p.name}
            </option>
          ))}
        </select>
      </label>

      {msg && <p className="text-sm text-subtle">{msg}</p>}

      {ask && (
        <div className="bg-[#FAFAF8] border border-dashed border-line2 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold">Buat berita acara opname &quot;{ask.pkg.name}&quot;?</p>
          <p className="text-sm">
            {ask.qty} {UNIT_LABEL[ask.pkg.unit] || ask.pkg.unit} × {rupiah(ask.pkg.unit_price)} = <b>{rupiah(ask.amount)}</b>
          </p>
          <div className="flex gap-2">
            <button onClick={doCreateOpname} disabled={busy !== ""} className="px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50">
              {busy === ask.pkg.package ? "Menyimpan..." : "Ya, buat berita acara"}
            </button>
            <button onClick={() => setAsk(null)} className="px-2 py-2 text-xs text-subtle">
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Hitungan otomatis per paket */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold">Progres disetujui QC per paket</p>
          <p className="text-xs text-muted">
            {calc && (
              <>
                {calc.fats_done ?? 0} FAT selesai · {calc.cores_done ?? 0} core · {calc.ports_approved ?? 0} port · total {rupiah(calc.total_amount)} ·{" "}
              </>
            )}
            {pid && (
              <Link href={`/admin/proyek/${pid}/paket`} className="text-accent underline">
                Atur paket &amp; harga
              </Link>
            )}
          </p>
        </div>
        {calc === null && <p className="px-4 pb-4 text-xs text-muted">Menghitung...</p>}
        {calc && calc.packages.length === 0 && (
          <p className="px-4 pb-4 text-xs text-muted">Proyek ini belum punya paket pekerjaan (dibuat saat impor KMZ).</p>
        )}
        {calc && calc.packages.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAF8] text-xs text-muted">
              <tr>
                <th className="text-left px-4 py-2">Paket</th>
                <th className="text-right px-3 py-2">Disetujui / volume</th>
                <th className="text-right px-3 py-2">Harga satuan</th>
                <th className="text-right px-3 py-2">Nilai</th>
                <th className="text-right px-3 py-2">Sudah di-opname</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {calc.packages.map((p) => {
                const done = already.get(p.package) || { qty: 0, amount: 0 };
                const sisa = Math.max(0, p.approved_qty - done.qty);
                return (
                  <tr key={p.package} className="border-t border-border">
                    <td className="px-4 py-2">
                      <span className="font-semibold">{p.name}</span>
                      <span className="block text-[11px] text-faint">
                        {p.type}
                        {p.line ? ` · line ${p.line}` : ""} · {p.executor_type} · {MODE_SHORT[p.count_mode || ""] || ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {p.approved_qty} / {p.volume} {UNIT_LABEL[p.unit] || p.unit}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {priceEdit?.id === p.package ? (
                        <span className="inline-flex gap-1">
                          <input
                            autoFocus
                            type="number"
                            min={0}
                            value={priceEdit.value}
                            onChange={(e) => setPriceEdit({ id: p.package, value: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && savePrice(p)}
                            className="w-28 border border-border rounded-md px-2 py-1 text-sm text-right bg-card"
                          />
                          <button onClick={() => savePrice(p)} className="text-xs font-semibold px-2 rounded-md bg-ink text-white">
                            OK
                          </button>
                          <button onClick={() => setPriceEdit(null)} className="text-xs text-subtle px-1">
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setPriceEdit({ id: p.package, value: p.unit_price ? String(p.unit_price) : "" })}
                          className="underline decoration-dotted"
                          title="Ubah harga satuan"
                        >
                          {p.unit_price ? rupiah(p.unit_price) : <span className="text-warn">isi harga</span>}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{rupiah(p.amount)}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted">
                      {done.qty} {UNIT_LABEL[p.unit] || p.unit}
                      <span className="block">{rupiah(done.amount)}</span>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => createOpname(p)}
                        disabled={busy !== "" || sisa <= 0 || !p.unit_price}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-ink text-white disabled:opacity-40"
                        title={sisa <= 0 ? "Tidak ada progres baru" : `Opname ${sisa} ${UNIT_LABEL[p.unit] || p.unit} baru`}
                      >
                        + Opname{sisa > 0 ? ` (${sisa})` : ""}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="px-4 py-3 text-[11px] text-faint border-t border-border">
          Klik harga satuan untuk mengubahnya; satuan & cara hitung diatur di &quot;Atur paket &amp; harga&quot;. Opname baru hanya memuat progres yang belum pernah di-opname.
        </p>
      </div>

      {/* Daftar berita acara */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Berita acara opname</p>
          {rows && rows.length > 0 && (
            <p className="text-xs text-muted">
              Total {rupiah(totalOpname)} · dibayar {rupiah(totalPaid)} · sisa {rupiah(totalOpname - totalPaid)}
            </p>
          )}
        </div>
        {rows === null && <p className="text-sm text-muted">Memuat...</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">Belum ada berita acara untuk proyek ini. Klik "+ Opname" di tabel paket di atas.</p>}
        {rows?.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{r.expand?.package?.name}</p>
              <p className="text-xs text-muted">
                {r.approved_qty ?? 0} {UNIT_LABEL[r.expand?.package?.unit || ""] || r.expand?.package?.unit} · {rupiah(r.amount || 0)}
                {r.paid_amount ? ` · dibayar ${rupiah(r.paid_amount)}` : ""}
                {r.period_end ? ` · s/d ${formatTanggalId(r.period_end.slice(0, 10))}` : ""}
              </p>
              <p className="text-[11px] text-faint">
                Dibuat {new Date(r.created).toLocaleDateString("id-ID")}
                {r.doc && (
                  <>
                    {" · "}
                    <a href={fileUrl(r, r.doc)} target="_blank" rel="noreferrer" className="text-accent underline">
                      dokumen BA
                    </a>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={r.status}
                disabled={busy === r.id}
                onChange={(e) => setStatus(r, e.target.value)}
                className="text-xs font-semibold px-2 py-1 rounded-md border border-border bg-card"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <label className="text-xs text-accent underline cursor-pointer">
                {r.doc ? "Ganti BA" : "Unggah BA (PDF)"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadDoc(r, f);
                    e.target.value = "";
                  }}
                />
              </label>
              {r.status === "draft" &&
                (delAsk === r.id ? (
                  <span className="inline-flex items-center gap-2 text-xs">
                    Hapus BA ini?
                    <button onClick={() => remove(r)} disabled={busy === r.id} className="font-semibold px-2 py-1 rounded-md bg-warn text-white">
                      Ya
                    </button>
                    <button onClick={() => setDelAsk("")} className="text-subtle">
                      Tidak
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setDelAsk(r.id)} disabled={busy === r.id} className="text-xs text-warn underline">
                    Hapus
                  </button>
                ))}
            </div>
            {paidEdit?.id === r.id && (
              <div className="w-full flex items-center gap-2 text-xs">
                <span>Jumlah sudah dibayar (Rp):</span>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={paidEdit.value}
                  onChange={(e) => setPaidEdit({ id: r.id, value: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && savePaid(r)}
                  className="w-36 border border-border rounded-md px-2 py-1 text-sm bg-card"
                />
                <button onClick={() => savePaid(r)} disabled={busy === r.id} className="font-semibold px-2 py-1 rounded-md bg-ink text-white">
                  Simpan
                </button>
                <button onClick={() => setPaidEdit(null)} className="text-subtle">
                  Batal
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
