"use client";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type UserRow = RecordModel & {
  email: string;
  name?: string;
  phone?: string;
  role: string;
  active?: boolean;
  projects?: string[];
};
type ProjectRow = RecordModel & { cluster_name: string; cluster_id: string; code: string; name: string };

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  qc: "QC",
  drafter: "Drafter",
  surveyor: "Surveyor",
  mandor: "Mandor",
  splicer: "Splicer",
  pemborong: "Pemborong",
};

// Peran lapangan/subkontraktor yang butuh di-assign ke proyek tertentu
// supaya proyek itu muncul di app teknisi mereka.
const FIELD_ROLES = new Set(["surveyor", "mandor", "splicer", "pemborong"]);

export default function TimPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [openId, setOpenId] = useState("");
  const [busyKey, setBusyKey] = useState("");

  function load() {
    pb()
      .collection("users")
      .getFullList<UserRow>({ sort: "role,name" })
      .then(setUsers)
      .catch(() => setUsers([]));
    pb()
      .collection("projects")
      .getFullList<ProjectRow>({ sort: "-created" })
      .then(setProjects)
      .catch(() => setProjects([]));
  }

  useEffect(load, []);

  async function toggleProject(u: UserRow, projectId: string, assigned: boolean) {
    const key = `${u.id}:${projectId}`;
    setBusyKey(key);
    try {
      await pb()
        .collection("users")
        .update(u.id, assigned ? { "projects-": projectId } : { "projects+": projectId });
      load();
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Tim</h1>
        <p className="text-sm text-muted">
          Semua akun: staf kantor dan lapangan. Klik akun untuk atur proyek yang bisa ia lihat di app teknisi —
          proyek baru TIDAK otomatis muncul untuk siapa pun sampai di-assign di sini.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {users === null && <p className="text-sm text-muted">Memuat...</p>}
        {users?.map((u) => {
          const isField = FIELD_ROLES.has(u.role);
          const open = openId === u.id;
          const assignedIds = new Set(u.projects || []);
          return (
            <div key={u.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => isField && setOpenId(open ? "" : u.id)}
                className="w-full p-3 flex items-center gap-3 text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{u.name || u.email}</p>
                  <p className="text-xs text-muted">
                    {u.phone || u.email}
                    {!u.active && " · nonaktif"}
                    {isField && ` · ${assignedIds.size} proyek`}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#EEF0F2] text-subtle">
                  {ROLE_LABEL[u.role] || u.role}
                </span>
                {isField && <span className="text-subtle">{open ? "▲" : "▼"}</span>}
              </button>
              {isField && open && (
                <div className="border-t border-border p-3 flex flex-col gap-1.5 bg-[#FAFAF8]">
                  {projects === null && <p className="text-xs text-muted">Memuat proyek...</p>}
                  {projects?.length === 0 && <p className="text-xs text-muted">Belum ada proyek.</p>}
                  {projects?.map((p) => {
                    const assigned = assignedIds.has(p.id);
                    const key = `${u.id}:${p.id}`;
                    return (
                      <label key={p.id} className="flex items-center gap-2 text-sm py-1">
                        <input
                          type="checkbox"
                          checked={assigned}
                          disabled={busyKey === key}
                          onChange={() => toggleProject(u, p.id, assigned)}
                        />
                        <span className="font-mono text-xs text-muted">{p.cluster_id || p.code}</span>
                        <span>{p.cluster_name || p.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
