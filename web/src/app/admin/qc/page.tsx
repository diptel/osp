"use client";
import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type OpmRow = RecordModel & {
  port_fat: number;
  opm_dbm: number;
  status: string;
  qc_note?: string;
  expand?: { fat?: RecordModel & { code: string }; photo?: RecordModel & { file: string }; project?: RecordModel & { cluster_name: string } };
};
type WorkItemRow = RecordModel & {
  qty: number;
  step: string;
  status: string;
  qc_note?: string;
  expand?: { package?: RecordModel & { name: string }; project?: RecordModel & { cluster_name: string } };
};
type RelocRow = RecordModel & {
  reason: string;
  note: string;
  status: string;
  qc_note?: string;
  expand?: { asset?: RecordModel & { code: string }; project?: RecordModel & { cluster_name: string } };
};

export default function AntrianQcPage() {
  const [tab, setTab] = useState<"opm" | "item" | "reloc" | "atp">("opm");
  const [opm, setOpm] = useState<OpmRow[] | null>(null);
  const [items, setItems] = useState<WorkItemRow[] | null>(null);
  const [relocs, setRelocs] = useState<RelocRow[] | null>(null);
  const [opmDone, setOpmDone] = useState<OpmRow[] | null>(null);
  const [itemsDone, setItemsDone] = useState<WorkItemRow[] | null>(null);
  const [relocsDone, setRelocsDone] = useState<RelocRow[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  function load() {
    setLoadErr("");
    // requestKey unik per panggilan — tanpa ini, SDK PocketBase otomatis
    // membatalkan request sebelumnya ke koleksi yang sama (mis. opm_tests
    // submitted dibatalkan oleh opm_tests approved yang dikirim sesudahnya).
    pb()
      .collection("opm_tests")
      .getFullList<OpmRow>({
        filter: 'status = "submitted"',
        expand: "fat,photo,project",
        sort: "created",
        requestKey: "qc-opm-submitted",
      })
      .then(setOpm)
      .catch((e) => {
        setOpm([]);
        setLoadErr(`Gagal memuat Uji OPM: ${e?.status ?? ""} ${e?.message ?? e}`);
      });
    pb()
      .collection("work_items")
      .getFullList<WorkItemRow>({
        filter: 'status = "submitted"',
        expand: "package,project",
        sort: "created",
        requestKey: "qc-item-submitted",
      })
      .then(setItems)
      .catch(() => setItems([]));
    pb()
      .collection("relocations")
      .getFullList<RelocRow>({
        filter: 'status = "submitted"',
        expand: "asset,project",
        sort: "created",
        requestKey: "qc-reloc-submitted",
      })
      .then(setRelocs)
      .catch(() => setRelocs([]));
    // item yang SUDAH disetujui — untuk ditandai perlu revisi saat ATP
    pb()
      .collection("opm_tests")
      .getFullList<OpmRow>({
        filter: 'status = "approved"',
        expand: "fat,photo,project",
        sort: "-created",
        requestKey: "qc-opm-approved",
      })
      .then(setOpmDone)
      .catch(() => setOpmDone([]));
    pb()
      .collection("work_items")
      .getFullList<WorkItemRow>({
        filter: 'status = "approved"',
        expand: "package,project",
        sort: "-created",
        requestKey: "qc-item-approved",
      })
      .then(setItemsDone)
      .catch(() => setItemsDone([]));
    pb()
      .collection("relocations")
      .getFullList<RelocRow>({
        filter: 'status = "approved"',
        expand: "asset,project",
        sort: "-created",
        requestKey: "qc-reloc-approved",
      })
      .then(setRelocsDone)
      .catch(() => setRelocsDone([]));
  }

  useEffect(load, []);

  async function decide(
    col: "opm_tests" | "work_items" | "relocations",
    id: string,
    status: "approved" | "rejected"
  ) {
    setBusyId(id);
    try {
      await pb().collection(col).update(id, {
        status,
        qc_note: status === "rejected" ? notes[id] || "" : "",
        qc_by: currentUser()?.id,
        qc_at: new Date().toISOString(),
      });
      setNotes((n) => ({ ...n, [id]: "" }));
      load();
    } finally {
      setBusyId("");
    }
  }

  async function approveAll(col: "opm_tests" | "work_items" | "relocations", rows: RecordModel[] | null) {
    if (!rows || rows.length === 0) return;
    setBulkBusy(true);
    try {
      const uid = currentUser()?.id;
      for (const r of rows) {
        try {
          await pb().collection(col).update(r.id, { status: "approved", qc_note: "", qc_by: uid, qc_at: new Date().toISOString() });
        } catch {
          // lewati satu yang gagal, lanjut ke sisanya
        }
      }
      load();
    } finally {
      setBulkBusy(false);
    }
  }

  const TABS: { key: typeof tab; label: string; count: number | undefined }[] = [
    { key: "opm", label: "Uji OPM", count: opm?.length },
    { key: "item", label: "Progres kerja", count: items?.length },
    { key: "reloc", label: "Geser titik", count: relocs?.length },
    { key: "atp", label: "Revisi ATP", count: undefined },
  ];

  const noteInput = (id: string) => (
    <input
      type="text"
      value={notes[id] || ""}
      onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))}
      placeholder="Catatan revisi (opsional)"
      className="w-full text-xs px-2 py-1.5 border border-line2 rounded-lg bg-card"
    />
  );

  const btnOk = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-okbg text-ok disabled:opacity-50";
  const btnNo = "px-3 py-1.5 rounded-lg text-xs font-semibold bg-warnbg text-warn disabled:opacity-50";

  return (
    <div className="max-w-3xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Antrian QC</h1>
        <p className="text-sm text-muted">Tinjau dan setujui laporan dari lapangan.</p>
        <p className="text-[11px] text-faint mt-1">
          Login sebagai: {currentUser()?.email || "?"} · role: {currentUser()?.role || "?"}
        </p>
      </div>
      {loadErr && <p className="text-xs text-warn bg-warnbg border border-warn rounded-lg p-2">{loadErr}</p>}

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
          {opm && opm.length > 0 && (
            <ConfirmButton
              label={bulkBusy ? "Memproses..." : `Setujui semua (${opm.length})`}
              question={`Setujui semua ${opm.length} item?`}
              yesClassName="bg-ink text-white"
              onConfirm={() => approveAll("opm_tests", opm)}
              disabled={bulkBusy}
              className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50"
            />
          )}
          {opm?.map((o) => (
            <div key={o.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
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
              {noteInput(o.id)}
            </div>
          ))}
        </div>
      )}

      {tab === "item" && (
        <div className="flex flex-col gap-2">
          {items === null && <p className="text-sm text-muted">Memuat...</p>}
          {items?.length === 0 && <p className="text-sm text-muted">Tidak ada yang menunggu.</p>}
          {items && items.length > 0 && (
            <ConfirmButton
              label={bulkBusy ? "Memproses..." : `Setujui semua (${items.length})`}
              question={`Setujui semua ${items.length} item?`}
              yesClassName="bg-ink text-white"
              onConfirm={() => approveAll("work_items", items)}
              disabled={bulkBusy}
              className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50"
            />
          )}
          {items?.map((it) => (
            <div key={it.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
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
              {noteInput(it.id)}
            </div>
          ))}
        </div>
      )}

      {tab === "reloc" && (
        <div className="flex flex-col gap-2">
          {relocs === null && <p className="text-sm text-muted">Memuat...</p>}
          {relocs?.length === 0 && <p className="text-sm text-muted">Tidak ada yang menunggu.</p>}
          {relocs && relocs.length > 0 && (
            <ConfirmButton
              label={bulkBusy ? "Memproses..." : `Setujui semua (${relocs.length})`}
              question={`Setujui semua ${relocs.length} item?`}
              yesClassName="bg-ink text-white"
              onConfirm={() => approveAll("relocations", relocs)}
              disabled={bulkBusy}
              className="self-start px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50"
            />
          )}
          {relocs?.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center gap-3">
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
              {noteInput(r.id)}
            </div>
          ))}
        </div>
      )}

      {tab === "atp" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted">
            Tandai item yang sudah disetujui sebagai perlu revisi (misal hasil ATP dari klien). Teknisi akan melihat
            catatan ini di aplikasi dan bisa langsung uji/kerjakan ulang.
          </p>

          <div>
            <p className="text-xs font-semibold text-subtle mb-1.5">Uji OPM yang sudah disetujui</p>
            <div className="flex flex-col gap-2">
              {opmDone === null && <p className="text-sm text-muted">Memuat...</p>}
              {opmDone?.length === 0 && <p className="text-sm text-muted">Belum ada yang disetujui.</p>}
              {opmDone?.map((o) => (
                <div key={o.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    {o.expand?.photo && (
                      <img
                        src={fileUrl(o.expand.photo, o.expand.photo.file, "100x100")}
                        className="w-12 h-12 rounded-lg object-cover bg-ink shrink-0"
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
                    <button
                      disabled={busyId === o.id || !notes[o.id]}
                      onClick={() => decide("opm_tests", o.id, "rejected")}
                      className={btnNo}
                    >
                      Tandai revisi
                    </button>
                  </div>
                  <input
                    type="text"
                    value={notes[o.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [o.id]: e.target.value }))}
                    placeholder="Alasan revisi, mis. redaman 24dB — sambung ulang"
                    className="w-full text-xs px-2 py-1.5 border border-line2 rounded-lg bg-card"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-subtle mb-1.5">Progres kerja yang sudah disetujui</p>
            <div className="flex flex-col gap-2">
              {itemsDone === null && <p className="text-sm text-muted">Memuat...</p>}
              {itemsDone?.length === 0 && <p className="text-sm text-muted">Belum ada yang disetujui.</p>}
              {itemsDone?.map((it) => (
                <div key={it.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {it.expand?.package?.name} · {it.step}
                      </p>
                      <p className="text-xs text-muted">
                        {it.expand?.project?.cluster_name} · qty {it.qty}
                      </p>
                    </div>
                    <button
                      disabled={busyId === it.id || !notes[it.id]}
                      onClick={() => decide("work_items", it.id, "rejected")}
                      className={btnNo}
                    >
                      Tandai revisi
                    </button>
                  </div>
                  <input
                    type="text"
                    value={notes[it.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                    placeholder="Alasan revisi"
                    className="w-full text-xs px-2 py-1.5 border border-line2 rounded-lg bg-card"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-subtle mb-1.5">Geser titik yang sudah disetujui</p>
            <div className="flex flex-col gap-2">
              {relocsDone === null && <p className="text-sm text-muted">Memuat...</p>}
              {relocsDone?.length === 0 && <p className="text-sm text-muted">Belum ada yang disetujui.</p>}
              {relocsDone?.map((r) => (
                <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-semibold">{r.expand?.asset?.code}</p>
                      <p className="text-xs text-muted">
                        {r.expand?.project?.cluster_name} · {r.reason}
                      </p>
                    </div>
                    <button
                      disabled={busyId === r.id || !notes[r.id]}
                      onClick={() => decide("relocations", r.id, "rejected")}
                      className={btnNo}
                    >
                      Tandai revisi
                    </button>
                  </div>
                  <input
                    type="text"
                    value={notes[r.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Alasan revisi"
                    className="w-full text-xs px-2 py-1.5 border border-line2 rounded-lg bg-card"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
