"use client";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { buildOpmReportPdf, fetchOpmReportData } from "@/lib/opmReportPdf";
import { OdpFinishPhotos } from "@/components/OdpFinishPhotos";
import type { RecordModel } from "pocketbase";

type OpmRow = RecordModel & {
  port_fat: number;
  opm_dbm: number;
  status: string;
  project: string;
  expand?: {
    fat?: RecordModel & { code: string; line: string };
    project?: RecordModel & { cluster_name: string; cluster_id: string };
  };
};

type ProjectRow = RecordModel & { cluster_name: string; cluster_id: string };

export default function LaporanOpmPage() {
  const [rows, setRows] = useState<OpmRow[] | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectRow[] | null>(null);
  const [downloadingId, setDownloadingId] = useState("");

  useEffect(() => {
    pb()
      .collection("opm_tests")
      .getFullList<OpmRow>({ filter: 'status = "approved"', expand: "fat,project", sort: "-created" })
      .then(setRows)
      .catch(() => setRows([]));
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ sort: "-created" })
      .then(setAllProjects)
      .catch(() => setAllProjects([]));
  }, []);

  const projects = useMemo(() => {
    const m = new Map<string, { id: string; cluster_name: string; cluster_id: string; count: number }>();
    for (const r of rows || []) {
      if (!r.expand?.project) continue;
      const p = r.expand.project;
      if (!m.has(r.project)) m.set(r.project, { id: r.project, cluster_name: p.cluster_name, cluster_id: p.cluster_id, count: 0 });
      m.get(r.project)!.count++;
    }
    return Array.from(m.values());
  }, [rows]);

  async function downloadPdf(projectId: string, clusterName: string) {
    setDownloadingId(projectId);
    try {
      const data = await fetchOpmReportData(projectId);
      const doc = await buildOpmReportPdf({ project: data.project, fats: data.fats, briixLogoUrl: "/app/mark.svg", clientLogoUrl: data.clientLogoUrl });
      doc.save(`Laporan-OPM-${clusterName || projectId}.pdf`);
    } catch (e) {
      alert("Gagal membuat PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloadingId("");
    }
  }

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Laporan OPM</h1>
        <p className="text-sm text-muted">Hasil uji OPM per port FAT yang sudah disetujui QC.</p>
      </div>

      {projects.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              disabled={downloadingId === p.id}
              onClick={() => downloadPdf(p.id, p.cluster_name)}
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-ink text-white disabled:opacity-50"
            >
              {downloadingId === p.id ? "Membuat PDF..." : `Unduh PDF · ${p.cluster_name} (${p.count} port)`}
            </button>
          ))}
        </div>
      )}

      {allProjects && allProjects.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Foto ODP Finish — syarat tambahan setelah RFS</h2>
          {allProjects.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-subtle">{p.cluster_name}</p>
              <OdpFinishPhotos projectId={p.id} allowPaste canDelete />
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F6F3] text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2">Proyek</th>
              <th className="text-left px-3 py-2">FAT</th>
              <th className="text-left px-3 py-2">Line</th>
              <th className="text-left px-3 py-2">Port</th>
              <th className="text-left px-3 py-2">dBm</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.expand?.project?.cluster_name}</td>
                <td className="px-3 py-2 font-mono">{r.expand?.fat?.code}</td>
                <td className="px-3 py-2">{r.expand?.fat?.line}</td>
                <td className="px-3 py-2">{r.port_fat}</td>
                <td className="px-3 py-2 font-mono">{r.opm_dbm}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows !== null && rows.length === 0 && (
          <p className="p-4 text-sm text-muted">Belum ada data yang disetujui.</p>
        )}
        {rows === null && <p className="p-4 text-sm text-muted">Memuat...</p>}
      </div>
    </div>
  );
}
