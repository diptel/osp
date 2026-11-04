"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { FatFinishPhotos } from "@/components/FatFinishPhotos";
import type { RecordModel } from "pocketbase";

type Asset = RecordModel & { code: string; line: string };

export default function AdminFatFinishPage() {
  const { projectId, fatId } = useParams<{ projectId: string; fatId: string }>();
  const [fat, setFat] = useState<Asset | null>(null);

  useEffect(() => {
    pb().collection("assets").getOne<Asset>(String(fatId)).then(setFat).catch(() => void 0);
  }, [fatId]);

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div>
        <Link href={`/admin/proyek/${projectId}/odp-finish`} className="text-xs text-accent underline">
          ← Daftar FAT
        </Link>
        <h1 className="text-xl font-semibold font-mono mt-1">{fat?.code || "Memuat..."}</h1>
        <p className="text-sm text-muted">Foto Finish FAT</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-4">
        <FatFinishPhotos projectId={String(projectId)} fatId={String(fatId)} allowPaste canDelete />
      </div>
    </div>
  );
}
