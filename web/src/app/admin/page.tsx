"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ProjectRow = RecordModel & {
  code: string;
  name: string;
  region: string;
  cluster_name: string;
  cluster_id: string;
  status: string;
  expand?: { client?: RecordModel & { name: string } };
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  survei: "Survei",
  desain: "Desain",
  berjalan: "Berjalan",
  selesai: "Selesai",
  ditahan: "Ditahan",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#EEF0F2] text-[#4A5059]",
  survei: "bg-[#E4ECF8] text-[#1E3F7A]",
  desain: "bg-[#E4ECF8] text-[#1E3F7A]",
  berjalan: "bg-okbg text-ok",
  selesai: "bg-okbg text-ok",
  ditahan: "bg-warnbg text-warn",
};

export default function AdminDashboard() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ expand: "client", sort: "-created" })
      .then(setProjects)
      .catch(() => setErr("Gagal memuat proyek."));
  }, []);

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Dashboard proyek</h1>
        <p className="text-sm text-muted">Semua proyek FTTH BRIIX OSP, lintas klien.</p>
      </div>

      {err && <p className="text-sm text-warn">{err}</p>}
      {!projects && !err && <p className="text-sm text-muted">Memuat...</p>}
      {projects && projects.length === 0 && (
        <p className="text-sm text-muted">
          Belum ada proyek. Buat lewat{" "}
          <Link href="/admin/proyek-baru" className="text-accent underline">
            Proyek baru
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((p) => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-muted">{p.cluster_id || p.code}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${STATUS_COLOR[p.status] || ""}`}>
                {STATUS_LABEL[p.status] || p.status}
              </span>
            </div>
            <h3 className="font-semibold leading-snug">{p.cluster_name || p.name}</h3>
            <p className="text-xs text-muted">
              {p.expand?.client?.name} · {p.region}
            </p>
            <Link href={`/admin/proyek/${p.id}/kmz`} className="text-xs text-accent underline mt-1">
              Impor KMZ
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
