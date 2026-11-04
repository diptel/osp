"use client";
import { useCallback, useEffect, useState } from "react";
import { pb, currentUser } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

export type Worker = RecordModel & {
  name: string;
  employment: "bulanan" | "freelance";
  daily_rate?: number;
  overtime_rate?: number;
  active?: boolean;
};
type AttendanceRow = RecordModel & { worker: string; date: string; present: boolean; overtime: number; note?: string };

function todayIso() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/**
 * Absensi harian satu proyek: pilih tanggal, centang pekerja yang hadir,
 * isi jumlah lembur (per kejadian). Simpan = upsert per pekerja per tanggal.
 * Dipakai di app teknisi (surveyor) dan halaman admin.
 */
export function AttendanceForm({ projectId }: { projectId: string }) {
  const [date, setDate] = useState(todayIso());
  const [workers, setWorkers] = useState<Worker[] | null>(null);
  const [rows, setRows] = useState<Map<string, AttendanceRow>>(new Map());
  const [draft, setDraft] = useState<Map<string, { present: boolean; overtime: number }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"bulanan" | "freelance">("freelance");

  const loadWorkers = useCallback(() => {
    pb()
      .collection("workers")
      .getFullList<Worker>({ filter: "active = true", sort: "name" })
      .then(setWorkers)
      .catch(() => setWorkers([]));
  }, []);

  const loadDay = useCallback(() => {
    pb()
      .collection("attendance")
      .getFullList<AttendanceRow>({
        filter: `project = "${projectId}" && date >= "${date} 00:00:00" && date <= "${date} 23:59:59"`,
      })
      .then((list) => {
        const m = new Map<string, AttendanceRow>();
        const d = new Map<string, { present: boolean; overtime: number }>();
        for (const r of list) {
          m.set(r.worker, r);
          d.set(r.worker, { present: !!r.present, overtime: r.overtime || 0 });
        }
        setRows(m);
        setDraft(d);
      })
      .catch(() => void 0);
  }, [projectId, date]);

  useEffect(loadWorkers, [loadWorkers]);
  useEffect(loadDay, [loadDay]);

  function setPresent(wid: string, present: boolean) {
    setDraft((d) => {
      const n = new Map(d);
      const cur = n.get(wid) || { present: false, overtime: 0 };
      n.set(wid, { ...cur, present });
      return n;
    });
  }
  function setOvertime(wid: string, overtime: number) {
    setDraft((d) => {
      const n = new Map(d);
      const cur = n.get(wid) || { present: false, overtime: 0 };
      n.set(wid, { ...cur, overtime: Math.max(0, Math.floor(overtime || 0)) });
      return n;
    });
  }

  async function save() {
    const u = currentUser();
    if (!u) return;
    setSaving(true);
    setMsg("");
    try {
      let n = 0;
      for (const w of workers || []) {
        const d = draft.get(w.id);
        const existing = rows.get(w.id);
        if (!d) continue;
        const payload = {
          project: projectId,
          worker: w.id,
          date: `${date} 00:00:00`,
          present: d.present,
          overtime: d.present ? d.overtime : 0,
          entered_by: u.id,
        };
        if (existing) {
          if (existing.present !== payload.present || (existing.overtime || 0) !== payload.overtime) {
            await pb().collection("attendance").update(existing.id, { present: payload.present, overtime: payload.overtime });
            n++;
          }
        } else if (d.present) {
          await pb().collection("attendance").create(payload);
          n++;
        }
      }
      setMsg(n ? `Tersimpan (${n} pekerja).` : "Tidak ada perubahan.");
      loadDay();
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function addWorker() {
    const name = newName.trim();
    if (!name) return;
    try {
      await pb().collection("workers").create({ name, employment: newType, active: true });
      setNewName("");
      loadWorkers();
    } catch (e) {
      setMsg("Gagal menambah pekerja: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const hadir = (workers || []).filter((w) => draft.get(w.id)?.present).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted">Tanggal</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card"
        />
        <span className="text-xs text-muted ml-auto">{hadir} hadir</span>
      </div>

      {workers === null && <p className="text-xs text-muted">Memuat pekerja...</p>}
      {workers?.length === 0 && <p className="text-xs text-muted">Belum ada pekerja. Tambahkan di bawah.</p>}

      <ul className="flex flex-col gap-1.5">
        {workers?.map((w) => {
          const d = draft.get(w.id) || { present: false, overtime: 0 };
          return (
            <li key={w.id} className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-3">
              <label className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={d.present}
                  onChange={(e) => setPresent(w.id, e.target.checked)}
                  className="w-5 h-5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{w.name}</span>
                  <span className="block text-[11px] text-faint">{w.employment === "bulanan" ? "Bulanan" : "Freelance"}</span>
                </span>
              </label>
              <label className="flex items-center gap-1 text-xs text-muted shrink-0">
                Lembur
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={d.overtime}
                  disabled={!d.present}
                  onChange={(e) => setOvertime(w.id, Number(e.target.value))}
                  className="w-14 border border-border rounded-md px-1.5 py-1 text-sm text-center bg-card disabled:opacity-40"
                />
                ×
              </label>
            </li>
          );
        })}
      </ul>

      <button
        onClick={save}
        disabled={saving || !workers || workers.length === 0}
        className="px-3 py-2.5 rounded-lg text-sm font-semibold bg-ink text-white disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Simpan absensi"}
      </button>
      {msg && <p className="text-xs text-subtle">{msg}</p>}

      <details className="mt-2">
        <summary className="text-xs text-accent cursor-pointer">+ Tambah pekerja baru</summary>
        <div className="flex flex-col gap-2 mt-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nama pekerja"
            className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card"
          />
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "bulanan" | "freelance")}
              className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card flex-1"
            >
              <option value="freelance">Freelance</option>
              <option value="bulanan">Pegawai bulanan</option>
            </select>
            <button onClick={addWorker} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-white">
              Tambah
            </button>
          </div>
          <p className="text-[11px] text-faint">Tarif per hari & lembur diatur admin di menu Pekerja.</p>
        </div>
      </details>
    </div>
  );
}
