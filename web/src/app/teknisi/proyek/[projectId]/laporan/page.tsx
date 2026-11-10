"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { ReportList } from "@/components/ReportList";
import type { RecordModel } from "pocketbase";

type Project = RecordModel & { cluster_name: string; cluster_id: string };

export default function LaporanPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<"opm" | "rfs" | "atp_form">("opm");

  useEffect(() => {
    pb().collection("projects").getOne<Project>(String(projectId)).then(setProject).catch(() => void 0);
  }, [projectId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-ink text-white px-3 pt-3.5 pb-4 flex items-start gap-2 shrink-0">
        <Link href={`/teknisi/proyek/${projectId}`} className="w-11 h-11 flex items-center justify-center -ml-2 -mt-1 shrink-0 text-white">
          ←
        </Link>
        <div className="min-w-0">
          <p className="text-xs text-line2">{project?.cluster_id}</p>
          <h1 className="font-semibold leading-tight">Laporan — {project?.cluster_name || "Memuat..."}</h1>
          <p className="text-xs text-line2 mt-0.5">Laporan yang sudah dibuat admin — minta admin kalau butuh laporan baru.</p>
        </div>
      </header>
      <div className="flex gap-2 px-4 pt-3 shrink-0">
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
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {tab === "rfs" ? (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Rekap Finish FAT</h2>
              <p className="text-xs text-muted">Foto FAT yang sudah selesai & semua port-nya terverifikasi, 4 FAT per halaman.</p>
              <ReportList projectId={String(projectId)} kind="fat_finish" canGenerate={false} />
            </section>
            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <h2 className="text-sm font-semibold">Rekap Finish FDT</h2>
              <p className="text-xs text-muted">Foto core feeder masuk FDT, foto akhir FDT luar + layar OPM 1 port, dengan stempel GPS.</p>
              <ReportList projectId={String(projectId)} kind="fdt_finish" canGenerate={false} />
            </section>
          </div>
        ) : (
          <ReportList projectId={String(projectId)} kind={tab} canGenerate={false} />
        )}
      </div>
    </div>
  );
}
