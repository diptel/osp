"use client";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type OpmRow = RecordModel & {
  port_fat: number;
  opm_dbm: number;
  status: string;
  expand?: { fat?: RecordModel & { code: string; line: string }; project?: RecordModel & { cluster_name: string } };
};

export default function LaporanOpmPage() {
  const [rows, setRows] = useState<OpmRow[] | null>(null);

  useEffect(() => {
    pb()
      .collection("opm_tests")
      .getFullList<OpmRow>({ filter: 'status = "approved"', expand: "fat,project", sort: "-created" })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Laporan OPM</h1>
        <p className="text-sm text-muted">Hasil uji OPM per port FAT yang sudah disetujui QC.</p>
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
      <p className="text-xs text-faint">Ekspor PDF rekap per FDT menyusul (format sama seperti laporan OPM manual).</p>
    </div>
  );
}
