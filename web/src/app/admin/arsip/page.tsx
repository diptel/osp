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
  // Konfirmasi ketik kode di dalam halaman (bukan prompt() browser yang bisa
  // dibisukan Chrome setelah beberapa dialog).
  const [ask, setAsk] = useState<{ id: string; typed: string } | null>(null);

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
    setMsg("");
    try {
      await pb().collection("projects").update(p.id, { archived: false, archived_at: null });
      setMsg(`Proyek ${p.cluster_id || p.code || p.name} dipulihkan ke dashboard.`);
      load();
    } catch (e) {
      setMsg("Gagal memulihkan: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  const codeOf = (p: ProjectRow) => p.cluster_id || p.code || p.name;

  async function removeOne(p: ProjectRow) {
    setBusy(p.id);
    setMsg("");
    try {
      await pb().collection("projects").delete(p.id);
      setMsg(`Proyek ${codeOf(p)} dihapus permanen.`);
      setAsk(null);
      load();
    } catch (e) {
      setMsg("Gagal menghapus: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy("");
    }
  }

  async function removeAll() {
    if (!rows || rows.length === 0) return;
    setBusy("all");
    setMsg("");
    let ok = 0;
    const failed: string[] = [];
    for (const p of rows) {
      try {
        await pb().collection("projects").delete(p.id);
        ok++;
      } catch {
        failed.push(codeOf(p));
      }
    }
    setMsg(`${ok} proyek dihapus permanen.${failed.length ? " Gagal: " + failed.join(", ") : ""}`);
    setAsk(null);
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
            onClick={() => setAsk({ id: "all", typed: "" })}
            disabled={busy !== ""}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-warnbg text-warn border border-warn/30 shrink-0 disabled:opacity-50"
          >
            🗑 Kosongkan arsip ({rows.length})
          </button>
        )}
      </div>

      {ask?.id === "all" && rows && (
        <div className="bg-warnbg border border-warn/30 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-warn">
            KOSONGKAN ARSIP: {rows.length} proyek akan DIHAPUS PERMANEN beserta semua foto, hasil uji, aset, laporan,
            absensi, dan biayanya. Tidak bisa dibatalkan.
          </p>
          <p className="text-xs text-subtle">Ketik <b>HAPUS SEMUA</b> untuk melanjutkan.</p>
          <div className="flex gap-2 flex-wrap">
            <input
              autoFocus
              value={ask.typed}
              onChange={(e) => setAsk({ ...ask, typed: e.target.value })}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
              placeholder="HAPUS SEMUA"
            />
            <button
              onClick={removeAll}
              disabled={busy !== "" || ask.typed !== "HAPUS SEMUA"}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-warn text-white disabled:opacity-40"
            >
              {busy === "all" ? "Menghapus..." : "Hapus semua permanen"}
            </button>
            <button onClick={() => setAsk(null)} className="text-xs text-subtle px-2 py-2">
              Batal
            </button>
          </div>
        </div>
      )}

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
                onClick={() => setAsk({ id: p.id, typed: "" })}
                disabled={busy !== ""}
                className="text-xs text-warn underline ml-auto disabled:opacity-50"
              >
                Hapus permanen
              </button>
            </div>
            {ask?.id === p.id && (
              <div className="bg-warnbg border border-warn/30 rounded-lg p-2.5 flex flex-col gap-2">
                <p className="text-xs font-semibold text-warn">
                  Hapus permanen beserta semua foto, hasil uji, aset, laporan, absensi, biaya? Ketik kode proyek:{" "}
                  <b>{codeOf(p)}</b>
                </p>
                <input
                  autoFocus
                  value={ask.typed}
                  onChange={(e) => setAsk({ ...ask, typed: e.target.value })}
                  className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card"
                  placeholder={codeOf(p)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => removeOne(p)}
                    disabled={busy !== "" || ask.typed.trim() !== codeOf(p)}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-warn text-white disabled:opacity-40"
                  >
                    {busy === p.id ? "Menghapus..." : "Hapus permanen"}
                  </button>
                  <button onClick={() => setAsk(null)} className="text-xs text-subtle px-2 py-1.5">
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
