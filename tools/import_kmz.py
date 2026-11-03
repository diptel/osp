#!/usr/bin/env python3
"""Impor KMZ desain (format MyRepublic/klien) ke proyek BRIIX OSP.

Membuat:
  - assets  : FDT, FAT (per line), tiang (per tipe), slack hanger, homepass
  - routes  : kabel distribusi per line, sling wire
  - work_packages (opsional --packages): kabel & tiang per line, jointing, uji OPM
  - materials (opsional --materials): kebutuhan kabel, tiang, FAT, slack dari KMZ

Pemakaian:
  python3 import_kmz.py --pb http://127.0.0.1:8090 --email admin@x --password ... \
      --project <id proyek> --kmz desain.kmz --packages --materials

Aman dijalankan ulang: titik/kabel yang kodenya sudah ada akan dilewati.
"""
import argparse
import math
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

from pbclient import PB


def load_kml(path):
    if path.lower().endswith(".kmz"):
        with zipfile.ZipFile(path) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".kml"))
            return ET.fromstring(z.read(name))
    return ET.parse(path).getroot()


def haversine(a, b):
    R = 6371000
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def parse(root):
    K = root.tag.split("}")[0] + "}" if root.tag.startswith("{") else ""
    nm = lambda e: (e.findtext(K + "name") or "").strip()

    def coords(pm):
        c = pm.find(".//" + K + "coordinates")
        return [tuple(map(float, x.split(",")[:2])) for x in c.text.split()] if c is not None else []

    out = {"fdt": [], "fat": [], "pole": [], "slack": [], "homepass": [], "cable": [], "sling": []}

    def walk(folder, path):
        here = path + [nm(folder)]
        upper = [p.upper() for p in here]
        line = next((re.sub(r"^LINE\s*", "", p) for p in upper if p.startswith("LINE")), "")
        top = upper[-1]
        for pm in folder.findall(K + "Placemark"):
            name, pts = nm(pm), coords(pm)
            if not pts:
                continue
            desc = (pm.findtext(K + "description") or "").strip()
            if top == "FDT":
                out["fdt"].append({"code": name, "pos": pts[0], "desc": desc})
            elif top == "FAT":
                out["fat"].append({"code": name, "pos": pts[0], "line": line})
            elif top.startswith("NEW POLE") or top.startswith("POLE"):
                out["pole"].append({"code": name, "pos": pts[0], "line": line,
                                    "subtype": re.sub(r"^(NEW )?POLE\s*", "", top)})
            elif top.startswith("SLACK"):
                out["slack"].append({"code": name, "pos": pts[0], "line": line})
            elif "HP COVER" in upper:
                out["homepass"].append({"code": name, "pos": pts[0], "line": line, "fat_suffix": here[-1]})
            elif top.startswith("DISTRIBUTION CABLE") or top.startswith("FEEDER"):
                m = re.search(r"(\d+)\s*m\b", name, re.I)
                ct = re.search(r"FO\s*[\w/]+", name, re.I)
                out["cable"].append({"code": name, "line": line, "path": pts,
                                     "kind": "feeder" if top.startswith("FEEDER") else "distribution",
                                     "length_m": int(m.group(1)) if m else None,
                                     "cable_type": ct.group(0) if ct else ""})
            elif top.startswith("SLING"):
                m = re.search(r"(\d+)\s*M", name, re.I)
                out["sling"].append({"code": name, "line": line, "path": pts,
                                     "length_m": int(m.group(1)) if m else None})
        for sub in folder.findall(K + "Folder"):
            walk(sub, here)

    doc = root.find(K + "Document") if root.find(K + "Document") is not None else root
    for f in doc.findall(K + "Folder"):
        walk(f, [])
    return out


