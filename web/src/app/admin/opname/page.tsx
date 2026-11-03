"use client";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type OpnameRow = RecordModel & {
  period_start?: string;
  period_end?: string;
  approved_qty?: number;
  amount?: number;
  paid_amount?: number;
  status: string;
  expand?: { package?: RecordModel & { name: string }; project?: RecordModel & { cluster_name: string } };
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  terbit: "Terbit",
  dibayar_sebagian: "Dibayar sebagian",
  lunas: "Lunas",
};

export default function OpnamePage() {
  const [rows, setRows] = useState<OpnameRow[] | null>(null);

  useEffect(() => {
    pb()
      .collection("opnames")
      .getFullList<OpnameRow>({ expand: "package,project", sort: "-created" })
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Opname &amp; pembayaran</h1>
        <p className="text-sm text-muted">Berita acara opname per paket pekerjaan.</p>
      </div>
      <div className="flex flex-col gap-2">
        {rows === null && <p className="text-sm text-muted">Memuat...</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">Belum ada opname. Dibuat per paket dari halaman proyek.</p>}
        {rows?.map((r) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{r.expand?.package?.name}</p>
              <p className="text-xs text-muted">
                {r.expand?.project?.cluster_name} · qty {r.approved_qty ?? 0}
                {r.amount ? ` · Rp${r.amount.toLocaleString("id-ID")}` : ""}
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#EEF0F2] text-subtle">
              {STATUS_LABEL[r.status] || r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
