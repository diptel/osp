"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { ReportList } from "@/components/ReportList";
import type { RecordModel } from "pocketbase";

type Project = RecordModel & { cluster_name: string; cluster_id: string };

export default function LaporanPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    pb().collection("projects").getOne<Project>(String(projectId)).then(setProject).catch(() => void 0);
  }, [projectId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-ink text-white px-4 pt-4 pb-4 shrink-0">
        <p className="text-xs text-line2">{project?.cluster_id}</p>
        <h1 className="font-semibold leading-tight">Laporan — {project?.cluster_name || "Memuat..."}</h1>
        <p className="text-xs text-line2 mt-0.5">Laporan tersimpan, tidak perlu generate ulang tiap mau lihat.</p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <ReportList projectId={String(projectId)} clusterName={project?.cluster_name} />
      </div>
    </div>
  );
}
