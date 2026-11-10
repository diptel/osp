"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb, fileUrl } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";
import { rupiah } from "@/components/ExpenseList";

type Project = RecordModel & {
  cluster_name: string;
  cluster_id: string;
  name: string;
  atp_logo?: string;
  feeder_cores?: number;
  gps_tolerance_m?: number;
  opm_limit_enabled?: boolean;
  opm_min_dbm?: number;
  fdt_input_dbm?: number;
};
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
type TplItem = {
  type: string;
  name: string;
  unit: string;
  count_mode: string;
  unit_price: number;
  executor_type: string;
  volume_mode: "fats" | "fat_cores" | "ports" | "fixed";
  volume: number;
};
type Template = RecordModel & { name: string; note?: string; items: TplItem[] };

// Tebak cara isi volume saat paket disimpan jadi template, dari cara hitungnya.
function guessVolumeMode(p: Pkg): TplItem["volume_mode"] {
  const m = p.count_mode || DEFAULT_MODE(p.type);
  if (m === "fats_approved") return "fats";
  if (m === "fat_cores_approved") return "fat_cores";
  if (m === "ports_approved") return "ports";
  return "fixed";
}

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
  const [settings, setSettings] = useState({ gps_tolerance_m: "", opm_limit_enabled: false, opm_min_dbm: "", feeder_cores: "", fdt_input_dbm: "" });
  const [busy, setBusy] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplSel, setTplSel] = useState("");
  const [tplName, setTplName] = useState("");
  const [showTpl, setShowTpl] = useState(false);

  const load = useCallback(() => {
    pb()
      .collection("projects")
      .getOne<Project>(pid)
      .then((p) => {
        setProject(p);
        setSettings({
          gps_tolerance_m: p.gps_tolerance_m ? String(p.gps_tolerance_m) : "",
          opm_limit_enabled: !!p.opm_limit_enabled,
          opm_min_dbm: p.opm_min_dbm != null ? String(p.opm_min_dbm) : "",
          feeder_cores: p.feeder_cores ? String(p.feeder_cores) : "",
          fdt_input_dbm: p.fdt_input_dbm != null ? String(p.fdt_input_dbm) : "",
        });
      })
      .catch(() => void 0);
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
    pb()
      .collection("package_templates")
      .getFullList<Template>({ sort: "name" })
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [pid]);
  useEffect(load, [load]);

  // ----- template -----
  async function saveTemplate() {
    const name = tplName.trim();
    if (!name || !pkgs || pkgs.length === 0) {
      setMsg("Isi nama template, dan proyek harus punya paket.");
      return;
    }
    const items: TplItem[] = pkgs.map((p) => ({
      type: p.type,
      name: p.name,
      unit: p.unit,
      count_mode: p.count_mode || DEFAULT_MODE(p.type),
      unit_price: p.unit_price || 0,
      executor_type: p.executor_type || "tim",
      volume_mode: guessVolumeMode(p),
      volume: p.volume || 0,
    }));
    setBusy("tpl");
    try {
      const existing = templates.find((t) => t.name === name);
      if (existing) await pb().collection("package_templates").update(existing.id, { items });
      else await pb().collection("package_templates").create({ name, items });
      setMsg(`Template "${name}" tersimpan (${items.length} paket, termasuk harga).`);
      setTplName("");
      load();
    } catch (e) {
      setMsg("Gagal menyimpan template: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function applyTemplate() {
    const t = templates.find((x) => x.id === tplSel);
    if (!t) return;
    const fatCount = fats.length;
    const coreCount = fats.reduce((s, f) => s + (f.cores || Math.ceil((f.ports || 8) / 8)), 0);
    const portCount = fats.reduce((s, f) => s + (f.ports || 8), 0);
    setBusy("tpl");
    let made = 0;
    let skipped = 0;
    try {
      for (const it of t.items || []) {
        if ((pkgs || []).some((p) => p.name === it.name)) {
          skipped++;
          continue;
        }
        const volume =
          it.volume_mode === "fats" ? fatCount : it.volume_mode === "fat_cores" ? coreCount : it.volume_mode === "ports" ? portCount : it.volume || 0;
        await pb().collection("work_packages").create({
          project: pid,
          type: it.type,
          name: it.name,
          unit: it.unit,
          volume,
          unit_price: it.unit_price || 0,
          count_mode: it.count_mode,
          manual_qty: 0,
          executor_type: it.executor_type || "tim",
          status: "rencana",
        });
        made++;
      }
      setMsg(`Template "${t.name}" diterapkan: ${made} paket dibuat${skipped ? `, ${skipped} dilewati (nama sudah ada)` : ""}. Volume dihitung dari ${fatCount} FAT / ${coreCount} core proyek ini.`);
      load();
    } catch (e) {
      setMsg("Gagal menerapkan template: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function deleteTemplate() {
    const t = templates.find((x) => x.id === tplSel);
    if (!t) return;
    setBusy("tpl");
    try {
      await pb().collection("package_templates").delete(t.id);
      setTplSel("");
      setMsg(`Template "${t.name}" dihapus.`);
      load();
    } finally {
      setBusy("");
    }
  }

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

  async function saveSettings() {
    try {
      await pb().collection("projects").update(pid, {
        gps_tolerance_m: Number(settings.gps_tolerance_m) || 0,
        opm_limit_enabled: settings.opm_limit_enabled,
        opm_min_dbm: settings.opm_min_dbm === "" ? null : Number(settings.opm_min_dbm),
        feeder_cores: Number(settings.feeder_cores) || 0,
        fdt_input_dbm: settings.fdt_input_dbm === "" ? null : Number(settings.fdt_input_dbm),
      });
      setMsg("Pengaturan teknis tersimpan.");
      load();
    } catch (e) {
      setMsg("Gagal menyimpan pengaturan: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function uploadAtpLogo(file: File) {
    const form = new FormData();
    form.append("atp_logo", file);
    try {
      await pb().collection("projects").update(pid, form);
      setMsg("Logo header Form ATP tersimpan.");
      load();
    } catch (e) {
      setMsg("Gagal unggah logo: " + (e instanceof Error ? e.message : String(e)));
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

      {/* Template */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Template paket</p>
          <button onClick={() => setShowTpl((v) => !v)} className="text-xs text-accent underline">
            {showTpl ? "Sembunyikan" : "Tampilkan"}
          </button>
        </div>
        {showTpl && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">
                <b>Terapkan</b> template ke proyek ini — volume dihitung otomatis dari jumlah FAT / core / port proyek ini,
                harga ikut dari template. Paket yang namanya sudah ada dilewati.
              </p>
              <div className="flex gap-2">
                <select value={tplSel} onChange={(e) => setTplSel(e.target.value)} className="border border-border rounded-lg px-3 py-2 text-sm bg-card flex-1">
                  <option value="">— pilih template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({(t.items || []).length} paket)
                    </option>
                  ))}
                </select>
                <button onClick={applyTemplate} disabled={!tplSel || busy === "tpl"} className="px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-40">
                  Terapkan
                </button>
                <button onClick={deleteTemplate} disabled={!tplSel || busy === "tpl"} className="px-2 py-2 text-xs text-warn underline disabled:opacity-40">
                  Hapus
                </button>
              </div>
              {tplSel && (
                <ul className="text-[11px] text-faint list-disc pl-4">
                  {(templates.find((t) => t.id === tplSel)?.items || []).map((it, i) => (
                    <li key={i}>
                      {it.name} — {UNIT_LABEL[it.unit] || it.unit} · {rupiah(it.unit_price)} ·{" "}
                      {it.volume_mode === "fats" ? "volume = jumlah FAT" : it.volume_mode === "fat_cores" ? "volume = total core FAT" : it.volume_mode === "ports" ? "volume = total port" : `volume ${it.volume}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">
                <b>Simpan</b> paket proyek ini (beserta harga) sebagai template untuk proyek lain. Nama yang sama = menimpa.
              </p>
              <div className="flex gap-2">
                <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nama template, mis. MyRepublic FTTH standar" className="border border-border rounded-lg px-3 py-2 text-sm bg-card flex-1" />
                <button onClick={saveTemplate} disabled={busy === "tpl" || !pkgs || pkgs.length === 0} className="px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-40">
                  Simpan sebagai template
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/* Pengaturan teknis */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold">Pengaturan teknis proyek</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">
            Toleransi jarak foto ke titik (m)
            <input type="number" min={0} value={settings.gps_tolerance_m} onChange={(e) => setSettings({ ...settings, gps_tolerance_m: e.target.value })} placeholder="50" className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Jumlah core feeder masuk FDT
            <input type="number" min={0} value={settings.feeder_cores} onChange={(e) => setSettings({ ...settings, feeder_cores: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Input FDT terukur (dBm)
            <input type="number" step="0.01" value={settings.fdt_input_dbm} onChange={(e) => setSettings({ ...settings, fdt_input_dbm: e.target.value })} placeholder="-9.84" className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <div className="text-xs text-muted flex flex-col gap-1">
            <label className="flex items-center gap-2 mt-1">
              <input type="checkbox" checked={settings.opm_limit_enabled} onChange={(e) => setSettings({ ...settings, opm_limit_enabled: e.target.checked })} />
              Batasi redaman minimal yang disetujui
            </label>
            <input
              type="number"
              step="0.01"
              value={settings.opm_min_dbm}
              onChange={(e) => setSettings({ ...settings, opm_min_dbm: e.target.value })}
              placeholder="mis. -25"
              disabled={!settings.opm_limit_enabled}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-card disabled:opacity-50"
            />
          </div>
        </div>
        <p className="text-[11px] text-faint">
          Batas redaman berlaku untuk uji OPM tiap port FAT dan cek 1 port FDT: nilai di bawah batas (lebih negatif) tidak bisa
          disetujui QC dan ditandai di app teknisi. Kosongkan/nonaktifkan kalau tidak ingin dibatasi.
        </p>
        <button onClick={saveSettings} className="self-start px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white">
          Simpan pengaturan
        </button>
      </div>

      {/* Header Form ATP */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
        <p className="text-sm font-semibold">Logo header Form ATP E2E (vendor utama)</p>
        <p className="text-xs text-muted">
          Form ATP dicetak dengan logo vendor utama di kiri (mis. main vendor pemilik form) dan logo klien di kanan (dari
          menu Klien). Unggah file logo yang diberikan vendor/klien.
        </p>
        <div className="flex items-center gap-3">
          {project?.atp_logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl(project, project.atp_logo, "400x0")} alt="logo vendor" className="h-10 object-contain bg-white border border-border rounded px-2" />
          )}
          <label className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border cursor-pointer">
            {project?.atp_logo ? "Ganti logo" : "Unggah logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAtpLogo(f); e.target.value = ""; }} />
          </label>
        </div>
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
