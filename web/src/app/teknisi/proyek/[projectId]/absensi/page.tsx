"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb, currentUser } from "@/lib/pocketbase";
import { AttendanceForm } from "@/components/AttendanceForm";
import type { RecordModel } from "pocketbase";

type Project = RecordModel & { cluster_name: string; cluster_id: string };

export default function AbsensiPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const role = currentUser()?.role;
  const allowed = role === "admin" || role === "surveyor";

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
          <h1 className="font-semibold leading-tight">Absensi — {project?.cluster_name || "Memuat..."}</h1>
          <p className="text-xs text-line2 mt-0.5">Centang pekerja yang hadir hari ini dan isi jumlah lembur (per kejadian).</p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        {allowed ? (
          <AttendanceForm projectId={String(projectId)} />
        ) : (
          <p className="text-sm text-muted">Hanya surveyor dan admin yang bisa mengisi halaman ini.</p>
        )}
      </div>
    </div>
  );
}
