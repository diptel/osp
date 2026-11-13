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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  survei: "Survei",
  desain: "Desain",
  berjalan: "Berjalan",
  rfs: "RFS",
  atp: "ATP",
  revisi_atp: "Revisi ATP",
  lunas: "Lunas",
  selesai: "Selesai",
  ditahan: "Ditahan",
};
const STATUS_COLOR: Record<string, string> = {
  berjalan: "bg-okbg text-ok",
  rfs: "bg-okbg text-ok",
  atp: "bg-[#FCF1D6] text-[#8A5A00]",
  revisi_atp: "bg-warnbg text-warn",
  lunas: "bg-okbg text-ok",
  selesai: "bg-okbg text-ok",
  ditahan: "bg-warnbg text-warn",
  survei: "bg-[#E4ECF8] text-[#1E3F7A]",
  desain: "bg-[#E4ECF8] text-[#1E3F7A]",
};
const STATUS_RANK: Record<string, number> = { berjalan: 0, revisi_atp: 1, rfs: 2, atp: 3, ditahan: 4, survei: 10, desain: 11, draft: 12, lunas: 20 };

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
  // Urutan tab Aktif: berjalan paling atas, lalu RFS/ATP, ditahan, baru tahap persiapan.
  const aktif = visible
    .filter((p) => p.status !== "selesai")
    .sort((a, b) => (STATUS_RANK[a.status] ?? 50) - (STATUS_RANK[b.status] ?? 50));
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
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted">{p.cluster_id}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${STATUS_COLOR[p.status] || "bg-[#EEF0F2] text-[#4A5059]"}`}>
              {p.status === "berjalan" ? "● " : ""}
              {STATUS_LABEL[p.status] || p.status}
            </span>
          </div>
          <span className="font-semibold">{p.cluster_name}</span>
          <span className="text-xs text-muted">{p.region}</span>
        </Link>
      ))}
    </div>
  );
}
