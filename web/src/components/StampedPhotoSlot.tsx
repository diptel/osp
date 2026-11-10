"use client";
import { useRef, useState } from "react";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import { dhash } from "@/lib/dhash";
import type { RecordModel } from "pocketbase";

export type StampedPhoto = RecordModel & {
  file: string;
  purpose?: string;
  seq?: number;
  value_dbm?: number;
  distance_m?: number;
  far?: boolean;
  taken_at?: string;
  pos?: { lat: number; lon: number };
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("GPS tidak tersedia di perangkat ini."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error("GPS: " + e.message)), {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });
  });
}

/**
 * Satu slot foto berstempel GPS (kamera; admin boleh dari galeri/PC):
 * dipakai untuk foto Finish FDT — core feeder (seq), foto akhir FDT, dan
 * cek redaman 1 port FDT (dengan nilai dBm). Posisi GPS wajib ikut supaya
 * server bisa hitung jarak ke titik FDT.
 */
export function StampedPhotoSlot({
  projectId,
  assetId,
  purpose,
  label,
  seq,
  withDbm = false,
  photo,
  allowGallery = false,
  canDelete = false,
  onChange,
}: {
  projectId: string;
  assetId: string;
  purpose: "fdt_feeder" | "fdt_finish" | "fdt_opm";
  label: string;
  seq?: number;
  withDbm?: boolean;
  photo?: StampedPhoto | null;
  allowGallery?: boolean;
  canDelete?: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [dbm, setDbm] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [delAsk, setDelAsk] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const id = `${purpose}-${seq ?? 0}-${assetId}`;

  async function doUpload(file: File, source: "camera" | "gallery", dbmValue?: number) {
    setErr("");
    setBusy("Mengambil posisi GPS...");
    try {
      const pos = await getPosition();
      setBusy("Mengunggah...");
      const phash = await dhash(file);
      const u = currentUser();
      const form = new FormData();
      form.append("file", file, file.name || `${purpose}-${Date.now()}.jpg`);
      form.append("project", projectId);
      form.append("asset", assetId);
      form.append("label", label);
      form.append("source", source);
      form.append("purpose", purpose);
      if (seq != null) form.append("seq", String(seq));
      if (dbmValue != null && !Number.isNaN(dbmValue)) form.append("value_dbm", String(dbmValue));
      form.append("taken_at", new Date().toISOString());
      form.append("pos", JSON.stringify({ lon: pos.coords.longitude, lat: pos.coords.latitude }));
      form.append("accuracy_m", String(Math.round(pos.coords.accuracy || 0)));
      form.append("phash", phash);
      form.append("uploaded_by", u?.id || "");
      await pb().collection("photos").create(form);
      setPending(null);
      setDbm("");
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal mengunggah foto.");
    } finally {
      setBusy("");
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>, source: "camera" | "gallery") {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (withDbm) {
      // minta nilai dBm dulu, baru unggah
      setPending(f);
      return;
    }
    doUpload(f, source);
  }

  async function remove() {
    if (!photo) return;
    setBusy("Menghapus...");
    try {
      await pb().collection("photos").delete(photo.id);
      setDelAsk(false);
      onChange();
    } catch {
      setErr("Gagal menghapus (perlu izin admin/QC).");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-3 flex gap-3">
      <div className="w-24 h-24 rounded-lg bg-[#EEF0F2] overflow-hidden shrink-0 relative">
        {photo ? (
          <a href={fileUrl(photo, photo.file)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(photo, photo.file, "400x0")} alt={label} className="w-full h-full object-cover" />
          </a>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-2xl text-faint">📷</span>
        )}
        {photo && (
          <span className={`absolute bottom-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${photo.far ? "bg-warn text-white" : "bg-ok text-white"}`}>
            {photo.far ? `⚠ ${Math.round(photo.distance_m || 0)} m` : "✓ GPS"}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <p className="text-sm font-semibold">{label}</p>
        {photo ? (
          <p className="text-xs text-muted">
            {photo.taken_at ? new Date(photo.taken_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : ""}
            {withDbm && photo.value_dbm != null ? ` · ${photo.value_dbm} dBm` : ""}
            {photo.distance_m != null ? ` · ${Math.round(photo.distance_m)} m dari titik FDT` : ""}
          </p>
        ) : (
          <p className="text-xs text-faint">Belum ada foto. Ambil dari kamera di lokasi — posisi GPS ikut tersimpan.</p>
        )}

        {pending && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="number"
              step="0.01"
              inputMode="decimal"
              value={dbm}
              onChange={(e) => setDbm(e.target.value)}
              placeholder="nilai dBm, mis. -18.5"
              className="border border-border rounded-lg px-2 py-1.5 text-sm bg-card w-40"
            />
            <button
              onClick={() => doUpload(pending, "camera", Number(dbm))}
              disabled={!dbm || busy !== ""}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-ink text-white disabled:opacity-50"
            >
              Simpan
            </button>
            <button onClick={() => setPending(null)} className="text-xs text-subtle">
              Batal
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" id={`cam-${id}`} onChange={(e) => onPick(e, "camera")} />
          <label htmlFor={`cam-${id}`} className={`cursor-pointer text-xs font-semibold px-2.5 py-1.5 rounded-lg ${photo ? "border border-border" : "bg-ink text-white"} ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            📷 {photo ? "Foto ulang" : "Kamera"}
          </label>
          {allowGallery && (
            <>
              <input ref={galRef} type="file" accept="image/*" className="hidden" id={`gal-${id}`} onChange={(e) => onPick(e, "gallery")} />
              <label htmlFor={`gal-${id}`} className={`cursor-pointer text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border ${busy ? "opacity-50 pointer-events-none" : ""}`}>
                🖼️ File
              </label>
            </>
          )}
          {photo && canDelete && (
            delAsk ? (
              <span className="inline-flex items-center gap-1.5 text-xs">
                Hapus?
                <button onClick={remove} className="font-semibold px-2 py-1 rounded-md bg-warn text-white">Ya</button>
                <button onClick={() => setDelAsk(false)} className="text-subtle">Tidak</button>
              </span>
            ) : (
              <button onClick={() => setDelAsk(true)} className="text-xs text-warn underline">Hapus</button>
            )
          )}
          {busy && <span className="text-xs text-subtle">{busy}</span>}
        </div>
        {err && <p className="text-xs text-warn">{err}</p>}
      </div>
    </div>
  );
}
