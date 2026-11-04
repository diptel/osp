"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & { cluster_name: string; cluster_id: string };
type Asset = RecordModel & { code: string; line: string; ports?: number };
type OpmTest = RecordModel & { fat: string; port_fat: number; status: string };
type Photo = RecordModel & { asset: string };

export default function AdminFatFinishListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [fats, setFats] = useState<Asset[] | null>(null);
  const [tests, setTests] = useState<OpmTest[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);

  useEffect(() => {
    pb().collection("projects").getOne<ProjectRow>(String(projectId)).then(setProject).catch(() => void 0);
    pb()
      .collection("assets")
      .getFullList<Asset>({ filter: `project = "${projectId}" && kind = "fat"`, sort: "line,code" })
      .then(setFats)
      .catch(() => setFats([]));
    pb()
      .collection("opm_tests")
      .getFullList<OpmTest>({ filter: `project = "${projectId}" && status = "approved"` })
      .then(setTests)
      .catch(() => void 0);
    pb()
      .collection("photos")
      .getFullList<Photo>({ filter: `project = "${projectId}" && purpose = "fat_finish"` })
      .then(setPhotos)
      .catch(() => void 0);
  }, [projectId]);

  const approvedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tests) m.set(t.fat, (m.get(t.fat) || 0) + 1);
    return m;
  }, [tests]);
  const finishCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of photos) m.set(p.asset, (m.get(p.asset) || 0) + 1);
    return m;
  }, [photos]);

  const eligible = (fats || []).filter((f) => (approvedCount.get(f.id) || 0) >= (f.ports || 8));
  const notYet = (fats || []).filter((f) => (approvedCount.get(f.id) || 0) < (f.ports || 8));

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted font-mono">{project?.cluster_id}</p>
        <h1 className="text-xl font-semibold">Foto Finish FAT — {project?.cluster_name || "Memuat..."}</h1>
        <p className="text-sm text-muted">
          Syarat tambahan setelah RFS — FAT yang 8 port-nya sudah lengkap & terverifikasi QC.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {fats === null && <p className="text-sm text-muted">Memuat...</p>}
        {fats !== null && eligible.length === 0 && (
          <p className="text-sm text-muted">Belum ada FAT yang semua port-nya terverifikasi QC.</p>
        )}
        {eligible.map((f) => {
          const n = finishCount.get(f.id) || 0;
          return (
            <Link
              key={f.id}
              href={`/admin/proyek/${projectId}/odp-finish/${f.id}`}
              className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3"
            >
              <span className={`w-3 h-3 rounded-full shrink-0 ${n > 0 ? "bg-ok" : "bg-faint"}`} />
              <span className="flex-1 min-w-0">
                <span className="font-mono text-sm font-semibold block">{f.code}</span>
                <span className="text-xs text-muted block">{n > 0 ? `${n} foto` : "Belum ada foto"}</span>
              </span>
              <span className="text-subtle">›</span>
            </Link>
          );
        })}
      </div>

      {notYet.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-faint mt-2">FAT yang belum lengkap/terverifikasi ({notYet.length}):</p>
          {notYet.map((f) => (
            <p key={f.id} className="text-xs text-faint font-mono">
              {f.code} · {approvedCount.get(f.id) || 0}/{f.ports || 8} port
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
