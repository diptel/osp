"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { loadKml, parseKml, kmzStats, geomLengthM, type ParsedKmz } from "@/lib/kmz";
import type { RecordModel } from "pocketbase";

type Project = RecordModel & { cluster_name: string; cluster_id: string; name: string };
type AssetRow = RecordModel & { kind: string; code: string };
type RouteRow = RecordModel & { code: string };

type Result = {
  created: Record<string, number>;
  warnings: string[];
};

export default function KmzImportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedKmz | null>(null);
  const [parseErr, setParseErr] = useState("");
  const [fatPorts, setFatPorts] = useState(8);
  const [makePackages, setMakePackages] = useState(true);
  const [makeMaterials, setMakeMaterials] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [runErr, setRunErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pb()
      .collection("projects")
      .getOne<Project>(projectId)
      .then(setProject)
      .catch(() => void 0);
  }, [projectId]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setParseErr("");
    setParsed(null);
    setResult(null);
    setRunErr("");
    try {
      const root = await loadKml(f);
      const data = parseKml(root);
      if (!data.fdt.length && !data.fat.length && !data.pole.length) {
        setParseErr("Tidak ada FDT/FAT/tiang yang terbaca. Cek struktur folder KMZ (FDT, FAT, POLE, SLACK, HP COVER, DISTRIBUTION CABLE, SLING).");
      }
      setParsed(data);
    } catch (err) {
      setParseErr(err instanceof Error ? err.message : "Gagal membaca file.");
    }
  }

  async function runImport() {
    if (!parsed) return;
    setBusy(true);
    setRunErr("");
    const created: Record<string, number> = {};
    const warnings: string[] = [];
    const bump = (k: string) => (created[k] = (created[k] || 0) + 1);

    try {
      const col = pb().collection("assets");
      const existingAssets = await col.getFullList<AssetRow>({ filter: `project = "${projectId}"` });
      const byKey = new Map(existingAssets.map((a) => [`${a.kind}|${a.code}`, a]));

      async function put(kind: string, code: string, payload: Record<string, unknown>): Promise<AssetRow> {
        const key = `${kind}|${code}`;
        const found = byKey.get(key);
        if (found) return found;
        const rec = await col.create<AssetRow>({ project: projectId, kind, code, status: "rencana", ...payload });
        byKey.set(key, rec);
        bump(kind);
        return rec;
      }

      // ---- FDT ----
      const fdtIds: string[] = [];
      for (const f of parsed.fdt) {
        const cap = f.desc.match(/(\d+)\s*C/);
        const r = await put("fdt", f.code, {
          design_pos: { lon: f.pos[0], lat: f.pos[1] },
          subtype: f.desc,
          ports: cap ? parseInt(cap[1], 10) : 0,
        });
        fdtIds.push(r.id);
      }
      const fdtParent = fdtIds.length === 1 ? fdtIds[0] : "";

      // ---- FAT ----
      const fatBySuffix = new Map<string, string>();
      for (const f of parsed.fat) {
        const r = await put("fat", f.code, {
          design_pos: { lon: f.pos[0], lat: f.pos[1] },
          line: f.line,
          ports: fatPorts,
          subtype: `1x${fatPorts}`,
          parent: fdtParent,
        });
        fatBySuffix.set(f.code.split(".").pop() || f.code, r.id);
      }

      // ---- tiang (dedupe kode dobel -> #2) ----
      const seenPole = new Map<string, number>();
      for (const p of parsed.pole) {
        let code = p.code;
        const n = (seenPole.get(p.code) || 0) + 1;
        seenPole.set(p.code, n);
        if (n > 1) {
          code = `${p.code}#${n}`;
          warnings.push(`Kode tiang dobel di KMZ: ${p.code} -> disimpan sebagai ${code}, cek ke klien`);
        }
        await put("pole", code, { design_pos: { lon: p.pos[0], lat: p.pos[1] }, line: p.line, subtype: p.subtype });
      }

      // ---- slack ----
      for (const s of parsed.slack) {
        await put("slack", s.code, { design_pos: { lon: s.pos[0], lat: s.pos[1] }, line: s.line });
      }

      // ---- homepass ----
      for (const h of parsed.homepass) {
        const code = `${h.fat_suffix}/${h.code}`;
        await put("homepass", code, {
          design_pos: { lon: h.pos[0], lat: h.pos[1] },
          line: h.line,
          parent: fatBySuffix.get(h.fat_suffix) || "",
        });
      }

      // ---- routes (kabel + sling) ----
      const routeCol = pb().collection("routes");
      const existingRoutes = await routeCol.getFullList<RouteRow>({ filter: `project = "${projectId}"` });
      const haveRoutes = new Set(existingRoutes.map((r) => r.code));
      for (const c of [...parsed.cable, ...parsed.sling]) {
        if (haveRoutes.has(c.code)) continue;
        const geom = geomLengthM(c.path);
        const cableType = "cable_type" in c ? c.cable_type : "";
        const cores = cableType.match(/(\d+)\s*C/);
        await routeCol.create({
          project: projectId,
          kind: "kind" in c ? c.kind : "sling",
          code: c.code,
          line: c.line,
          cable_type: cableType,
          cores: cores ? parseInt(cores[1], 10) : 0,
          length_m: c.length_m ?? geom,
          length_geom_m: geom,
          path: c.path.map(([lon, lat]) => [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7]),
        });
        bump("route");
      }

      // ---- work_packages (opsional, cuma kalau proyek belum punya) ----
      if (makePackages) {
        const pkgCol = pb().collection("work_packages");
        const existingPkgs = await pkgCol.getFullList({ filter: `project = "${projectId}"` });
        if (existingPkgs.length === 0) {
          const lines = Array.from(new Set(parsed.fat.map((f) => f.line))).sort();
          const cableLenByLine = new Map<string, number>();
          for (const c of parsed.cable) cableLenByLine.set(c.line, (cableLenByLine.get(c.line) || 0) + (c.length_m || 0));
          const pkgs: { type: string; name: string; line: string; unit: string; volume: number }[] = [];
          for (const ln of lines) {
            pkgs.push({ type: "kabel", name: `Tarik kabel Line ${ln}`, line: ln, unit: "m", volume: cableLenByLine.get(ln) || 0 });
            pkgs.push({
              type: "tiang",
              name: `Tanam tiang Line ${ln}`,
              line: ln,
              unit: "tiang",
              volume: parsed.pole.filter((p) => p.line === ln).length,
            });
          }
          pkgs.push({ type: "jointing", name: "Jointing FDT + FAT", line: "", unit: "titik", volume: parsed.fdt.length + parsed.fat.length });
          pkgs.push({ type: "opm", name: "Uji OPM per port FAT", line: "", unit: "port", volume: parsed.fat.length * fatPorts });
          for (const p of pkgs) {
            await pkgCol.create({ project: projectId, ...p, executor_type: "tim", status: "rencana" });
            bump("work_packages");
          }
        }
      }

      // ---- materials (opsional) ----
      if (makeMaterials) {
        const matCol = pb().collection("materials");
        const existingMats = await matCol.getFullList<RecordModel & { kmz_key: string }>({ filter: `project = "${projectId}"` });
        const haveKeys = new Set(existingMats.map((m) => m.kmz_key));
        const mats: { kmz_key: string; name: string; unit: string; need_qty: number }[] = [];
        for (const c of parsed.cable) {
          mats.push({ kmz_key: `cable:${c.line}`, name: `Kabel ${c.cable_type || "FO"} (Line ${c.line})`, unit: "m", need_qty: c.length_m || 0 });
        }
        const subtypes = Array.from(new Set(parsed.pole.map((p) => p.subtype))).sort();
        for (const st of subtypes) {
          mats.push({ kmz_key: `pole:${st}`, name: `Tiang ${st}`, unit: "batang", need_qty: parsed.pole.filter((p) => p.subtype === st).length });
        }
        mats.push({ kmz_key: "fat", name: `FAT 1:${fatPorts}`, unit: "unit", need_qty: parsed.fat.length });
        mats.push({ kmz_key: "slack", name: "Slack hanger", unit: "unit", need_qty: parsed.slack.length });
        for (const m of mats) {
          if (haveKeys.has(m.kmz_key)) continue;
          await matCol.create({ project: projectId, ...m, source: "briix" });
          bump("materials");
        }
      }

      setResult({ created, warnings });
    } catch (err) {
      setRunErr(err instanceof Error ? err.message : "Impor gagal di tengah jalan — cek koneksi lalu coba lagi (aman diulang, data yang sudah masuk tidak akan dobel).");
    } finally {
      setBusy(false);
    }
  }

  const stats = parsed ? kmzStats(parsed) : null;
  const input = "w-full rounded-lg border border-line2 px-3 py-2.5 text-sm outline-none focus:border-accent bg-card";

  return (
    <div className="max-w-xl flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Impor desain KMZ</h1>
          <p className="text-sm text-muted">
            {project ? `${project.cluster_name || project.name} ${project.cluster_id ? "· " + project.cluster_id : ""}` : "Memuat proyek..."}
          </p>
        </div>
        <Link href="/admin" className="text-xs text-accent underline shrink-0 mt-1">
          Lewati, desain sendiri nanti
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-subtle">
          File KMZ/KML dari klien
          <input ref={inputRef} type="file" accept=".kmz,.kml" onChange={onFile} className="text-sm" />
        </label>
        {fileName && <p className="text-xs text-muted">{fileName}</p>}
        {parseErr && <p className="text-sm text-warn">{parseErr}</p>}

        {stats && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {Object.entries(stats).map(([k, v]) => (
              <div key={k} className="bg-surface rounded-lg py-2">
                <div className="font-mono text-base font-semibold">{v}</div>
                <div className="text-[10px] text-muted uppercase">{k}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {parsed && !result && (
        <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4">
          <label className={`flex flex-col gap-1.5 text-sm font-medium text-subtle`}>
            Jumlah port tiap FAT
            <input
              type="number"
              min={1}
              max={64}
              value={fatPorts}
              onChange={(e) => setFatPorts(Number(e.target.value) || 8)}
              className={input}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={makePackages} onChange={(e) => setMakePackages(e.target.checked)} />
            Buat paket kerja default (tarik kabel, tanam tiang, jointing, uji OPM per line)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={makeMaterials} onChange={(e) => setMakeMaterials(e.target.checked)} />
            Isi kebutuhan material dari KMZ (kabel, tiang, FAT, slack)
          </label>
          <p className="text-xs text-faint">
            Aman dijalankan ulang — titik/kabel yang kodenya sudah ada di proyek ini akan dilewati, tidak dobel.
          </p>
          {runErr && <p className="text-sm text-warn">{runErr}</p>}
          <button
            onClick={runImport}
            disabled={busy}
            className="min-h-[46px] rounded-xl bg-ink text-white font-semibold text-sm disabled:opacity-60"
          >
            {busy ? "Mengimpor..." : "Impor ke proyek"}
          </button>
        </div>
      )}

      {result && (
        <div className="bg-okbg border border-ok/30 rounded-xl p-4 flex flex-col gap-2">
          <p className="font-semibold text-[#17402B]">Impor selesai</p>
          <ul className="text-sm text-[#17402B] flex flex-col gap-0.5">
            {Object.entries(result.created).map(([k, v]) => (
              <li key={k}>
                {k}: {v} dibuat
              </li>
            ))}
            {Object.keys(result.created).length === 0 && <li>Tidak ada data baru — semua sudah ada di proyek ini.</li>}
          </ul>
          {result.warnings.length > 0 && (
            <div className="mt-2 text-sm text-warn flex flex-col gap-0.5">
              {result.warnings.map((w, i) => (
                <p key={i}>⚠ {w}</p>
              ))}
            </div>
          )}
          <Link href={`/admin`} className="text-sm text-accent underline mt-2">
            Kembali ke dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
