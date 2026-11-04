"use client";
import { useEffect, useRef, useState } from "react";
import { pb, fileUrl } from "@/lib/pocketbase";
import type { RecordModel } from "pocketbase";

type ClientRow = RecordModel & { name: string; code?: string; logo?: string };

export default function KlienPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [busyId, setBusyId] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function load() {
    pb()
      .collection("clients")
      .getFullList<ClientRow>({ sort: "name" })
      .then(setClients)
      .catch(() => setClients([]));
  }

  useEffect(load, []);

  async function onPick(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusyId(id);
    try {
      const form = new FormData();
      form.append("logo", f);
      await pb().collection("clients").update(id, form);
      load();
    } catch (err) {
      alert("Gagal unggah logo: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyId("");
      if (inputRefs.current[id]) inputRefs.current[id]!.value = "";
    }
  }

  return (
    <div className="max-w-2xl flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold">Klien</h1>
        <p className="text-sm text-muted">
          Logo klien dipakai di header laporan PDF uji OPM — unggah sekali, dipakai otomatis untuk semua proyek klien itu.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {clients === null && <p className="text-sm text-muted">Memuat...</p>}
        {clients?.map((c) => (
          <div key={c.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
            <div className="w-24 h-12 rounded-lg border border-dashed border-faint flex items-center justify-center bg-[#FAFAF8] overflow-hidden shrink-0">
              {c.logo ? (
                <img src={fileUrl(c, c.logo, "200x0")} alt="" className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="text-[10px] text-faint">Belum ada</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{c.name}</p>
            </div>
            <input
              ref={(el) => {
                inputRefs.current[c.id] = el;
              }}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => onPick(c.id, e)}
              className="hidden"
              id={`logo-${c.id}`}
            />
            <label
              htmlFor={`logo-${c.id}`}
              className="cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-card"
            >
              {busyId === c.id ? "Mengunggah..." : c.logo ? "Ganti logo" : "+ Unggah logo"}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
