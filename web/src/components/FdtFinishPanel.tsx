"use client";
import { useCallback, useEffect, useState } from "react";
import { pb, currentUser } from "@/lib/pocketbase";
import { StampedPhotoSlot, type StampedPhoto } from "@/components/StampedPhotoSlot";
import type { RecordModel } from "pocketbase";

type Fdt = RecordModel & { code: string };
export type RfsStatus = {
  status: string;
  feeder_cores: number;
  fats: { id: string; code: string; ports: number; approved: number; finish_photos: number }[];
  items: { key: string; label: string; done: boolean; detail: string }[];
  complete: boolean;
};

/**
 * Foto Finish FDT: core feeder masuk FDT (N slot, N = projects.feeder_cores),
 * foto akhir FDT luar, dan cek redaman 1 port FDT. Semua kamera + GPS.
 * `isAdmin` → boleh atur jumlah core feeder, unggah dari file, hapus.
 */
export function FdtFinishPanel({ projectId, isAdmin = false }: { projectId: string; isAdmin?: boolean }) {
  const [fdt, setFdt] = useState<Fdt | null | undefined>(undefined);
  const [photos, setPhotos] = useState<StampedPhoto[]>([]);
  const [feederCores, setFeederCores] = useState<number>(0);
  const [tolerance, setTolerance] = useState<number>(50);
  const [clusterId, setClusterId] = useState("");
  const [coresInput, setCoresInput] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    pb()
      .collection("assets")
      .getFirstListItem<Fdt>(`project = "${projectId}" && (kind = "fdt" || kind = "odc")`)
      .then(setFdt)
      .catch(() => setFdt(null));
    pb()
      .collection("photos")
      .getFullList<StampedPhoto>({
        filter: `project = "${projectId}" && (purpose = "fdt_feeder" || purpose = "fdt_finish" || purpose = "fdt_opm")`,
        sort: "-created",
      })
      .then(setPhotos)
      .catch(() => setPhotos([]));
    pb()
      .collection("projects")
      .getOne<RecordModel & { feeder_cores?: number; gps_tolerance_m?: number; cluster_id?: string }>(projectId)
      .then((p) => {
        setFeederCores(p.feeder_cores || 0);
        setTolerance(p.gps_tolerance_m || 50);
        setClusterId(p.cluster_id || "");
        setCoresInput(p.feeder_cores ? String(p.feeder_cores) : "");
      })
      .catch(() => void 0);
  }, [projectId]);
  useEffect(load, [load]);

  async function saveCores() {
    const n = Math.max(0, Math.floor(Number(coresInput) || 0));
    try {
      await pb().collection("projects").update(projectId, { feeder_cores: n });
      setMsg(`Jumlah core feeder diset ${n}.`);
      load();
    } catch (e) {
      setMsg("Gagal menyimpan: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const byPurpose = (purpose: string) => photos.filter((p) => p.purpose === purpose);
  const feederBySeq = new Map<number, StampedPhoto>();
  for (const p of byPurpose("fdt_feeder")) if (p.seq != null && !feederBySeq.has(p.seq)) feederBySeq.set(p.seq, p);
  const fdtFinish = byPurpose("fdt_finish")[0] || null;
  const role = currentUser()?.role;
  const canDelete = isAdmin || role === "qc";

  if (fdt === undefined) return <p className="text-sm text-muted">Memuat...</p>;
  if (fdt === null)
    return <p className="text-sm text-muted">Proyek ini belum punya titik FDT di data aset (impor KMZ dulu).</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#FAFAF8] border border-dashed border-line2 rounded-xl px-3 py-2.5 text-xs">
        <p className="font-semibold">FDT {fdt.code}</p>
        <p className="text-muted mt-0.5">
          {feederCores > 0 ? `${feederCores} core feeder masuk FDT` : "Jumlah core feeder belum diisi admin."}
          {" · "}Foto wajib dari kamera di lokasi; stempel tanggal & koordinat GPS ditempel otomatis ke foto, dan jaraknya
          dicek terhadap titik FDT (batas {tolerance} m). Hanya foto yang valid (✓ hijau) yang dihitung.
        </p>
        {isAdmin && (
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs text-muted">Jumlah core feeder</label>
            <input type="number" min={0} value={coresInput} onChange={(e) => setCoresInput(e.target.value)} className="w-20 border border-border rounded-md px-2 py-1 text-sm bg-card" />
            <button onClick={saveCores} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-ink text-white">
              Simpan
            </button>
            {msg && <span className="text-xs text-subtle">{msg}</span>}
          </div>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          1. Core feeder masuk FDT{" "}
          <span className="text-xs font-normal text-muted">
            ({Math.min(feederBySeq.size, feederCores)}/{feederCores || "?"})
          </span>
        </h3>
        {feederCores === 0 && <p className="text-xs text-faint">Minta admin mengisi jumlah core feeder proyek ini.</p>}
        {Array.from({ length: feederCores }, (_, i) => i + 1).map((n) => (
          <StampedPhotoSlot
            key={n}
            projectId={projectId}
            assetId={fdt.id}
            purpose="fdt_feeder"
            seq={n}
            label={`Core feeder #${n}`}
            photo={feederBySeq.get(n) || null}
            allowGallery={isAdmin}
            canDelete={canDelete}
            onChange={load}
            stampTitle={`${clusterId} FDT ${fdt.code}`}
            toleranceM={tolerance}
          />
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">2. Foto akhir FDT (luar) + redaman OPM 1 port</h3>
        <p className="text-xs text-faint -mt-1">
          Satu foto: FDT tampak luar (tertutup rapi) dengan layar OPM yang tercolok di salah satu port output ikut terlihat.
          Isi nilai dBm sesuai layar.
        </p>
        <StampedPhotoSlot projectId={projectId} assetId={fdt.id} purpose="fdt_finish" label="FDT luar + OPM 1 port" withDbm photo={fdtFinish} allowGallery={isAdmin} canDelete={canDelete} onChange={load} stampTitle={`${clusterId} FDT ${fdt.code}`} toleranceM={tolerance} />
      </section>
    </div>
  );
}

/** Checklist kelengkapan Finish RFS + tombol pindah ke tahap ATP. */
export function RfsChecklist({ projectId, canComplete }: { projectId: string; canComplete: boolean }) {
  const [st, setSt] = useState<RfsStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ask, setAsk] = useState(false);

  const load = useCallback(() => {
    pb()
      .send(`/api/briix/projects/${projectId}/rfs-status`, { method: "GET" })
      .then((r: RfsStatus) => setSt(r))
      .catch(() => setSt(null));
  }, [projectId]);
  useEffect(load, [load]);

  async function complete() {
    setBusy(true);
    setMsg("");
    try {
      const r = (await pb().send(`/api/briix/projects/${projectId}/rfs-complete`, { method: "POST" })) as { status: string; changed: boolean };
      setMsg(r.changed ? "Proyek masuk tahap ATP. Unduh Form ATP di menu Laporan untuk mendampingi pengecekan." : `Status proyek sudah ${r.status}.`);
      setAsk(false);
      load();
    } catch (e) {
      setMsg("Gagal: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (!st) return null;
  const alreadyAtp = ["atp", "revisi_atp", "lunas", "selesai"].includes(st.status);
  return (
    <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Checklist Finish RFS</p>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${st.complete ? "bg-okbg text-ok" : "bg-[#EEF0F2] text-subtle"}`}>
          {alreadyAtp ? `Tahap ${st.status.toUpperCase()}` : st.complete ? "Lengkap" : `${st.items.filter((i) => i.done).length}/${st.items.length}`}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {st.items.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-xs">
            <span className={`mt-0.5 ${i.done ? "text-ok" : "text-faint"}`}>{i.done ? "✓" : "○"}</span>
            <span className="flex-1">
              {i.label} <span className="text-faint">· {i.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {!alreadyAtp && st.complete && canComplete && (
        ask ? (
          <div className="flex items-center gap-2 text-xs">
            <span>Pindahkan proyek ke tahap ATP?</span>
            <button onClick={complete} disabled={busy} className="font-semibold px-2.5 py-1.5 rounded-lg bg-ink text-white disabled:opacity-50">
              {busy ? "Memproses..." : "Ya, lanjut ke ATP"}
            </button>
            <button onClick={() => setAsk(false)} className="text-subtle">Batal</button>
          </div>
        ) : (
          <button onClick={() => setAsk(true)} className="self-start text-xs font-semibold px-3 py-2 rounded-lg bg-ok text-white">
            ✓ Finish RFS lengkap — lanjut ke tahap ATP
          </button>
        )
      )}
      {!alreadyAtp && st.complete && !canComplete && (
        <p className="text-xs text-muted">Lengkap — admin/surveyor dapat memindahkan proyek ke tahap ATP.</p>
      )}
      {msg && <p className="text-xs text-subtle">{msg}</p>}
    </div>
  );
}
