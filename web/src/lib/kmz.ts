// Parser KMZ/KML desain (format folder MyRepublic/klien) — versi browser dari
// tools/import_kmz.py. Dipakai di halaman admin "Impor KMZ" supaya Fi bisa
// upload file sendiri tanpa minta Claude proses manual lagi.
import JSZip from "jszip";
import { distanceM } from "./dhash";

export type LonLat = [number, number];

export interface ParsedFdt {
  code: string;
  pos: LonLat;
  desc: string;
}
export interface ParsedFat {
  code: string;
  pos: LonLat;
  line: string;
}
export interface ParsedPole {
  code: string;
  pos: LonLat;
  line: string;
  subtype: string;
}
export interface ParsedSlack {
  code: string;
  pos: LonLat;
  line: string;
}
export interface ParsedHomepass {
  code: string;
  pos: LonLat;
  line: string;
  fat_suffix: string;
}
export interface ParsedCable {
  code: string;
  line: string;
  path: LonLat[];
  kind: "feeder" | "distribution";
  length_m: number | null;
  cable_type: string;
}
export interface ParsedSling {
  code: string;
  line: string;
  path: LonLat[];
  length_m: number | null;
}

export interface ParsedKmz {
  fdt: ParsedFdt[];
  fat: ParsedFat[];
  pole: ParsedPole[];
  slack: ParsedSlack[];
  homepass: ParsedHomepass[];
  cable: ParsedCable[];
  sling: ParsedSling[];
}

/** Baca file .kmz (zip berisi doc.kml) atau .kml mentah, kembalikan elemen root XML. */
export async function loadKml(file: File): Promise<Element> {
  const isKmz = file.name.toLowerCase().endsWith(".kmz");
  let text: string;
  if (isKmz) {
    const zip = await JSZip.loadAsync(file);
    const entry = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".kml"));
    if (!entry) throw new Error("Tidak ada file .kml di dalam .kmz ini.");
    text = await zip.files[entry].async("text");
  } else {
    text = await file.text();
  }
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("File KML/KMZ tidak bisa dibaca (format rusak).");
  if (!doc.documentElement) throw new Error("File KML/KMZ kosong.");
  return doc.documentElement;
}

function child(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) if (c.localName === name) return c;
  return null;
}
function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name);
}
function descendant(el: Element, name: string): Element | null {
  for (const c of Array.from(el.children)) {
    if (c.localName === name) return c;
    const found = descendant(c, name);
    if (found) return found;
  }
  return null;
}
function nameOf(el: Element): string {
  return (child(el, "name")?.textContent || "").trim();
}
function coordsOf(pm: Element): LonLat[] {
  const c = descendant(pm, "coordinates");
  const txt = c?.textContent?.trim();
  if (!txt) return [];
  return txt
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const parts = tok.split(",").map(Number);
      return [parts[0], parts[1]] as LonLat;
    });
}

export function parseKml(root: Element): ParsedKmz {
  const out: ParsedKmz = { fdt: [], fat: [], pole: [], slack: [], homepass: [], cable: [], sling: [] };

  function walk(folder: Element, path: string[]) {
    const here = [...path, nameOf(folder)];
    const upper = here.map((p) => p.toUpperCase());
    const lineEntry = upper.find((p) => p.startsWith("LINE"));
    const line = lineEntry ? lineEntry.replace(/^LINE\s*/, "") : "";
    const top = upper[upper.length - 1] || "";

    for (const pm of children(folder, "Placemark")) {
      const name = nameOf(pm);
      const pts = coordsOf(pm);
      if (!pts.length) continue;
      const desc = (child(pm, "description")?.textContent || "").trim();

      if (top === "FDT") {
        out.fdt.push({ code: name, pos: pts[0], desc });
      } else if (top === "FAT") {
        out.fat.push({ code: name, pos: pts[0], line });
      } else if (top.startsWith("NEW POLE") || top.startsWith("POLE")) {
        out.pole.push({ code: name, pos: pts[0], line, subtype: top.replace(/^(NEW )?POLE\s*/, "") });
      } else if (top.startsWith("SLACK")) {
        out.slack.push({ code: name, pos: pts[0], line });
      } else if (upper.includes("HP COVER")) {
        out.homepass.push({ code: name, pos: pts[0], line, fat_suffix: here[here.length - 1] });
      } else if (top.startsWith("DISTRIBUTION CABLE") || top.startsWith("FEEDER")) {
        const m = name.match(/(\d+)\s*m\b/i);
        const ct = name.match(/FO\s*[\w/]+/i);
        out.cable.push({
          code: name,
          line,
          path: pts,
          kind: top.startsWith("FEEDER") ? "feeder" : "distribution",
          length_m: m ? parseInt(m[1], 10) : null,
          cable_type: ct ? ct[0] : "",
        });
      } else if (top.startsWith("SLING")) {
        const m = name.match(/(\d+)\s*M/i);
        out.sling.push({ code: name, line, path: pts, length_m: m ? parseInt(m[1], 10) : null });
      }
    }
    for (const sub of children(folder, "Folder")) walk(sub, here);
  }

  const docEl = child(root, "Document") || root;
  for (const f of children(docEl, "Folder")) walk(f, []);
  return out;
}

export function geomLengthM(path: LonLat[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += distanceM(path[i], path[i + 1]);
  return Math.round(total);
}

export function kmzStats(data: ParsedKmz) {
  return {
    fdt: data.fdt.length,
    fat: data.fat.length,
    pole: data.pole.length,
    slack: data.slack.length,
    homepass: data.homepass.length,
    cable: data.cable.length,
    sling: data.sling.length,
  };
}
