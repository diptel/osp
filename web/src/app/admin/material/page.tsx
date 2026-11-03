"use client";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type MaterialRow = RecordModel & {
  name: string;
  unit?: string;
  need_qty?: number;
  source?: string;
  expand?: { project?: RecordModel & { cluster_name: string } };
};

export default function MaterialPage() {
  const [rows, setRows] = useState<MaterialRow[] | null>(null);

  useEffect(() => {
    pb()
      .collection("materials")
      .getFullList<MaterialRow>({ expand: "project", sort: "project,name" })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Material</h1>
        <p className="text-sm text-muted">Kebutuhan material per proyek (dari impor KMZ atau input manual).</p>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F5F6F3] text-xs text-muted">
            <tr>
              <th className="text-left px-3 py-2">Proyek</th>
              <th className="text-left px-3 py-2">Material</th>
              <th className="text-left px-3 py-2">Kebutuhan</th>
              <th className="text-left px-3 py-2">Sumber</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2">{r.expand?.project?.cluster_name}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">
                  {r.need_qty ?? "—"} {r.unit}
                </td>
                <td className="px-3 py-2">{r.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows !== null && rows.length === 0 && <p className="p-4 text-sm text-muted">Belum ada data material.</p>}
        {rows === null && <p className="p-4 text-sm text-muted">Memuat...</p>}
      </div>
    </div>
  );
}
