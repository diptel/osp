"use client";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";
import { rupiah } from "@/components/ExpenseList";

type Worker = RecordModel & {
  name: string;
  phone?: string;
  employment: "bulanan" | "freelance";
  daily_rate?: number;
  overtime_rate?: number;
  active?: boolean;
  note?: string;
};

const EMPTY = { name: "", phone: "", employment: "freelance" as "bulanan" | "freelance", daily_rate: "", overtime_rate: "", note: "" };

/**
 * Master pekerja (tidak harus punya akun app): tipe bulanan/freelance,
 * tarif per hari & per kejadian lembur (default; bisa ditimpa per proyek di
 * halaman Manajemen proyek), aktif/nonaktif.
 */
export default function PekerjaPage() {
  const [rows, setRows] = useState<Worker[] | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [editId, setEditId] = useState("");
  const [msg, setMsg] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  function load() {
    pb()
      .collection("workers")
      .getFullList<Worker>({ sort: "name" })
      .then(setRows)
      .catch(() => setRows([]));
  }
  useEffect(load, []);

  function startEdit(w: Worker) {
    setEditId(w.id);
    setForm({
      name: w.name,
      phone: w.phone || "",
      employment: w.employment,
      daily_rate: w.daily_rate != null ? String(w.daily_rate) : "",
      overtime_rate: w.overtime_rate != null ? String(w.overtime_rate) : "",
      note: w.note || "",
    });
  }

  async function save() {
    if (!form.name.trim()) {
      setMsg("Nama wajib diisi.");
      return;
    }
    const data = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      employment: form.employment,
      daily_rate: Number(form.daily_rate) || 0,
      overtime_rate: Number(form.overtime_rate) || 0,
      note: form.note.trim(),
    };
    try {
      if (editId) await pb().collection("workers").update(editId, data);
      else await pb().collection("workers").create({ ...data, active: true });
      setForm({ ...EMPTY });
      setEditId("");
      setMsg(editId ? "Pekerja diperbarui." : "Pekerja ditambahkan.");
      load();
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function toggleActive(w: Worker) {
    await pb().collection("workers").update(w.id, { active: !w.active });
    load();
  }

  const list = (rows || []).filter((w) => showInactive || w.active);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Pekerja</h1>
        <p className="text-sm text-muted">
          Daftar pekerja lapangan (bulanan & freelance) beserta tarif default. Tarif bisa ditimpa per proyek di
          halaman Manajemen proyek. Pekerja tidak perlu punya akun app.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <p className="text-sm font-semibold">{editId ? "Ubah pekerja" : "Tambah pekerja"}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama" className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="No. HP (opsional)" className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          <select value={form.employment} onChange={(e) => setForm({ ...form, employment: e.target.value as "bulanan" | "freelance" })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card">
            <option value="freelance">Freelance</option>
            <option value="bulanan">Pegawai bulanan</option>
          </select>
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Catatan (opsional)" className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          <label className="text-xs text-muted flex flex-col gap-1">
            Tarif per hari (Rp){form.employment === "bulanan" ? " — gaji bulanan dibagi per hari kerja (alokasi ke proyek, bukan dibayar tunai)" : ""}
            <input type="number" min={0} value={form.daily_rate} onChange={(e) => setForm({ ...form, daily_rate: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Tarif lembur per kejadian (Rp)
            <input type="number" min={0} value={form.overtime_rate} onChange={(e) => setForm({ ...form, overtime_rate: e.target.value })} className="border border-border rounded-lg px-3 py-2 text-sm bg-card" />
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="px-3 py-2 rounded-lg text-sm font-semibold bg-ink text-white">
            {editId ? "Simpan perubahan" : "Tambah"}
          </button>
          {editId && (
            <button onClick={() => { setEditId(""); setForm({ ...EMPTY }); }} className="px-3 py-2 rounded-lg text-sm text-subtle">
              Batal
            </button>
          )}
        </div>
        {msg && <p className="text-xs text-subtle">{msg}</p>}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Daftar pekerja ({list.length})</p>
        <label className="text-xs text-muted flex items-center gap-1.5">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          tampilkan nonaktif
        </label>
      </div>
      {rows === null && <p className="text-sm text-muted">Memuat...</p>}
      {rows?.length === 0 && <p className="text-sm text-muted">Belum ada pekerja.</p>}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#FAFAF8] text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2">Nama</th>
              <th className="text-left px-3 py-2">Tipe</th>
              <th className="text-right px-3 py-2">Per hari</th>
              <th className="text-right px-3 py-2">Lembur/kali</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id} className={`border-t border-border ${w.active ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">
                  <span className="font-semibold">{w.name}</span>
                  {w.phone && <span className="block text-xs text-faint">{w.phone}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{w.employment === "bulanan" ? "Bulanan" : "Freelance"}</td>
                <td className="px-3 py-2 text-right">{rupiah(w.daily_rate || 0)}</td>
                <td className="px-3 py-2 text-right">{rupiah(w.overtime_rate || 0)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(w)} className="text-xs text-accent underline mr-3">
                    Ubah
                  </button>
                  <button onClick={() => toggleActive(w)} className="text-xs text-subtle underline">
                    {w.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
