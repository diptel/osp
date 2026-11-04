"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PB_URL } from "@/lib/pocketbase";
import { buildOpmReportPdf, type OpmReportFat, type OpmReportProject } from "@/lib/opmReportPdf";

type PortalFat = { code: string; line: string; ports: number; ports_ok: number; tests: { port: number; dbm: number }[] };
type PortalData = {
  client: string;
  project: OpmReportProject & { code: string; name: string; status: string; target_date?: string };
  opm: { ports_total: number; ports_approved: number; fats: PortalFat[] };
  packages: { type: string; name: string; unit: string; volume: number; approved_qty: number }[];
  generated_at: string;
};

const STAGE_LABEL: Record<string, string> = {
  draft: "Draf", survei: "Survei", desain: "Desain", berjalan: "Berjalan",
  rfs: "RFS", atp: "ATP", revisi_atp: "Revisi ATP", lunas: "Lunas",
  selesai: "Selesai", ditahan: "Ditahan",
};

export default function PortalKlienPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [err, setErr] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetch(`${PB_URL}/api/briix/portal/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then(setData)
      .catch(() => setErr("Link tidak ditemukan atau sudah tidak berlaku."));
  }, [token]);

  async function downloadPdf() {
    if (!data) return;
    setDownloading(true);
    try {
      const fats: OpmReportFat[] = data.opm.fats
        .filter((f) => f.tests.length > 0)
        .map((f) => ({
          code: f.code.split(".").pop() || f.code,
          line: f.line,
          ports: f.ports,
          tests: f.tests.map((t) => ({ port: t.port, dbm: t.dbm, photoUrl: null })),
        }));
      if (fats.length === 0) {
        alert("Belum ada hasil uji OPM yang disetujui.");
        return;
      }
      const doc = await buildOpmReportPdf({
        project: data.project,
        fats,
        briixLogoUrl: "/app/mark.svg",
        hidePhotos: true,
      });
      doc.save(`Laporan-OPM-${data.project.cluster_name || data.project.code}.pdf`);
    } catch (e) {
      alert("Gagal membuat PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDownloading(false);
    }
  }

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <p className="text-sm text-muted max-w-sm">{err}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <p className="text-sm text-muted">Memuat...</p>
      </div>
    );
  }

  const pct = data.opm.ports_total ? Math.round((data.opm.ports_approved / data.opm.ports_total) * 100) : 0;

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-ink text-white px-5 py-5 flex flex-col gap-1">
        <p className="text-xs text-line2">{data.client}</p>
        <h1 className="text-xl font-semibold">{data.project.cluster_name || data.project.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-[#2A2D35]">
            {STAGE_LABEL[data.project.status] || data.project.status}
          </span>
          <span className="text-xs text-line2 font-mono">{data.project.cluster_id}</span>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-5 flex flex-col gap-5">
        <section className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Uji OPM</h2>
            <span className="text-sm font-mono font-semibold">
              {data.opm.ports_approved}/{data.opm.ports_total} port ({pct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#EEF0F2] overflow-hidden">
            <div className="h-full bg-ok" style={{ width: `${pct}%` }} />
          </div>
          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="self-start mt-1 px-3 py-2 rounded-lg text-xs font-semibold bg-ink text-white disabled:opacity-50"
          >
            {downloading ? "Membuat PDF..." : "⬇ Unduh laporan PDF"}
          </button>
        </section>

        {data.packages.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Progres pekerjaan</h2>
            {data.packages.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-t border-border pt-2 first:border-0 first:pt-0">
                <span>{p.name}</span>
                <span className="font-mono text-muted">
                  {p.approved_qty}/{p.volume} {p.unit}
                </span>
              </div>
            ))}
          </section>
        )}

        <section className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold mb-1">Titik FAT ({data.opm.fats.length})</h2>
          {data.opm.fats.map((f) => (
            <div key={f.code} className="flex items-center justify-between text-sm border-t border-border py-1.5 first:border-0">
              <span className="font-mono">{f.code.split(".").pop()}</span>
              <span className="text-xs text-muted">Line {f.line}</span>
              <span className="font-mono text-xs">{f.ports_ok}/{f.ports}</span>
            </div>
          ))}
        </section>

        <p className="text-[11px] text-faint text-center">
          Diperbarui {new Date(data.generated_at).toLocaleString("id-ID")} · hanya menampilkan data yang sudah disetujui QC
        </p>
      </main>
    </div>
  );
}
