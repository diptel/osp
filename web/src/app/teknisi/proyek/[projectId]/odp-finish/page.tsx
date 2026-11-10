"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb, currentUser } from "@/lib/pocketbase";
import { FdtFinishPanel, RfsChecklist } from "@/components/FdtFinishPanel";
import type { RecordModel } from "pocketbase";

type Asset = RecordModel & { code: string; line: string; ports?: number };
type OpmTest = RecordModel & { fat: string; port_fat: number; status: string };
type Photo = RecordModel & { asset: string };

export default function FatFinishListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [fats, setFats] = useState<Asset[] | null>(null);
  const [tests, setTests] = useState<OpmTest[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [tab, setTab] = useState<"fat" | "fdt">("fat");
  const role = currentUser()?.role;
  const canComplete = role === "admin" || role === "surveyor";

  useEffect(() => {
    pb()
      .collection("assets")
      .getFullList<Asset>({ filter: `project = "${projectId}" && kind = "fat"`, sort: "line,code" })
      .then(setFats)
      .catch(() => setFats([]));
    pb()
      .collection("opm_tests")
      .getFullList<OpmTest>({ filter: `project = "${projectId}" && status = "approved"` })
      .then(setTests)
      .catch(() => void 0);
    pb()
      .collection("photos")
      .getFullList<Photo>({ filter: `project = "${projectId}" && purpose = "fat_finish"` })
      .then(setPhotos)
      .catch(() => void 0);
  }, [projectId]);

  const approvedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tests) m.set(t.fat, (m.get(t.fat) || 0) + 1);
    return m;
  }, [tests]);
  const finishCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of photos) m.set(p.asset, (m.get(p.asset) || 0) + 1);
    return m;
  }, [photos]);

  const eligible = (fats || []).filter((f) => (approvedCount.get(f.id) || 0) >= (f.ports || 8));
  const notYet = (fats || []).filter((f) => (approvedCount.get(f.id) || 0) < (f.ports || 8));

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-ink text-white px-3 pt-3.5 pb-4 flex items-start gap-2 shrink-0">
        <Link href={`/teknisi/proyek/${projectId}`} className="w-11 h-11 flex items-center justify-center -ml-2 -mt-1 shrink-0 text-white">
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="font-semibold leading-tight">Finish RFS</h1>
          <p className="text-xs text-line2 mt-0.5">
            Syarat setelah RFS: foto Finish tiap FAT + foto Finish FDT. Lengkap → proyek lanjut ke tahap ATP.
          </p>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-1 p-1 mx-4 mt-3 bg-[#EEF0F2] rounded-lg shrink-0">
        {(
          [
            ["fat", "Foto Finish FAT"],
            ["fdt", "Foto Finish FDT"],
          ] as ["fat" | "fdt", string][]
        ).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`text-xs font-semibold min-h-9 rounded-md ${tab === k ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="px-4 pt-3 shrink-0">
        <RfsChecklist projectId={String(projectId)} canComplete={canComplete} />
      </div>
      {tab === "fdt" && (
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <FdtFinishPanel projectId={String(projectId)} isAdmin={false} />
        </div>
      )}
      <ul className={`flex-1 overflow-y-auto flex flex-col gap-2 p-4 min-h-0 ${tab === "fdt" ? "hidden" : ""}`}>
        {fats === null && <p className="text-sm text-muted">Memuat...</p>}
        {fats !== null && eligible.length === 0 && (
          <p className="text-sm text-muted">Belum ada FAT yang semua port-nya terverifikasi QC.</p>
        )}
        {eligible.map((f) => {
          const n = finishCount.get(f.id) || 0;
          return (
            <li key={f.id}>
              <Link
                href={`/teknisi/proyek/${projectId}/odp-finish/${f.id}`}
                className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3"
              >
                <span className={`w-3 h-3 rounded-full shrink-0 ${n > 0 ? "bg-ok" : "bg-faint"}`} />
                <span className="flex-1 min-w-0">
                  <span className="font-mono text-[15px] font-semibold block">{f.code}</span>
                  <span className="text-xs text-muted block">{n > 0 ? `${n} foto` : "Belum ada foto"}</span>
                </span>
                <span className="text-subtle">›</span>
              </Link>
            </li>
          );
        })}
        {notYet.length > 0 && (
          <>
            <p className="text-xs text-faint mt-2">FAT yang belum lengkap/terverifikasi ({notYet.length}):</p>
            {notYet.map((f) => (
              <div key={f.id} className="px-3 py-2 text-xs text-faint font-mono">
                {f.code} · {approvedCount.get(f.id) || 0}/{f.ports || 8} port
              </div>
            ))}
          </>
        )}
      </ul>
    </div>
  );
}
