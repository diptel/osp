"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import { DatePickerId, todayIso, formatTanggalId } from "@/components/DatePickerId";
import type { RecordModel } from "pocketbase";

export const EXPENSE_CATEGORY: Record<string, string> = {
  alat: "Alat",
  makan: "Uang makan",
  transport: "Transport",
  sewa_pickup: "Sewa pickup",
  material: "Material tambahan",
  lain: "Lain-lain",
};

export type ExpenseRow = RecordModel & {
  date: string;
  category: string;
  amount: number;
  note?: string;
  receipt?: string;
  entered_by: string;
  expand?: { entered_by?: RecordModel & { name?: string; email: string } };
};

export function rupiah(n: number) {
  return "Rp " + Math.round(n || 0).toLocaleString("id-ID");
}

/**
 * Biaya proyek: form tambah (tanggal, kategori, nominal, keterangan, foto
 * nota opsional) + daftar biaya. Hapus hanya admin.
 */
export function ExpenseList({ projectId, canDelete = false }: { projectId: string; canDelete?: boolean }) {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState("makan");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    pb()
      .collection("project_expenses")
      .getFullList<ExpenseRow>({ filter: `project = "${projectId}"`, sort: "-date,-created", expand: "entered_by" })
      .then(setRows)
      .catch(() => setRows([]));
  }, [projectId]);

  useEffect(load, [load]);

  async function add() {
    const u = currentUser();
    if (!u) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setMsg("Nominal harus diisi.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const form = new FormData();
      form.append("project", projectId);
      form.append("date", `${date} 00:00:00`);
      form.append("category", category);
      form.append("amount", String(amt));
      form.append("note", note.trim());
      form.append("entered_by", u.id);
      const f = fileRef.current?.files?.[0];
      if (f) form.append("receipt", f);
      await pb().collection("project_expenses").create(form);
      setAmount("");
      setNote("");
      if (fileRef.current) fileRef.current.value = "";
      setMsg("Biaya tersimpan.");
      load();
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus biaya ini?")) return;
    try {
      await pb().collection("project_expenses").delete(id);
      load();
    } catch {
      alert("Gagal menghapus (perlu izin admin).");
    }
  }

  const total = (rows || []).reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold">Tambah biaya</p>
        <DatePickerId value={date} onChange={setDate} />
        <div className="grid grid-cols-1 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card">
            {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Nominal (Rp)"
          className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Keterangan (opsional)"
          className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card"
        />
        <label className="text-xs text-muted flex flex-col gap-1">
          Foto nota (opsional)
          <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-xs" />
        </label>
        <button
          onClick={add}
          disabled={saving}
          className="px-3 py-2.5 rounded-lg text-sm font-semibold bg-ink text-white disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : "Simpan biaya"}
        </button>
        {msg && <p className="text-xs text-subtle">{msg}</p>}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Daftar biaya</p>
        <p className="text-xs font-semibold">Total {rupiah(total)}</p>
      </div>
      {rows === null && <p className="text-xs text-muted">Memuat...</p>}
      {rows?.length === 0 && <p className="text-xs text-muted">Belum ada biaya tercatat.</p>}
      <ul className="flex flex-col gap-1.5">
        {rows?.map((r) => (
          <li key={r.id} className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="flex-1 min-w-0 text-xs">
              <span className="font-semibold">
                {EXPENSE_CATEGORY[r.category] || r.category} · {rupiah(r.amount)}
              </span>
              <span className="block text-faint">
                {formatTanggalId(r.date.slice(0, 10))}
                {r.note ? ` · ${r.note}` : ""}
                {r.expand?.entered_by ? ` · ${r.expand.entered_by.name || r.expand.entered_by.email}` : ""}
              </span>
            </span>
            {r.receipt && (
              <a href={fileUrl(r, r.receipt)} target="_blank" rel="noreferrer" className="text-xs text-accent underline shrink-0">
                Nota
              </a>
            )}
            {canDelete && (
              <button onClick={() => remove(r.id)} className="text-xs text-warn font-semibold px-2 py-1 shrink-0">
                Hapus
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
