"use client";
import { useEffect, useState } from "react";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import { buildOpmReportPdf, fetchOpmReportData } from "@/lib/opmReportPdf";
import type { RecordModel } from "pocketbase";

type ReportRow = RecordModel & { file: string; label?: string; created: string };

/**
 * Daftar laporan PDF yang TERSIMPAN per proyek — generate sekali, bisa
 * diunduh berkali-kali tanpa generate ulang. Kalau data berubah dan butuh
 * laporan terbaru, generate lagi (nambah entri baru, bukan menimpa).
 */
export function ReportList({
  projectId,
  clusterName,
  canDelete = false,
  canGenerate = true,
}: {
  projectId: string;
  clusterName?: string;
  canDelete?: boolean;
  canGenerate?: boolean;
}) {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    pb()
      .collection("reports")
      .getFullList<ReportRow>({ filter: `project = "${projectId}"`, sort: "-created" })
      .then(setReports)
      .catch(() => setReports([]));
  }

  useEffect(load, [projectId]);

  function generate() {
    // Sengaja tidak di-await di sini — proses jalan di belakang layar (promise
    // tetap lanjut walau Anda pindah halaman di app ini), tidak perlu menunggu
    // di halaman ini. Hanya berhenti kalau tab/app benar-benar ditutup.
    setErr("");
    setGenerating(true);
    (async () => {
      try {
        const data = await fetchOpmReportData(projectId);
        if (data.fats.length === 0) {
          setErr("Belum ada hasil uji OPM yang disetujui untuk dilaporkan.");
          return;
        }
        const doc = await buildOpmReportPdf({ project: data.project, fats: data.fats, clientLogoUrl: data.clientLogoUrl });
        const blob = doc.output("blob");
        const u = currentUser();
        const stamp = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
        const form = new FormData();
        form.append("project", projectId);
        form.append("label", `Laporan OPM — ${stamp}`);
        form.append("file", blob, `Laporan-OPM-${data.clusterName || projectId}-${Date.now()}.pdf`);
        form.append("generated_by", u?.id || "");
        await pb().collection("reports").create(form);
        load();
      } catch (e) {
        setErr("Gagal membuat laporan: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        setGenerating(false);
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
      {canGenerate && (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={generate}
            disabled={generating}
            className="self-start px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50"
          >
            {generating ? "Memproses..." : "+ Generate laporan baru"}
          </button>
          {generating && (
            <p className="text-[11px] text-muted">
              Diproses di belakang layar — boleh pindah halaman, nanti muncul otomatis di daftar bawah kalau sudah
              selesai. (Berhenti kalau tab/app ditutup.)
            </p>
          )}
        </div>
      )}
      {err && <p className="text-xs text-warn">{err}</p>}
      {reports === null && <p className="text-xs text-muted">Memuat...</p>}
      {reports?.length === 0 && <p className="text-xs text-muted">Belum ada laporan tersimpan.</p>}
      {reports && reports.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {reports.map((r) => (
            <li key={r.id} className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 text-xs">
                <a href={fileUrl(r, r.file)} target="_blank" rel="noreferrer" className="text-accent underline font-semibold">
                  {r.label || "Laporan OPM"}
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
