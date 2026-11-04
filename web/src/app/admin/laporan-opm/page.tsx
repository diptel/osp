"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [rows, setRows] = useState<OpmRow[] | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectRow[] | null>(null);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    pb()
      .collection("opm_tests")
      .getFullList<OpmRow>({ filter: 'status = "approved"', expand: "fat,project", sort: "-created" })
      .then(setRows)
      .catch(() => setRows([]));
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ sort: "-created" })
      .then((rows) => {
        setAllProjects(rows);
        if (rows.length) setSelected((s) => s || rows[0].id);
      })
      .catch(() => setAllProjects([]));
  }, []);

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Laporan OPM</h1>
        <p className="text-sm text-muted">Hasil uji OPM per port FAT yang sudah disetujui QC.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center bg-card border border-border rounded-xl p-3">
        <label className="text-xs font-semibold text-subtle">Pilih proyek</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 min-w-[180px] px-2.5 py-2 rounded-lg border border-line2 text-sm bg-white"
        >
          {allProjects === null && <option>Memuat...</option>}
          {allProjects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.cluster_name} ({p.cluster_id})
            </option>
          ))}
        </select>
        <button
          disabled={!selected}
          onClick={() => router.push(`/admin/proyek/${selected}/laporan`)}
          className="px-3 py-2 rounded-lg text-sm font-semibold bg-ink text-white disabled:opacity-50"
        >
          Buka Laporan
        </button>
        <button
          disabled={!selected}
          onClick={() => router.push(`/admin/proyek/${selected}/odp-finish`)}
          className="px-3 py-2 rounded-lg text-sm font-semibold border border-border bg-card disabled:opacity-50"
        >
          Foto Finish FAT
        </button>
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
