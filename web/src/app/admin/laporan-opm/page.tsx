"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
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
  const [fatCounts, setFatCounts] = useState<Map<string, number>>(new Map());

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
    pb()
      .collection("assets")
      .getFullList<RecordModel & { project: string; ports?: number }>({ filter: 'kind = "fat"' })
      .then((assets) => {
        const m = new Map<string, number>();
        for (const a of assets) m.set(a.project, (m.get(a.project) || 0) + (a.ports || 8));
        setFatCounts(m);
      })
      .catch(() => void 0);
  }, []);

  // port yang approved per proyek
  const approvedByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows || []) m.set(r.project, (m.get(r.project) || 0) + 1);
    return m;
  }, [rows]);

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Laporan OPM</h1>
        <p className="text-sm text-muted">Hasil uji OPM per port FAT yang sudah disetujui QC.</p>
      </div>

      <div className="flex flex-col gap-2">
        {allProjects === null && <p className="text-sm text-muted">Memuat daftar proyek...</p>}
        {allProjects?.length === 0 && <p className="text-sm text-muted">Belum ada proyek.</p>}
        {allProjects?.map((p) => {
          const approved = approvedByProject.get(p.id) || 0;
          const total = fatCounts.get(p.id) || 0;
          return (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{p.cluster_name}</p>
                <p className="text-xs text-muted font-mono">
                  {p.cluster_id} · {approved}/{total || "?"} port terverifikasi
                </p>
              </div>
              <Link href={`/admin/proyek/${p.id}/laporan`} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-white">
                Laporan
              </Link>
              <Link
                href={`/admin/proyek/${p.id}/odp-finish`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-card"
              >
                Finish FAT
              </Link>
            </div>
          );
        })}
      </div>

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
