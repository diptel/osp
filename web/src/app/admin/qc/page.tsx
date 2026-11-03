"use client";
import { useEffect, useState } from "react";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type OpmRow = RecordModel & {
  port_fat: number;
  opm_dbm: number;
  status: string;
  expand?: { fat?: RecordModel & { code: string }; photo?: RecordModel & { file: string }; project?: RecordModel & { cluster_name: string } };
};
type WorkItemRow = RecordModel & {
  qty: number;
  step: string;
  status: string;
  expand?: { package?: RecordModel & { name: string }; project?: RecordModel & { cluster_name: string } };
};
type RelocRow = RecordModel & {
  reason: string;
  note: string;
  status: string;
  expand?: { asset?: RecordModel & { code: string }; project?: RecordModel & { cluster_name: string } };
};

export default function AntrianQcPage() {
  const [tab, setTab] = useState<"opm" | "item" | "reloc">("opm");
  const [opm, setOpm] = useState<OpmRow[] | null>(null);
  const [items, setItems] = useState<WorkItemRow[] | null>(null);
  const [relocs, setRelocs] = useState<RelocRow[] | null>(null);
  const [busyId, setBusyId] = useState("");

  function load() {
    pb()
      .collection("opm_tests")
      .getFullList<OpmRow>({ filter: 'status = "submitted"', expand: "fat,photo,project", sort: "created" })
      .then(setOpm)
      .catch(() => setOpm([]));
    pb()
      .collection("work_items")
      .getFullList<WorkItemRow>({ filter: 'status = "submitted"', expand: "package,project", sort: "created" })
      .then(setItems)
      .catch(() => setItems([]));
    pb()
      .collection("relocations")
      .getFullList<RelocRow>({ filter: 'status = "submitted"', expand: "asset,project", sort: "created" })
      .then(setRelocs)
      .catch(() => setRelocs([]));
  }

  useEffect(load, []);

  async function decide(col: "opm_tests" | "work_items" | "relocations", id: string, status: "approved" | "rejected") {
    setBusyId(id);
    try {
      await pb().collection(col).update(id, {
        status,
        qc_by: currentUser()?.id,
        qc_at: new Date().toISOString(),
      });
      load();
    } finally {
      setBusyId("");
    }
  }

  const TABS: { key: typeof tab; label: string; count: number | undefined }[] = [
    { key: "opm", label: "Uji OPM", count: opm?.length },
    { key: "item", label: "Progres kerja", count: items?.length },
    { key: "reloc", label: "Geser titik", count: relocs?.length },
  ];

  const btnOk = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-okbg text-ok disabled:opacity-50";
  const btnNo = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-warnbg text-warn disabled:opacity-50";

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Antrian QC</h1>
        <p className="text-sm text-muted">Tinjau dan setujui laporan dari lapangan.</p>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              tab === t.key ? "bg-ink text-white border-ink" : "border-border text-subtle"
            }`}
          >
            {t.label} {t.count !== undefined ? `· ${t.count}` : ""}
          </button>
        ))}
      </div>

      {tab === "opm" && (
        <div className="flex flex-col gap-2">
          {opm === null && <p className="text-sm text-muted">Memuat...</p>}
          {opm?.length === 0 && <p className="text-sm text-muted">Tidak ada yang menunggu.</p>}
          {opm?.map((o) => (
            <div key={o.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              {o.expand?.photo && (
                <img
                  src={fileUrl(o.expand.photo, o.expand.photo.file, "100x100")}
                  className="w-14 h-14 rounded-lg object-cover bg-ink shrink-0"
                  alt=""
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold">
                  {o.expand?.fat?.code} · Port {o.port_fat}
                </p>
                <p className="text-xs text-muted">
                  {o.expand?.project?.cluster_name} · {o.opm_dbm} dBm
                </p>
              </div>
              <button disabled={busyId === o.id} onClick={() => decide("opm_tests", o.id, "approved")} className={btnOk}>
                Setuju
              </button>
              <button disabled={busyId === o.id} onClick={() => decide("opm_tests", o.id, "rejected")} className={btnNo}>
                Tolak
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "item" && (
        <div className="flex flex-col gap-2">
          {items === null && <p className="text-sm text-muted">Memuat...</p>}
          {items?.length === 0 && <p className="text-sm text-muted">Tidak ada yang menunggu.</p>}
          {items?.map((it) => (
            <div key={it.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {it.expand?.package?.name} · {it.step}
                </p>
                <p className="text-xs text-muted">
                  {it.expand?.project?.cluster_name} · qty {it.qty}
                </p>
              </div>
              <button disabled={busyId === it.id} onClick={() => decide("work_items", it.id, "approved")} className={btnOk}>
                Setuju
              </button>
              <button disabled={busyId === it.id} onClick={() => decide("work_items", it.id, "rejected")} className={btnNo}>
                Tolak
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "reloc" && (
        <div className="flex flex-col gap-2">
          {relocs === null && <p className="text-sm text-muted">Memuat...</p>}
          {relocs?.length === 0 && <p className="text-sm text-muted">Tidak ada yang menunggu.</p>}
          {relocs?.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold">{r.expand?.asset?.code}</p>
                <p className="text-xs text-muted">
                  {r.expand?.project?.cluster_name} · {r.reason} {r.note ? `· ${r.note}` : ""}
                </p>
              </div>
              <button disabled={busyId === r.id} onClick={() => decide("relocations", r.id, "approved")} className={btnOk}>
                Setuju
              </button>
              <button disabled={busyId === r.id} onClick={() => decide("relocations", r.id, "rejected")} className={btnNo}>
                Tolak
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
