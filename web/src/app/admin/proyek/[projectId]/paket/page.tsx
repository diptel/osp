"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";
import { rupiah } from "@/components/ExpenseList";

type Project = RecordModel & { cluster_name: string; cluster_id: string; name: string };
type Pkg = RecordModel & {
  type: string;
  name: string;
  line?: string;
  unit: string;
  volume?: number;
  unit_price?: number;
  count_mode?: string;
  manual_qty?: number;
  executor_type: string;
  includes_material?: boolean;
};
type Fat = RecordModel & { code: string; line?: string; ports?: number; cores?: number };

const TYPE_LABEL: Record<string, string> = {
  survei: "Survei",
  desain: "Desain",
  kabel: "Tarik kabel",
  tiang: "Tanam tiang",
  jointing: "Jointing",
  opm: "Uji OPM",
};
const UNIT_LABEL: Record<string, string> = {
  m: "meter",
  tiang: "tiang",
  titik: "titik",
  port: "port",
  fat: "FAT",
  core: "core",
  paket: "paket",
};
const MODE_LABEL: Record<string, string> = {
  ports_approved: "Port OPM disetujui QC",
  fats_approved: "FAT selesai (semua port disetujui)",
  fat_cores_approved: "Core FAT yang selesai (jointing FAT/FDT)",
  work_items: "Progres kerja disetujui QC",
  manual: "Manual (isi jumlah sendiri)",
};
const DEFAULT_MODE = (type: string) => (type === "opm" ? "ports_approved" : "work_items");

const EMPTY = {
  type: "jointing",
  name: "",
  line: "",
  unit: "core",
  volume: "",
  unit_price: "",
  count_mode: "fat_cores_approved",
  manual_qty: "",
  executor_type: "tim",
};

/**
 * Paket pekerjaan & harga per proyek: nama, jenis, satuan (port/FAT/core/
 * meter/...), volume kontrak, harga satuan, dan CARA HITUNG volume disetujui
 * untuk opname. Juga jumlah core per FAT (dipakai hitung jointing).
 */
