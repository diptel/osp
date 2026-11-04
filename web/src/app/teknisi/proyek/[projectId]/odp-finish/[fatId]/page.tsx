"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { FatFinishPhotos } from "@/components/FatFinishPhotos";
import type { RecordModel } from "pocketbase";

type Asset = RecordModel & { code: string; line: string };

export default function FatFinishPage() {
  const { projectId, fatId } = useParams<{ projectId: string; fatId: string }>();
  const [fat, setFat] = useState<Asset | null>(null);

  useEffect(() => {
    pb().collection("assets").getOne<Asset>(String(fatId)).then(setFat).catch(() => void 0);
  }, [fatId]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-ink text-white px-3 pt-3.5 pb-2.5 flex items-center gap-2 shrink-0">
        <Link href={`/teknisi/proyek/${projectId}/odp-finish`} className="w-11 h-11 flex items-center justify-center -ml-2 text-white">
          ←
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-line2">Foto Finish FAT</p>
          <h1 className="font-mono text-[17px] leading-tight">{fat?.code || "..."}</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 min-h-0">
        <FatFinishPhotos projectId={String(projectId)} fatId={String(fatId)} />
      </div>
    </div>
  );
}
