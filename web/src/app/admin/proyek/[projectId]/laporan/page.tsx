"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { ReportList } from "@/components/ReportList";
import type { RecordModel } from "pocketbase";

type Project = RecordModel & { cluster_name: string; cluster_id: string };

export default function AdminLaporanPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<"opm" | "rfs" | "atp_form">("opm");

  useEffect(() => {
    pb().collection("projects").getOne<Project>(String(projectId)).then(setProject).catch(() => void 0);
  }, [projectId]);

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted font-mono">{project?.cluster_id}</p>
        <h1 className="text-xl font-semibold">Laporan — {project?.cluster_name || "Memuat..."}</h1>
        <p className="text-sm text-muted">Laporan tersimpan per proyek — generate baru kalau data sudah berubah.</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setTab("opm")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            tab === "opm" ? "bg-ink text-white border-ink" : "border-border text-subtle"
          }`}
        >
          Laporan OPM
        </button>
        <button
          onClick={() => setTab("rfs")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            tab === "rfs" ? "bg-ink text-white border-ink" : "border-border text-subtle"
          }`}
        >
          Laporan RFS
        </button>
        <button
          onClick={() => setTab("atp_form")}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            tab === "atp_form" ? "bg-ink text-white border-ink" : "border-border text-subtle"
          }`}
        >
          Form ATP
        </button>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        {tab === "rfs" ? (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Rekap Finish FAT</h2>
              <p className="text-xs text-muted">Foto FAT yang sudah selesai & semua port-nya terverifikasi, 4 FAT per halaman.</p>
              <ReportList projectId={String(projectId)} kind="fat_finish" canDelete />
            </section>
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <h2 className="text-sm font-semibold">Rekap Finish FDT</h2>
              <p className="text-xs text-muted">Foto core feeder masuk FDT, foto akhir FDT luar + layar OPM 1 port, dengan stempel GPS.</p>
              <ReportList projectId={String(projectId)} kind="fdt_finish" canDelete />
            </section>
          </div>
        ) : (
          <ReportList projectId={String(projectId)} kind={tab} canDelete />
        )}
      </div>
    </div>
  );
}