export default function PaketPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = String(projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[] | null>(null);
  const [fats, setFats] = useState<Fat[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    pb().collection("projects").getOne<Project>(pid).then(setProject).catch(() => void 0);
    pb()
      .collection("work_packages")
      .getFullList<Pkg>({ filter: `project = "${pid}"`, sort: "type,name" })
      .then(setPkgs)
      .catch(() => setPkgs([]));
    pb()
      .collection("assets")
      .getFullList<Fat>({ filter: `project = "${pid}" && kind = "fat"`, sort: "line,code" })
      .then(setFats)
      .catch(() => setFats([]));
  }, [pid]);
  useEffect(load, [load]);

  function startEdit(p: Pkg) {
    setEditId(p.id);
    setForm({
      type: p.type,
      name: p.name,
      line: p.line || "",
      unit: p.unit,
      volume: p.volume != null ? String(p.volume) : "",
      unit_price: p.unit_price != null ? String(p.unit_price) : "",
      count_mode: p.count_mode || DEFAULT_MODE(p.type),
      manual_qty: p.manual_qty != null ? String(p.manual_qty) : "",
      executor_type: p.executor_type || "tim",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!form.name.trim()) {
      setMsg("Nama paket wajib diisi.");
      return;
    }
    const data = {
      project: pid,
      type: form.type,
      name: form.name.trim(),
      line: form.line.trim(),
      unit: form.unit,
      volume: Number(form.volume) || 0,
      unit_price: Number(form.unit_price) || 0,
      count_mode: form.count_mode,
      manual_qty: Number(form.manual_qty) || 0,
      executor_type: form.executor_type,
    };
    setBusy("form");
    try {
      if (editId) await pb().collection("work_packages").update(editId, data);
      else await pb().collection("work_packages").create({ ...data, status: "rencana" });
      setMsg(editId ? "Paket diperbarui." : "Paket ditambahkan.");
      setEditId("");
      setForm({ ...EMPTY });
      load();
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function remove(p: Pkg) {
    setBusy(p.id);
    try {
      await pb().collection("work_packages").delete(p.id);
      setMsg(`Paket "${p.name}" dihapus.`);
      load();
    } catch (e) {
      setMsg("Gagal menghapus: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function saveCores(f: Fat, v: string) {
    const cores = Math.max(0, Math.floor(Number(v) || 0));
    try {
      await pb().collection("assets").update(f.id, { cores });
      setFats((list) => list.map((x) => (x.id === f.id ? { ...x, cores } : x)));
    } catch (e) {
      alert("Gagal menyimpan core: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const totalCores = fats.reduce((s, f) => s + (f.cores || Math.ceil((f.ports || 8) / 8)), 0);
  const kontrak = (pkgs || []).reduce((s, p) => s + (p.volume || 0) * (p.unit_price || 0), 0);

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <Link href="/admin" className="text-xs text-accent underline">
          ← Dashboard
        </Link>
        <p className="font-mono text-xs text-muted mt-2">{project?.cluster_id}</p>
        <h1 className="text-xl font-semibold">Paket & harga — {project?.cluster_name || project?.name || "Memuat..."}</h1>
        <p className="text-sm text-muted">
          Satuan & harga tiap paket pekerjaan, dan cara menghitung volume yang disetujui untuk opname. Nilai kontrak
          (volume × harga): <b>{rupiah(kontrak)}</b>.
        </p>
      </div>

      {/* Form paket */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold">{editId ? "Ubah paket" : "Tambah paket"}</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs text-muted flex flex-col gap-1 col-span-2">
            Nama paket
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Jointing FAT, Join Feeder" className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Jenis
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, count_mode: form.count_mode })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Line (opsional)
            <input value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Satuan
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card">
              {Object.entries(UNIT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Volume kontrak
            <input type="number" min={0} value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Harga satuan (Rp)
            <input type="number" min={0} value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Pelaksana
            <select value={form.executor_type} onChange={(e) => setForm({ ...form, executor_type: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card">
              <option value="tim">Tim BRIIX</option>
              <option value="pemborong">Pemborong</option>
            </select>
          </label>
          <label className="text-xs text-muted flex flex-col gap-1 col-span-2">
            Cara hitung volume disetujui (untuk opname)
            <select value={form.count_mode} onChange={(e) => setForm({ ...form, count_mode: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card">
              {Object.entries(MODE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {form.count_mode === "manual" && (
            <label className="text-xs text-muted flex flex-col gap-1">
              Jumlah selesai (manual)
              <input type="number" min={0} value={form.manual_qty} onChange={(e) => setForm({ ...form, manual_qty: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
            </label>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy === "form"} className="px-3 py-2 rounded-lg text-sm font-semibold bg-ink text-white disabled:opacity-50">
            {editId ? "Simpan perubahan" : "Tambah paket"}
          </button>
          {editId && (
            <button onClick={() => { setEditId(""); setForm({ ...EMPTY }); }} className="text-sm text-subtle">
              Batal
            </button>
          )}
          {msg && <p className="text-xs text-subtle">{msg}</p>}
        </div>
      </div>

      {/* Daftar paket */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-sm font-semibold">Paket pekerjaan ({pkgs?.length ?? 0})</p>
        </div>
        {pkgs === null && <p className="px-4 pb-4 text-xs text-muted">Memuat...</p>}
        {pkgs?.length === 0 && <p className="px-4 pb-4 text-xs text-muted">Belum ada paket. Tambahkan di atas.</p>}
        {pkgs && pkgs.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-[#FAFAF8] text-xs text-muted">
              <tr>
                <th className="text-left px-4 py-2">Paket</th>
                <th className="text-left px-3 py-2">Cara hitung</th>
                <th className="text-right px-3 py-2">Volume</th>
                <th className="text-right px-3 py-2">Harga satuan</th>
                <th className="text-right px-3 py-2">Nilai kontrak</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pkgs.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <span className="font-semibold">{p.name}</span>
                    <span className="block text-[11px] text-faint">
                      {TYPE_LABEL[p.type] || p.type}
                      {p.line ? ` · line ${p.line}` : ""} · {p.executor_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {MODE_LABEL[p.count_mode || DEFAULT_MODE(p.type)]}
                    {(p.count_mode || DEFAULT_MODE(p.type)) === "manual" ? ` (${p.manual_qty || 0})` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.volume || 0} {UNIT_LABEL[p.unit] || p.unit}
                  </td>
                  <td className="px-3 py-2 text-right">{p.unit_price ? rupiah(p.unit_price) : <span className="text-warn">belum</span>}</td>
                  <td className="px-3 py-2 text-right">{rupiah((p.volume || 0) * (p.unit_price || 0))}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => startEdit(p)} className="text-xs text-accent underline mr-3">
                      Ubah
                    </button>
                    <button onClick={() => remove(p)} disabled={busy === p.id} className="text-xs text-warn underline">
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Core per FAT */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Core per FAT ({fats.length} FAT)</p>
          <p className="text-xs text-muted">Total {totalCores} core</p>
        </div>
        <p className="px-4 pb-3 text-xs text-muted">
          Jumlah core yang di-splice ke tiap FAT — dipakai paket dengan cara hitung &quot;Core FAT yang selesai&quot;
          (jointing FAT dan jointing FDT sisi FAT). Kosong = otomatis 1 core per 8 port.
        </p>
        {fats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 px-4 pb-4">
            {fats.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-xs border border-border rounded-lg px-2.5 py-1.5">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{f.code.split(".").pop() || f.code}</span>
                  <span className="block text-faint">
                    {f.line ? `Line ${f.line} · ` : ""}
                    {f.ports || 8} port
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={f.cores || Math.ceil((f.ports || 8) / 8)}
                  onBlur={(e) => saveCores(f, e.target.value)}
                  className="w-14 border border-border rounded-md px-1.5 py-1 text-sm text-center bg-card"
                  title="core"
                />
                <span className="text-faint">core</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
