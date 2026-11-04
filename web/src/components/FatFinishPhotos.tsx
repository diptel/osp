"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import { dhash } from "@/lib/dhash";
import type { RecordModel } from "pocketbase";

type PhotoRow = RecordModel & { file: string; label?: string };

/**
 * Galeri foto "FAT Finish" — dokumentasi FAT yang sudah selesai & semua
 * port-nya terverifikasi, syarat tambahan setelah RFS. Beda dari foto uji
 * OPM per port: boleh diimpor dari galeri HP / file PC, tidak wajib kamera.
 *
 * `allowPaste`: aktifkan tempel gambar dari clipboard (Ctrl+V) — dipakai di
 * halaman admin (web, biasa ada clipboard berisi screenshot/gambar).
 * `canDelete`: tampilkan tombol hapus (hanya admin/QC yang punya izin hapus foto).
 */
export function FatFinishPhotos({
  projectId,
  fatId,
  allowPaste = false,
  canDelete = false,
}: {
  projectId: string;
  fatId: string;
  allowPaste?: boolean;
  canDelete?: boolean;
}) {
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  function load() {
    pb()
      .collection("photos")
      .getFullList<PhotoRow>({
        filter: `asset = "${fatId}" && purpose = "fat_finish"`,
        sort: "-created",
      })
      .then(setPhotos)
      .catch(() => setPhotos([]));
  }

  useEffect(load, [fatId]);

  const upload = useCallback(
    async (file: File | Blob) => {
      setErr("");
      setBusy(true);
      try {
        const phash = await dhash(file);
        const u = currentUser();
        const form = new FormData();
        const name = file instanceof File ? file.name : `fat-finish-${Date.now()}.jpg`;
        form.append("file", file, name);
        form.append("project", projectId);
        form.append("asset", fatId);
        form.append("label", "FAT Finish");
        form.append("source", "gallery");
        form.append("purpose", "fat_finish");
        form.append("taken_at", new Date().toISOString());
        form.append("phash", phash);
        form.append("uploaded_by", u?.id || "");
        await pb().collection("photos").create(form);
        load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Gagal mengunggah foto.");
      } finally {
        setBusy(false);
      }
    },
    [projectId, fatId]
  );

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) upload(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  useEffect(() => {
    if (!allowPaste) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            upload(blob);
            e.preventDefault();
          }
          break;
        }
      }
    }
    const el = zoneRef.current;
    el?.addEventListener("paste", onPaste as EventListener);
    return () => el?.removeEventListener("paste", onPaste as EventListener);
  }, [allowPaste, upload]);

  async function onDelete(id: string) {
    if (!confirm("Hapus foto ini?")) return;
    try {
      await pb().collection("photos").delete(id);
      load();
    } catch {
      alert("Gagal menghapus (perlu izin admin).");
    }
  }

  return (
    <div
      ref={zoneRef}
      tabIndex={allowPaste ? 0 : undefined}
      className={`flex flex-col gap-2 ${allowPaste ? "outline-none" : ""}`}
    >
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" id={`fat-finish-${fatId}`} />
        <label
          htmlFor={`fat-finish-${fatId}`}
          className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white"
        >
          {busy ? "Mengunggah..." : "+ Tambah foto"}
        </label>
        {allowPaste && (
          <span className="text-xs text-muted">
            atau klik area ini lalu <kbd className="px-1 py-0.5 bg-[#EEF0F2] rounded text-[11px]">Ctrl+V</kbd> untuk tempel gambar
          </span>
        )}
      </div>
      {err && <p className="text-xs text-warn">{err}</p>}
      {photos === null && <p className="text-xs text-muted">Memuat...</p>}
      {photos?.length === 0 && <p className="text-xs text-muted">Belum ada foto finish untuk FAT ini.</p>}
      {photos && photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative group">
              <a href={fileUrl(p, p.file)} target="_blank" rel="noreferrer">
                <img
                  src={fileUrl(p, p.file, "200x200")}
                  alt=""
                  className="w-full aspect-square object-cover rounded-lg border border-border"
                />
              </a>
              {canDelete && (
                <button
                  onClick={() => onDelete(p.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-ink/80 text-white text-xs leading-5 text-center"
                  title="Hapus"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
