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
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  qc: "QC",
  drafter: "Drafter",
  surveyor: "Surveyor",
  mandor: "Mandor",
  splicer: "Splicer",
  pemborong: "Pemborong",
};

export default function TimPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);

  useEffect(() => {
    pb()
      .collection("users")
      .getFullList<UserRow>({ sort: "role,name" })
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Tim</h1>
        <p className="text-sm text-muted">Semua akun: staf kantor dan lapangan.</p>
      </div>
      <div className="flex flex-col gap-2">
        {users === null && <p className="text-sm text-muted">Memuat...</p>}
        {users?.map((u) => (
          <div key={u.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{u.name || u.email}</p>
              <p className="text-xs text-muted">
                {u.phone || u.email}
                {!u.active && " · nonaktif"}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#EEF0F2] text-subtle">
              {ROLE_LABEL[u.role] || u.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
