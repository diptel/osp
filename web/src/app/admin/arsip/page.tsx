"use client";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & {
  code: string;
  name: string;
  region: string;
  cluster_name: string;
  cluster_id: string;
  status: string;
  archived_at?: string;
  cancel_reason?: string;
  expand?: { client?: RecordModel & { name: string } };
};

const STATUS_LABEL: Record<string, string> = {
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  lunas: "Lunas",
  ditahan: "Ditahan",
};

/**
 * Arsip proyek: proyek yang disembunyikan dari semua daftar (selesai/
 * dibatalkan). Bisa dipulihkan, dihapus satu-satu, atau dikosongkan semua.
 * Hapus = permanen beserta seluruh data turunannya (foto, uji OPM, aset,
 * laporan) — cascade di skema.
 */
export default function ArsipPage() {
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  function load() {
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ filter: "archived = true", expand: "client", sort: "-archived_at" })
      .then(setRows)
      .catch(() => setRows([]));
  }
  useEffect(load, []);

  async function restore(p: ProjectRow) {
    setBusy(p.id);
    try {
      await pb().collection("projects").update(p.id, { archived: false, archived_at: null });
      load();
    } finally {
      setBusy("");
    }
  }

  async function removeOne(p: ProjectRow) {
    const label = p.cluster_id || p.code || p.name;
    const typed = prompt(
      `HAPUS PERMANEN proyek "${p.cluster_name || p.name}" beserta semua foto, hasil uji, aset, dan laporannya?\n\nKetik kode proyek berikut untuk konfirmasi: ${label}`
    );
    if (typed !== label) {
      if (typed !== null) alert("Kode tidak cocok, dibatalkan.");
      return;
    }
    setBusy(p.id);
    try {
      await pb().collection("projects").delete(p.id);
      setMsg(`Proyek ${label} dihapus permanen.`);
      load();
    } catch (e) {
      setMsg("Gagal menghapus: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!rows || rows.length === 0) return;
    const typed = prompt(
      `KOSONGKAN ARSIP: ${rows.length} proyek akan DIHAPUS PERMANEN beserta semua foto, hasil uji, aset, dan laporannya. Tidak bisa dibatalkan.\n\nKetik HAPUS SEMUA untuk melanjutkan.`
    );
    if (typed !== "HAPUS SEMUA") {
      if (typed !== null) alert("Teks tidak cocok, dibatalkan.");
      return;
    }
    setBusy("all");
    let ok = 0;
    const failed: string[] = [];
    for (const p of rows) {
      try {
        await pb().collection("projects").delete(p.id);
        ok++;
      } catch {
        failed.push(p.cluster_id || p.code || p.name);
      }
    }
    setMsg(`${ok} proyek dihapus.${failed.length ? " Gagal: " + failed.join(", ") : ""}`);
    setBusy("");
    load();
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Arsip proyek</h1>
          <p className="text-sm text-muted">
            Proyek yang diarsipkan hilang dari dashboard dan app teknisi. Bisa dipulihkan kapan saja. Menghapus
            berarti permanen beserta seluruh datanya.
          </p>
        </div>
        {rows && rows.length > 0 && (
          <button
            onClick={removeAll}
            disabled={busy !== ""}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-warnbg text-warn border border-warn/30 shrink-0 disabled:opacity-50"
          >
            🗑 Kosongkan arsip ({rows.length})
          </button>
        )}
      </div>

      {msg && <p className="text-sm text-subtle">{msg}</p>}
      {rows === null && <p className="text-sm text-muted">Memuat...</p>}
      {rows?.length === 0 && <p className="text-sm text-muted">Arsip kosong.</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {rows?.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-muted">{p.cluster_id || p.code}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#EEF0F2] text-[#4A5059]">
                {STATUS_LABEL[p.status] || p.status}
              </span>
            </div>
            <h3 className="font-semibold leading-snug">{p.cluster_name || p.name}</h3>
            <p className="text-xs text-muted">
              {p.expand?.client?.name} · {p.region}
              {p.archived_at ? ` · diarsipkan ${new Date(p.archived_at).toLocaleDateString("id-ID")}` : ""}
            </p>
            {p.cancel_reason && <p className="text-xs text-warn">Alasan batal: {p.cancel_reason}</p>}
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => restore(p)}
                disabled={busy !== ""}
                className="text-xs text-accent underline disabled:opacity-50"
              >
                Pulihkan
              </button>
              <button
                onClick={() => removeOne(p)}
                disabled={busy !== ""}
                className="text-xs text-warn underline ml-auto disabled:opacity-50"
              >
                Hapus permanen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
