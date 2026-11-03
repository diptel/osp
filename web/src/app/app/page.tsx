"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { pb, currentUser } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & { cluster_name: string; cluster_id: string; region: string };

export default function TeknisiHome() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);

  useEffect(() => {
    const u = currentUser();
    const ids = u?.projects || [];
    if (ids.length === 0) {
      setProjects([]);
      return;
    }
    const filter = ids.map((id) => `id = "${id}"`).join(" || ");
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ filter })
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Pilih proyek</h1>
      {projects === null && <p className="text-sm text-muted">Memuat...</p>}
      {projects?.length === 0 && (
        <p className="text-sm text-muted">Belum ada proyek yang ditugaskan ke akun Anda.</p>
      )}
      {projects?.map((p) => (
        <Link
          key={p.id}
          href={`/app/proyek/${p.id}`}
          className="bg-card border border-border rounded-xl p-3.5 flex flex-col gap-0.5"
        >
          <span className="font-mono text-xs text-muted">{p.cluster_id}</span>
          <span className="font-semibold">{p.cluster_name}</span>
          <span className="text-xs text-muted">{p.region}</span>
        </Link>
      ))}
    </div>
  );
}
