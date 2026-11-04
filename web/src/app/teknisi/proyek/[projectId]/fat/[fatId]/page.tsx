"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { pb, currentUser, fileUrl } from "@/lib/pocketbase";
import { dhash, distanceM, getPosition, bestPos } from "@/lib/dhash";
import type { RecordModel } from "pocketbase";

type Asset = RecordModel & {
  code: string;
  line: string;
  ports?: number;
  design_pos?: { lon: number; lat: number };
  asbuilt_pos?: { lon: number; lat: number };
  project: string;
};
type Project = RecordModel & { cluster_id: string; fdt_input_dbm?: number; gps_tolerance_m?: number };
type OpmTest = RecordModel & {
  port_fat: number;
  opm_dbm: number;
  status: string;
  qc_note?: string;
  expand?: { photo?: RecordModel & { file: string } };
};

export default function UjiOpmPage() {
  const { projectId, fatId } = useParams<{ projectId: string; fatId: string }>();
  const [fat, setFat] = useState<Asset | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tests, setTests] = useState<OpmTest[]>([]);
  const [port, setPort] = useState<number | null>(null);
  const [dbm, setDbm] = useState("");
  const [preview, setPreview] = useState<string>("");
  const [checks, setChecks] = useState<{ okGps: boolean | null; distance: number | null; note: string }>({
    okGps: null,
    distance: null,
    note: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [phash, setPhash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function load() {
    pb().collection("assets").getOne<Asset>(fatId).then(setFat).catch(() => void 0);
    pb().collection("projects").getOne<Project>(projectId).then(setProject).catch(() => void 0);
    pb()
      .collection("opm_tests")
      .getFullList<OpmTest>({ filter: `fat = "${fatId}"`, sort: "port_fat", expand: "photo" })
      .then((rows) => {
        setTests(rows);
        const total = fat?.ports || 8;
        // port dianggap "selesai" kecuali statusnya rejected (perlu diuji ulang)
        const filledSet = new Set(rows.filter((r) => r.status !== "rejected").map((r) => r.port_fat));
        let next = 1;
        while (filledSet.has(next) && next <= total) next++;
        setPort((p) => p ?? Math.min(next, total));
      })
      .catch(() => void 0);
  }

  useEffect(load, [fatId]);

  const total = fat?.ports || 8;
  const byPort = useMemo(() => {
    const m = new Map<number, OpmTest>();
    for (const t of tests) m.set(t.port_fat, t);
    return m;
  }, [tests]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr("");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    try {
      const h = await dhash(f);
      setPhash(h);
    } catch {
      setPhash("");
    }
    try {
      const pos = await getPosition();
      const here: [number, number] = [pos.coords.longitude, pos.coords.latitude];
      const target = bestPos(fat?.asbuilt_pos, fat?.design_pos);
      if (target) {
        const d = distanceM(here, [target.lon, target.lat]);
        const tol = project?.gps_tolerance_m || 50;
        setChecks({ okGps: d <= tol, distance: d, note: `Lokasi ${d.toFixed(0)} m dari titik ${fat?.code} (batas ${tol} m)` });
      } else {
        setChecks({ okGps: null, distance: null, note: "Titik belum punya koordinat as-built/desain." });
      }
      (window as unknown as { __opmPos?: GeolocationPosition }).__opmPos = pos;
    } catch {
      setChecks({ okGps: null, distance: null, note: "Gagal membaca lokasi GPS." });
    }
  }

  async function onSave() {
    if (!file || port == null || !dbm) return;
    setErr("");
    setBusy(true);
    try {
      const u = currentUser();
      const pos = (window as unknown as { __opmPos?: GeolocationPosition }).__opmPos;
      const photoForm = new FormData();
      photoForm.append("project", projectId);
      photoForm.append("asset", fatId);
      photoForm.append("file", file);
      photoForm.append("label", `Port ${port}`);
      photoForm.append("taken_at", new Date().toISOString());
      if (pos) {
        photoForm.append("pos", JSON.stringify({ lon: pos.coords.longitude, lat: pos.coords.latitude }));
        photoForm.append("accuracy_m", String(pos.coords.accuracy || 0));
      }
      photoForm.append("source", "camera");
      photoForm.append("phash", phash);
      if (checks.distance != null) photoForm.append("distance_m", String(checks.distance));
      photoForm.append("far", String(checks.okGps === false));
      photoForm.append("uploaded_by", u?.id || "");
      const photo = await pb().collection("photos").create(photoForm);

      const payload = {
        project: projectId,
        fat: fatId,
        port_fat: port,
        opm_dbm: Number(dbm),
        input_fdt_dbm: project?.fdt_input_dbm,
        photo: photo.id,
        tested_at: new Date().toISOString(),
        tested_by: u?.id,
        status: "submitted",
      };
      if (existing && existing.status === "rejected") {
        // uji ulang port yang ditandai revisi — update record lama (sesuai updateRule)
        await pb().collection("opm_tests").update(existing.id, payload);
      } else {
        await pb().collection("opm_tests").create(payload);
      }

      setFile(null);
      setPreview("");
      setDbm("");
      setPhash("");
      if (inputRef.current) inputRef.current.value = "";
      setPort((p) => (p != null && p < total ? p + 1 : p));
      load();
    } catch {
      setErr("Gagal menyimpan. Foto mungkin duplikat atau port sudah terisi.");
    } finally {
      setBusy(false);
    }
  }

  const existing = port != null ? byPort.get(port) : undefined;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="bg-card border-b border-border px-3 pt-3.5 pb-2.5 flex items-center gap-2 shrink-0">
        <Link href={`/teknisi/proyek/${projectId}`} className="w-11 h-11 flex items-center justify-center -ml-2">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-subtle">
            Uji OPM · Line {fat?.line} · FDT {project?.cluster_id}
          </p>
          <h1 className="font-mono text-[17px] leading-tight">{fat?.code || "..."}</h1>
        </div>
        <span className="font-mono text-xs font-semibold bg-warnbg text-warn px-2 py-1 rounded-md">
          {tests.filter((t) => t.status !== "rejected").length}/{total} port
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
        <section className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const t = byPort.get(n);
            const active = port === n;
            const cls = active
              ? "border-2 border-ink bg-white text-ink"
              : t && t.status === "rejected"
              ? "border border-warn bg-warnbg text-warn"
              : t
              ? "border border-ok bg-okbg text-[#17402B]"
              : "border border-dashed border-faint bg-white text-subtle";
            return (
              <button
                key={n}
                onClick={() => {
                  setPort(n);
                  setFile(null);
                  setPreview("");
                  setDbm(t ? String(t.opm_dbm) : "");
                }}
                className={`flex flex-col items-center gap-0.5 min-h-[52px] rounded-lg text-xs ${cls}`}
              >
                <span className="text-[11px] font-semibold">Port {n}</span>
                <span className="font-mono text-[13px] font-semibold">{t ? t.opm_dbm : "—"}</span>
              </button>
            );
          })}
        </section>

        <figure className="m-0 relative h-[170px] rounded-2xl overflow-hidden bg-[#23262D] flex items-center justify-center">
          {preview ? (
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : existing?.expand?.photo ? (
            <label className="w-full h-full cursor-pointer relative block">
              <img
                src={fileUrl(existing.expand.photo, existing.expand.photo.file, "400x0")}
                alt=""
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1.5 right-1.5 bg-ink/80 text-white text-[10px] font-semibold px-2 py-1 rounded-md">
                ✓ Foto ada · ketuk untuk ganti
              </span>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPick}
                className="hidden"
              />
            </label>
          ) : (
            <label className="w-[120px] h-[120px] border-2 border-dashed border-faint rounded-xl flex items-center justify-center text-center text-line2 text-xs p-2 cursor-pointer">
              Ambil foto · Port {port}
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPick}
                className="hidden"
              />
            </label>
          )}
        </figure>

        {preview && (
          <ul className="list-none m-0 p-2.5 bg-card border border-border rounded-xl flex flex-col gap-1.5 text-[13px]">
            <li className="flex gap-2 items-start">
              <span className={checks.okGps === false ? "text-warn font-bold" : "text-ok font-bold"}>
                {checks.okGps === false ? "!" : "✓"}
              </span>
              <span>{checks.note || "Memeriksa lokasi..."}</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="text-ok font-bold">✓</span>
              <span>Diambil langsung dari kamera</span>
            </li>
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-subtle">
            OPM test Port {port} (dBm)
            <input
              type="text"
              inputMode="decimal"
              value={dbm}
              onChange={(e) => setDbm(e.target.value)}
              placeholder="-19.74"
              className="font-mono text-base font-semibold px-2.5 py-2.5 border border-line2 rounded-lg bg-card"
            />
          </label>
          <div className="flex flex-col gap-1 text-xs font-semibold text-subtle">
            Input FDT
            <div className="font-mono text-base font-semibold px-2.5 py-2.5 border border-line2 rounded-lg bg-[#F5F6F3]">
              {project?.fdt_input_dbm ?? "—"}
            </div>
          </div>
        </div>
        {existing && existing.status === "rejected" && (
          <div className="p-2.5 bg-warnbg border border-warn rounded-xl text-xs text-warn flex flex-col gap-1">
            <p className="font-semibold">⚠ Perlu revisi (ATP)</p>
            <p>{existing.qc_note || "Admin menandai port ini perlu diuji/disambung ulang."}</p>
          </div>
        )}
        {existing && existing.status !== "rejected" && (
          <p className="text-xs text-muted">
            Status sebelumnya: <strong>{existing.status}</strong>
          </p>
        )}
        {err && <p className="text-xs text-warn">{err}</p>}
      </div>

      <div className="p-3 bg-card border-t border-border grid grid-cols-2 gap-2.5 shrink-0">
        <button
          onClick={() => {
            setFile(null);
            setPreview("");
            if (inputRef.current) inputRef.current.value = "";
            inputRef.current?.click();
          }}
          className="min-h-[50px] rounded-xl border border-line2 bg-card font-semibold text-sm"
        >
          Foto ulang
        </button>
        <button
          onClick={onSave}
          disabled={!file || !dbm || busy}
          className="min-h-[50px] rounded-xl bg-ink text-white font-semibold text-sm disabled:opacity-50"
        >
          {busy ? "Menyimpan..." : port! < total ? `Simpan · lanjut Port ${port! + 1}` : "Simpan"}
        </button>
      </div>
    </div>
  );
}
