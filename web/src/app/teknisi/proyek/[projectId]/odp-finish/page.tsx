"use client";
import { useParams } from "next/navigation";
import { OdpFinishPhotos } from "@/components/OdpFinishPhotos";

export default function OdpFinishPage() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-ink text-white px-4 pt-4 pb-4 shrink-0">
        <h1 className="font-semibold leading-tight">Foto ODP Finish</h1>
        <p className="text-xs text-line2 mt-0.5">Syarat tambahan setelah RFS — dokumentasi box ODP/FDT yang sudah selesai.</p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <OdpFinishPhotos projectId={String(projectId)} />
      </div>
    </div>
  );
}
