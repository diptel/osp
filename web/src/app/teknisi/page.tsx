"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { pb, currentUser } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & {
  cluster_name: string;
  cluster_id: string;
  region: string;
  status: string;
  archived?: boolean;
};

type Tab = "aktif" | "selesai";

export default function TeknisiHome() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [tab, setTab] = useState<Tab>("aktif");

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
      .getFullList<ProjectRow>({ filter, sort: "-created" })
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  // Proyek terarsip & dibatalkan tidak tampil di app teknisi sama sekali.
  const visible = (projects || []).filter((p) => !p.archived && p.status !== "dibatalkan");
  const aktif = visible.filter((p) => p.status !== "selesai");
  const selesai = visible.filter((p) => p.status === "selesai");
  const list = tab === "aktif" ? aktif : selesai;

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="text-lg font-semibold">Pilih proyek</h1>
      <div className="grid grid-cols-2 gap-1 p-1 bg-[#EEF0F2] rounded-lg">
        {(
          [
            ["aktif", `Aktif (${aktif.length})`],
            ["selesai", `Selesai (${selesai.length})`],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-xs font-semibold min-h-9 rounded-md ${tab === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {projects === null && <p className="text-sm text-muted">Memuat...</p>}
      {projects !== null && visible.length === 0 && (
        <p className="text-sm text-muted">Belum ada proyek yang ditugaskan ke akun Anda.</p>
      )}
      {projects !== null && visible.length > 0 && list.length === 0 && (
        <p className="text-sm text-muted">
          {tab === "aktif" ? "Tidak ada proyek aktif." : "Belum ada proyek yang selesai."}
        </p>
      )}
      {list.map((p) => (
        <Link
          key={p.id}
          href={`/teknisi/proyek/${p.id}`}
          className="bg-card border border-border rounded-xl p-3.5 flex flex-col gap-0.5"
        >
          <span className="font-mono text-xs text-muted">{p.cluster_id}</span>
          <span className="font-semibold">{p.cluster_name}</span>
          <span className="text-xs text-muted">
            {p.region}
            {p.status === "selesai" && " · ✓ Selesai"}
          </span>
        </Link>
      ))}
    </div>
  );
}
