"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & {
  code: string;
  name: string;
  region: string;
  cluster_name: string;
  cluster_id: string;
  status: string;
  archived?: boolean;
  cancel_reason?: string;
  expand?: { client?: RecordModel & { name: string } };
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
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#EEF0F2] text-[#4A5059]",
  survei: "bg-[#E4ECF8] text-[#1E3F7A]",
  desain: "bg-[#E4ECF8] text-[#1E3F7A]",
  berjalan: "bg-okbg text-ok",
  rfs: "bg-okbg text-ok",
  atp: "bg-[#FCF1D6] text-[#8A5A00]",
  revisi_atp: "bg-warnbg text-warn",
  lunas: "bg-okbg text-ok",
  selesai: "bg-okbg text-ok",
  ditahan: "bg-warnbg text-warn",
  dibatalkan: "bg-[#EEF0F2] text-[#4A5059] line-through",
};
const STATUS_ORDER = ["draft", "survei", "desain", "berjalan", "rfs", "atp", "revisi_atp", "lunas", "selesai", "ditahan", "dibatalkan"];

export default function AdminDashboard() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState("");
  // Konfirmasi di dalam kartu (bukan confirm()/prompt() browser — Chrome bisa
  // membisukan dialog bawaan setelah beberapa kali, jadi klik seolah tidak
  // merespons sama sekali).
  const [ask, setAsk] = useState<{ id: string; kind: "arsip" | "batal"; reason: string } | null>(null);
  const [portal, setPortal] = useState<{ id: string; url: string; copied: boolean } | null>(null);

  function portalUrl(token: string) {
    return `${window.location.origin}/app/portal/${token}/`;
  }
  async function showPortal(id: string, reset = false) {
    setBusyId(id);
    try {
      const r = (await pb().send(`/api/briix/projects/${id}/portal-link${reset ? "/reset" : ""}`, { method: reset ? "POST" : "GET" })) as { token: string };
      setPortal({ id, url: portalUrl(r.token), copied: false });
    } catch (e) {
      setErr("Gagal mengambil link portal: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId("");
    }
  }
  async function copyPortal() {
    if (!portal) return;
    try {
      await navigator.clipboard.writeText(portal.url);
      setPortal({ ...portal, copied: true });
    } catch {
      /* fallback: user pilih manual dari input */
    }
  }

  function load() {
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ expand: "client", sort: "-created", filter: "archived != true" })
      .then(setProjects)
      .catch(() => setErr("Gagal memuat proyek."));
  }

  useEffect(load, []);

  async function changeStatus(id: string, status: string) {
    if (status === "dibatalkan") {
      setAsk({ id, kind: "batal", reason: "" });
      return;
    }
    setBusyId(id);
    setErr("");
    try {
      await pb().collection("projects").update(id, { status });
      load();
    } catch (e) {
      setErr("Gagal mengubah status: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId("");
    }
  }

  async function confirmAsk() {
    if (!ask) return;
    if (ask.kind === "batal" && !ask.reason.trim()) return;
    setBusyId(ask.id);
    setErr("");
    try {
      if (ask.kind === "batal") {
        await pb().collection("projects").update(ask.id, { status: "dibatalkan", cancel_reason: ask.reason.trim() });
      } else {
        await pb().collection("projects").update(ask.id, { archived: true, archived_at: new Date().toISOString() });
      }
      setAsk(null);
      load();
    } catch (e) {
      setErr(`Gagal ${ask.kind === "batal" ? "membatalkan" : "mengarsipkan"}: ` + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Dashboard proyek</h1>
        <p className="text-sm text-muted">Semua proyek FTTH BRIIX OSP, lintas klien.</p>
      </div>

      {err && <p className="text-sm text-warn">{err}</p>}
      {!projects && !err && <p className="text-sm text-muted">Memuat...</p>}
      {projects && projects.length === 0 && (
        <p className="text-sm text-muted">
          Belum ada proyek. Buat lewat{" "}
          <Link href="/admin/proyek-baru" className="text-accent underline">
            Proyek baru
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-muted">{p.cluster_id || p.code}</span>
              <select
                value={p.status}
                disabled={busyId === p.id}
                onChange={(e) => changeStatus(p.id, e.target.value)}
                className={`text-xs font-semibold px-2 py-0.5 rounded-md border-0 ${STATUS_COLOR[p.status] || ""}`}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <h3 className="font-semibold leading-snug">{p.cluster_name || p.name}</h3>
            <p className="text-xs text-muted">
              {p.expand?.client?.name} · {p.region}
            </p>
            {p.status === "dibatalkan" && p.cancel_reason && (
              <p className="text-xs text-warn">Dibatalkan: {p.cancel_reason}</p>
            )}
            {portal?.id === p.id && (
              <div className="bg-[#FAFAF8] border border-dashed border-line2 rounded-lg p-2.5 flex flex-col gap-2">
                <p className="text-xs font-semibold">Link portal klien (tanpa login — siapa pun yang punya link bisa melihat progres & mengunduh laporan)</p>
                <input readOnly value={portal.url} onFocus={(e) => e.target.select()} className="border border-border rounded-lg px-2 py-1.5 text-xs bg-card font-mono" />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={copyPortal} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-ink text-white">
                    {portal.copied ? "✓ Tersalin" : "Salin link"}
                  </button>
                  <a href={portal.url} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border">
                    Buka ↗
                  </a>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Progres proyek ${p.cluster_name || p.name}: ${portal.url}`)}`} target="_blank" rel="noreferrer" className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border">
                    Kirim via WA
                  </a>
                  <button onClick={() => showPortal(p.id, true)} className="text-xs text-warn underline ml-auto" title="Link lama tidak berlaku lagi">
                    Ganti link
                  </button>
                  <button onClick={() => setPortal(null)} className="text-xs text-subtle">
                    Tutup
                  </button>
                </div>
              </div>
            )}
            {ask?.id === p.id && (
              <div className="bg-[#FAFAF8] border border-dashed border-line2 rounded-lg p-2.5 flex flex-col gap-2">
                {ask.kind === "batal" ? (
                  <>
                    <p className="text-xs font-semibold">Batalkan proyek ini? Isi alasannya:</p>
                    <input
                      autoFocus
                      value={ask.reason}
                      onChange={(e) => setAsk({ ...ask, reason: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && confirmAsk()}
                      placeholder="Alasan pembatalan (wajib)"
                      className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card"
                    />
                  </>
                ) : (
                  <p className="text-xs font-semibold">Arsipkan proyek ini? Proyek hilang dari daftar (bisa dipulihkan di halaman Arsip).</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={confirmAsk}
                    disabled={busyId === p.id || (ask.kind === "batal" && !ask.reason.trim())}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-ink text-white disabled:opacity-50"
                  >
                    {busyId === p.id ? "Menyimpan..." : ask.kind === "batal" ? "Ya, batalkan proyek" : "Ya, arsipkan"}
                  </button>
                  <button onClick={() => setAsk(null)} className="text-xs text-subtle px-2 py-1.5">
                    Tidak
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3 mt-1">
              <Link href={`/admin/proyek/${p.id}/kmz`} className="text-xs text-accent underline">
                Impor KMZ
              </Link>
              <Link href={`/admin/proyek/${p.id}/odp-finish`} className="text-xs text-accent underline">
                Finish RFS
              </Link>
              <Link href={`/admin/proyek/${p.id}/laporan`} className="text-xs text-accent underline">
                Laporan
              </Link>
              <Link href={`/admin/proyek/${p.id}/paket`} className="text-xs text-accent underline">
                Paket &amp; pengaturan
              </Link>
              <Link href={`/admin/proyek/${p.id}/manajemen`} className="text-xs text-accent underline">
                Manajemen
              </Link>
              <button onClick={() => showPortal(p.id)} disabled={busyId === p.id} className="text-xs text-accent underline disabled:opacity-50">
                Link portal klien
              </button>
              {(p.status === "selesai" || p.status === "dibatalkan") && (
                <button
                  onClick={() => setAsk({ id: p.id, kind: "arsip", reason: "" })}
                  disabled={busyId === p.id}
                  className="text-xs text-subtle underline ml-auto disabled:opacity-50"
                >
                  Arsipkan
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
