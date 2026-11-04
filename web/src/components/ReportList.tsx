"use client";
import { useEffect, useState } from "react";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import {
  buildOpmReportPdf,
  fetchOpmReportData,
  buildFatFinishReportPdf,
  fetchFatFinishReportData,
  ReportCancelled,
} from "@/lib/opmReportPdf";
import { jobKey, getJob, isGenerating, isCancelled, startJob, cancelJob, finishJob, subscribe } from "@/lib/reportJobs";
import type { RecordModel } from "pocketbase";

type ReportRow = RecordModel & { file: string; label?: string; created: string; kind?: string };

const KIND_LABEL: Record<string, string> = {
  opm: "Laporan OPM",
  fat_finish: "Rekap Finish FAT",
};

/**
 * Daftar laporan PDF yang TERSIMPAN per proyek — generate sekali, bisa
 * diunduh berkali-kali tanpa generate ulang. Kalau data berubah dan butuh
 * laporan terbaru, generate lagi (nambah entri baru, bukan menimpa).
 */
export function ReportList({
  projectId,
  kind = "opm",
  canDelete = false,
  canGenerate = true,
}: {
  projectId: string;
  kind?: "opm" | "fat_finish";
  canDelete?: boolean;
  canGenerate?: boolean;
}) {
  const key = jobKey(projectId, kind);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [generating, setGenerating] = useState(() => isGenerating(key));
  const [err, setErr] = useState("");
  // Server cuma izinkan role admin yang generate laporan (bukan qc/drafter
  // lain yang juga bisa buka halaman admin) — cocokkan tombolnya di sini
  // juga, supaya staf non-admin tidak kena error generik "Failed to create
  // record" saat klik generate.
  const isAdmin = currentUser()?.role === "admin";
  const allowedToGenerate = canGenerate && isAdmin;

  function load() {
    const kindFilter = kind === "opm" ? '(kind = "opm" || kind = "")' : 'kind = "fat_finish"';
    pb()
      .collection("reports")
      .getFullList<ReportRow>({ filter: `project = "${projectId}" && ${kindFilter}`, sort: "-created" })
      .then(setReports)
      .catch(() => setReports([]));
  }

  useEffect(load, [projectId, kind]);

  // Ikuti status job yang tersimpan di registry level-modul — supaya kalau
  // komponen ini remount (pindah halaman lalu balik lagi), status "masih
  // diproses" ATAU error terakhir tetap kelihatan, bukan hilang/mulai dari nol.
  useEffect(() => {
    function sync() {
      setGenerating(isGenerating(key));
      const job = getJob(key);
      if (job && !job.generating && job.error) setErr(job.error);
    }
    sync();
    return subscribe(key, sync);
  }, [key]);

  function generate() {
    if (isGenerating(key)) return; // sudah ada proses berjalan, jangan dobel
    // Sengaja tidak di-await di sini — proses jalan di belakang layar (promise
    // tetap lanjut walau Anda pindah halaman di app ini), tidak perlu menunggu
    // di halaman ini. Hanya berhenti kalau tab/app benar-benar ditutup.
    setErr("");
    startJob(key);
    (async () => {
      try {
        const u = currentUser();
        const stamp = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
        let blob: Blob;
        let label: string;
        let clusterName = "";
        const checkCancelled = () => isCancelled(key);

        if (kind === "fat_finish") {
          const data = await fetchFatFinishReportData(projectId);
          if (checkCancelled()) throw new ReportCancelled();
          if (data.entries.length === 0) {
            setErr("Belum ada foto Finish FAT yang diunggah untuk direkap.");
            finishJob(key);
            return;
          }
          const doc = await buildFatFinishReportPdf({
            project: data.project,
            entries: data.entries,
            clientLogoUrl: data.clientLogoUrl,
            isCancelled: checkCancelled,
          });
          blob = doc.output("blob");
          label = `Rekap Finish FAT — ${stamp}`;
          clusterName = data.clusterName;
        } else {
          const data = await fetchOpmReportData(projectId);
          if (checkCancelled()) throw new ReportCancelled();
          if (data.fats.length === 0) {
            setErr("Belum ada hasil uji OPM yang disetujui untuk dilaporkan.");
            finishJob(key);
            return;
          }
          const doc = await buildOpmReportPdf({
            project: data.project,
            fats: data.fats,
            clientLogoUrl: data.clientLogoUrl,
            isCancelled: checkCancelled,
          });
          blob = doc.output("blob");
          label = `Laporan OPM — ${stamp}`;
          clusterName = data.clusterName;
        }

        if (checkCancelled()) throw new ReportCancelled();

        const form = new FormData();
        form.append("project", projectId);
        form.append("kind", kind);
        form.append("label", label);
        form.append("file", blob, `${KIND_LABEL[kind]}-${clusterName || projectId}-${Date.now()}.pdf`);
        form.append("generated_by", u?.id || "");
        await pb().collection("reports").create(form);
        load();
        finishJob(key);
      } catch (e) {
        if (e instanceof ReportCancelled) {
          finishJob(key);
          return;
        }
        const msg = "Gagal membuat laporan: " + (e instanceof Error ? e.message : String(e));
        setErr(msg);
        finishJob(key, msg);
      }
    })();
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus laporan ini?")) return;
    try {
      await pb().collection("reports").delete(id);
      load();
    } catch {
      alert("Gagal menghapus (perlu izin admin).");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {allowedToGenerate && (
        <button
          onClick={generate}
          disabled={generating}
          className="self-start px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50"
        >
          {generating ? "Sedang diproses..." : "+ Generate laporan baru"}
        </button>
      )}
      {canGenerate && !isAdmin && (
        <p className="text-xs text-faint">Hanya akun admin yang bisa generate laporan baru.</p>
      )}
      {err && <p className="text-xs text-warn">{err}</p>}
      {reports === null && <p className="text-xs text-muted">Memuat...</p>}
      {reports?.length === 0 && !generating && <p className="text-xs text-muted">Belum ada laporan tersimpan.</p>}
      {(generating || (reports && reports.length > 0)) && (
        <ul className="flex flex-col gap-1.5">
          {generating && (
            <li className="bg-[#FAFAF8] border border-dashed border-line2 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 text-xs text-subtle">
                <span className="font-semibold">⏳ Sedang membuat {KIND_LABEL[kind]}...</span>
                <span className="block text-faint">
                  Prosesnya jalan di tab browser ini. Boleh pindah halaman di aplikasi, tapi jangan reload / tutup tab atau browser sampai selesai — kalau di-reload atau ditutup, prosesnya langsung berhenti tanpa jejak.
                </span>
              </span>
              <button
                onClick={() => cancelJob(key)}
                className="text-xs text-warn font-semibold px-2 py-1 shrink-0"
                title="Batalkan"
              >
                ✕ Batalkan
              </button>
            </li>
          )}
          {reports?.map((r) => (
            <li key={r.id} className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 text-xs">
                <a href={fileUrl(r, r.file)} target="_blank" rel="noreferrer" className="text-accent underline font-semibold">
                  {r.label || KIND_LABEL[kind]}
                </a>
                <span className="block text-faint">{new Date(r.created).toLocaleString("id-ID")}</span>
              </span>
              {canDelete && (
                <button onClick={() => onDelete(r.id)} className="text-xs text-warn font-semibold px-2 py-1">
                  Hapus
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
