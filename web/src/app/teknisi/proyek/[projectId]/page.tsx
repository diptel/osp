"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { buildOpmReportPdf, fetchOpmReportData } from "@/lib/opmReportPdf";
import type { RecordModel } from "pocketbase";

type Asset = RecordModel & { kind: string; code: string; line: string; ports?: number; subtype?: string };
type OpmTest = RecordModel & { fat: string; port_fat: number; status: string };
type Project = RecordModel & { cluster_name: string; cluster_id: string; status: string };

const STAGE_LABEL: Record<string, string> = {
  draft: "Draf",
  survei: "Survei",
  desain: "Desain",
  berjalan: "Berjalan",
  rfs: "RFS",
  atp: "ATP",
  revisi_atp: "Revisi ATP",
  lunas: "Lunas",
  selesai: "Selesai",
  ditahan: "Ditahan",
};

export default function FatListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [fats, setFats] = useState<Asset[] | null>(null);
  const [tests, setTests] = useState<OpmTest[]>([]);
  const [line, setLine] = useState<string>("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    pb().collection("projects").getOne<Project>(projectId).then(setProject).catch(() => void 0);
    pb()
      .collection("assets")
      .getFullList<Asset>({ filter: `project = "${projectId}" && kind = "fat"`, sort: "line,code" })
      .then((rows) => {
        setFats(rows);
        if (rows.length) setLine((l) => l || rows[0].line || "");
      })
      .catch(() => setFats([]));
    pb()
      .collection("opm_tests")
      .getFullList<OpmTest>({ filter: `project = "${projectId}"` })
      .then(setTests)
      .catch(() => void 0);
  }, [projectId]);

  const lines = useMemo(() => Array.from(new Set((fats || []).map((f) => f.line || "—"))), [fats]);
  const filled = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const t of tests) {
      if (t.status === "rejected") continue;
      if (!m.has(t.fat)) m.set(t.fat, new Set());
      m.get(t.fat)!.add(t.port_fat);
    }
    return m;
  }, [tests]);
  const needsRevision = useMemo(() => {
    const s = new Set<string>();
    for (const t of tests) if (t.status === "rejected") s.add(t.fat);
    return s;
  }, [tests]);

  const visible = (fats || []).filter((f) => (f.line || "—") === line);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const data = await fetchOpmReportData(String(projectId));
      if (data.fats.length === 0) {
        alert("Belum ada hasil uji OPM yang disetujui untuk diunduh.");
        return;
      }
      const doc = await buildOpmReportPdf({
        project: data.project,
        fats: data.fats,
        clientLogoUrl: data.clientLogoUrl,
      });
      doc.save(`Laporan-OPM-${data.clusterName || projectId}.pdf`);
    } catch (e) {
      alert("Gagal membuat PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-ink text-white px-4 pt-4 pb-4 flex flex-col gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <Link href="/teknisi" className="text-white">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-line2">{project?.cluster_id}</p>
            <h1 className="font-semibold leading-tight">{project?.cluster_name || "Memuat..."}</h1>
          </div>
          {project?.status && (
            <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-[#2A2D35] text-white shrink-0">
              {STAGE_LABEL[project.status] || project.status}
            </span>
          )}
        </div>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="self-start text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-white/10 text-white disabled:opacity-50"
        >
          {downloading ? "Membuat PDF..." : "⬇ Unduh laporan PDF"}
        </button>
        {lines.length > 1 && (
          <div className="grid gap-1 p-1 bg-[#2A2D35] rounded-lg" style={{ gridTemplateColumns: `repeat(${lines.length}, minmax(0,1fr))` }}>
            {lines.map((l) => (
              <button
                key={l}
                onClick={() => setLine(l)}
                className={`text-xs font-semibold min-h-9 rounded-md ${
                  line === l ? "bg-white text-ink" : "text-line2"
                }`}
              >
                Line {l} · {(fats || []).filter((f) => (f.line || "—") === l).length}
              </button>
            ))}
          </div>
        )}
      </header>

      <ul className="flex-1 overflow-y-auto flex flex-col gap-2 p-4 min-h-0">
        {fats === null && <p className="text-sm text-muted">Memuat...</p>}
        {fats !== null && visible.length === 0 && <p className="text-sm text-muted">Belum ada titik FAT.</p>}
        {visible.map((f) => {
          const n = filled.get(f.id)?.size || 0;
          const total = f.ports || 8;
          const revisi = needsRevision.has(f.id);
          const color = revisi ? "bg-warn" : n >= total ? "bg-ok" : n > 0 ? "bg-warn" : "bg-faint";
          return (
            <li key={f.id}>
              <Link
                href={`/teknisi/proyek/${projectId}/fat/${f.id}`}
                className={`bg-card border rounded-xl px-3 py-2.5 flex items-center gap-3 ${
                  revisi ? "border-warn" : "border-border"
                }`}
              >
                <span className={`w-3 h-3 rounded-full shrink-0 ${color}`} />
                <span className="flex-1 min-w-0">
                  <span className="font-mono text-[15px] font-semibold block">{f.code}</span>
                  <span className="text-xs text-muted block">
                    {revisi ? (
                      <span className="text-warn font-semibold">⚠ Perlu revisi (ATP)</span>
                    ) : n >= total ? (
                      `Lengkap ${total} port`
                    ) : (
                      `Kurang port ${n + 1}–${total}`
                    )}
                  </span>
                </span>
                <span className="font-mono text-sm font-semibold">
                  {n}/{total}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