def geo(p):
    return {"lon": p[0], "lat": p[1]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pb", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--project", required=True)
    ap.add_argument("--kmz", required=True)
    ap.add_argument("--fat-ports", type=int, default=8)
    ap.add_argument("--packages", action="store_true", help="buat paket kerja default dari volume KMZ")
    ap.add_argument("--materials", action="store_true", help="isi kebutuhan material dari KMZ")
    a = ap.parse_args()

    pb = PB(a.pb, a.email, a.password)
    pid = a.project
    pb.req("GET", f"/api/collections/projects/records/{pid}")
    data = parse(load_kml(a.kmz))
    existing = {(r["kind"], r["code"]): r for r in pb.list("assets", f'project="{pid}"')}
    stats = {}
    warnings = []

    def put(kind, code, payload):
        key = (kind, code)
        if key in existing:
            return existing[key]
        rec = pb.create("assets", {"project": pid, "kind": kind, "code": code, "status": "rencana", **payload})
        existing[key] = rec
        stats[kind] = stats.get(kind, 0) + 1
        return rec

    fdt_ids = []
    for f in data["fdt"]:
        cap = re.search(r"(\d+)\s*C", f["desc"] or "")
        r = put("fdt", f["code"], {"design_pos": geo(f["pos"]), "subtype": f["desc"],
                                   "ports": int(cap.group(1)) if cap else 0})
        fdt_ids.append(r["id"])
    parent = fdt_ids[0] if len(fdt_ids) == 1 else ""
    fat_by_suffix = {}
    for f in data["fat"]:
        r = put("fat", f["code"], {"design_pos": geo(f["pos"]), "line": f["line"],
                                   "ports": a.fat_ports, "subtype": f"1x{a.fat_ports}", "parent": parent})
        fat_by_suffix[f["code"].split(".")[-1]] = r["id"]
    seen = {}
    for p in data["pole"]:
        code = p["code"]
        seen[code] = seen.get(code, 0) + 1
        if seen[code] > 1:
            code = f"{code}#{seen[code]}"
            warnings.append(f"Kode tiang dobel di KMZ: {p['code']} -> disimpan sebagai {code}, cek ke klien")
        put("pole", code, {"design_pos": geo(p["pos"]), "line": p["line"], "subtype": p["subtype"]})
    for s in data["slack"]:
        put("slack", s["code"], {"design_pos": geo(s["pos"]), "line": s["line"]})
    for h in data["homepass"]:
        code = f'{h["fat_suffix"]}/{h["code"]}'
        put("homepass", code, {"design_pos": geo(h["pos"]), "line": h["line"],
                               "parent": fat_by_suffix.get(h["fat_suffix"], "")})

    have_routes = {r["code"] for r in pb.list("routes", f'project="{pid}"')}
    for c in data["cable"] + data["sling"]:
        if c["code"] in have_routes:
            continue
        geom = round(sum(haversine(c["path"][i], c["path"][i + 1]) for i in range(len(c["path"]) - 1)))
        cores = re.search(r"(\d+)\s*C", c.get("cable_type", ""))
        pb.create("routes", {
            "project": pid, "kind": c.get("kind", "sling"), "code": c["code"], "line": c["line"],
            "cable_type": c.get("cable_type", ""), "cores": int(cores.group(1)) if cores else 0,
            "length_m": c["length_m"] or geom, "length_geom_m": geom,
            "path": [[round(x, 7), round(y, 7)] for x, y in c["path"]],
        })
        stats["route"] = stats.get("route", 0) + 1

    lines = sorted({f["line"] for f in data["fat"]})
    cable_len = {}
    for c in data["cable"]:
        cable_len[c["line"]] = cable_len.get(c["line"], 0) + (c["length_m"] or 0)

    if a.packages and not pb.list("work_packages", f'project="{pid}"'):
        pk = []
        for ln in lines:
            pk.append(("kabel", f"Tarik kabel Line {ln}", ln, "m", cable_len.get(ln, 0)))
            pk.append(("tiang", f"Tanam tiang Line {ln}", ln, "tiang", sum(1 for p in data["pole"] if p["line"] == ln)))
        pk.append(("jointing", "Jointing FDT + FAT", "", "titik", len(data["fdt"]) + len(data["fat"])))
        pk.append(("opm", "Uji OPM per port FAT", "", "port", len(data["fat"]) * a.fat_ports))
        for t, name, ln, unit, vol in pk:
            pb.create("work_packages", {"project": pid, "type": t, "name": name, "line": ln, "unit": unit,
                                        "volume": vol, "executor_type": "tim", "status": "rencana"})
        stats["work_packages"] = len(pk)

    if a.materials:
        have = {m["kmz_key"] for m in pb.list("materials", f'project="{pid}"')}
        mats = []
        for c in data["cable"]:
            mats.append((f'cable:{c["line"]}', f'Kabel {c["cable_type"] or "FO"} (Line {c["line"]})', "m", c["length_m"] or 0))
        for st in sorted({p["subtype"] for p in data["pole"]}):
            mats.append((f"pole:{st}", f"Tiang {st}", "batang", sum(1 for p in data["pole"] if p["subtype"] == st)))
        mats.append(("fat", f"FAT 1:{a.fat_ports}", "unit", len(data["fat"])))
        mats.append(("slack", "Slack hanger", "unit", len(data["slack"])))
        for key, name, unit, qty in mats:
            if key not in have:
                pb.create("materials", {"project": pid, "kmz_key": key, "name": name, "unit": unit, "need_qty": qty})
                stats["materials"] = stats.get("materials", 0) + 1

    print("Impor selesai:", stats)
    for w in warnings:
        print("  PERINGATAN:", w)
    print(f'  FDT {len(data["fdt"])}, FAT {len(data["fat"])}, tiang {len(data["pole"])}, '
          f'slack {len(data["slack"])}, homepass {len(data["homepass"])}, '
          f'kabel {len(data["cable"])}, sling {len(data["sling"])}')


if __name__ == "__main__":
    sys.exit(main())
