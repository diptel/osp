"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { OdpFinishPhotos } from "@/components/OdpFinishPhotos";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & { cluster_name: string; cluster_id: string };

export default function AdminOdpFinishPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectRow | null>(null);

  useEffect(() => {
    pb().collection("projects").getOne<ProjectRow>(String(projectId)).then(setProject).catch(() => void 0);
  }, [projectId]);

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted font-mono">{project?.cluster_id}</p>
        <h1 className="text-xl font-semibold">Foto ODP Finish — {project?.cluster_name || "Memuat..."}</h1>
        <p className="text-sm text-muted">Syarat tambahan setelah RFS — dokumentasi box ODP/FDT yang sudah selesai.</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <OdpFinishPhotos projectId={String(projectId)} allowPaste canDelete />
      </div>
    </div>
  );
}
