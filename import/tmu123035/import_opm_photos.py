#!/usr/bin/env python3
"""Impor foto + hasil uji OPM TMU123.035 (192 port, 24 FAT) dari rekap PDF lama
ke PocketBase BRIIX OSP. Dijalankan di server (bukan dari browser) karena
ukuran total ~200MB dan butuh login akun 'splicer1'.

Pakai:
  SPLICER_PASSWORD=... python3 import_opm_photos.py \
    --pb https://osp.briix.co.id --project giouyf3kr1mgiwz

Aman dijalankan ulang: skip pasangan (fat, port) yang sudah ada opm_tests-nya.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import requests
from PIL import Image

HERE = Path(__file__).resolve().parent
SPLICER_EMAIL = "splicer1@briix.co.id"
TAKEN_AT = "2026-11-01T06:00:00.000Z"  # sesuai "DATE: 1 November 2026" di rekap PDF lama


def dhash_hex(path: Path) -> str:
    """dHash 64-bit, harus sama persis algoritmanya dengan client/dhash.js:
    resize ke 9x8, grayscale luma (0.299R+0.587G+0.114B), bandingkan pasangan
    piksel bersebelahan per baris -> 16 karakter hex."""
    img = Image.open(path).convert("RGB")
    img = img.resize((9, 8), Image.BILINEAR)
    px = img.load()

    def g(x, y):
        r, gg, b = px[x, y]
        return r * 0.299 + gg * 0.587 + b * 0.114

    out = ""
    for y in range(8):
        byte = 0
        for x in range(8):
            byte = (byte << 1) | (1 if g(x, y) > g(x + 1, y) else 0)
        out += format(byte, "02x")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pb", required=True, help="Base URL PocketBase, mis. https://osp.briix.co.id")
    ap.add_argument("--project", required=True, help="ID proyek PocketBase")
    args = ap.parse_args()

    password = os.environ.get("SPLICER_PASSWORD")
    if not password:
        sys.exit("SPLICER_PASSWORD belum diset di environment.")

    base = args.pb.rstrip("/")
    s = requests.Session()

    print(f"Login sebagai {SPLICER_EMAIL} ...")
    r = s.post(f"{base}/api/collections/users/auth-with-password",
               json={"identity": SPLICER_EMAIL, "password": password}, timeout=30)
    r.raise_for_status()
    auth = r.json()
    token = auth["token"]
    me = auth["record"]
    s.headers["Authorization"] = token
    print(f"OK, login sebagai {me['email']} ({me['id']})")

    # Peta kode FAT (mis. "B01", "A14") -> id aset
    r = s.get(f"{base}/api/collections/assets/records",
              params={"filter": f'project = "{args.project}" && kind = "fat"', "perPage": 200}, timeout=30)
    r.raise_for_status()
    fat_by_suffix = {}
    for item in r.json()["items"]:
        code = item["code"]
        suffix = code.split(".")[-1]
        fat_by_suffix[suffix] = item["id"]
    print(f"{len(fat_by_suffix)} FAT ditemukan di proyek.")

    manifest = json.loads((HERE / "manifest.json").read_text())
    photos_dir = HERE / "photos"

    done = skip = fail = 0
    for entry in manifest:
        fat_code, port, fname, dbm = entry["fat"], entry["port"], entry["file"], entry["dbm"]
        asset_id = fat_by_suffix.get(fat_code)
        if not asset_id:
            print(f"  LEWATI {fat_code} port {port}: FAT tidak ditemukan di database.")
            fail += 1
            continue

        # idempotent: skip kalau sudah ada opm_tests utk (fat, port) ini
        r = s.get(f"{base}/api/collections/opm_tests/records",
                  params={"filter": f'fat = "{asset_id}" && port_fat = {port}', "perPage": 1}, timeout=30)
        r.raise_for_status()
        if r.json()["items"]:
            skip += 1
            continue

        photo_path = photos_dir / fname
        if not photo_path.exists():
            print(f"  LEWATI {fat_code} port {port}: file foto {fname} tidak ada.")
            fail += 1
            continue

        try:
            phash = dhash_hex(photo_path)
            with open(photo_path, "rb") as fh:
                files = {"file": (fname, fh, "image/jpeg" if fname.lower().endswith((".jpg", ".jpeg")) else "image/png")}
                data = {
                    "project": args.project,
                    "asset": asset_id,
                    "label": f"Port {port}",
                    "taken_at": TAKEN_AT,
                    "source": "camera",
                    "phash": phash,
                    "uploaded_by": me["id"],
                }
                r = s.post(f"{base}/api/collections/photos/records", data=data, files=files, timeout=120)
            if r.status_code >= 400:
                print(f"  GAGAL foto {fat_code} port {port}: {r.status_code} {r.text[:200]}")
                fail += 1
                continue
            photo_id = r.json()["id"]

            r = s.post(f"{base}/api/collections/opm_tests/records", json={
                "project": args.project,
                "fat": asset_id,
                "port_fat": port,
                "opm_dbm": float(dbm),
                "photo": photo_id,
                "tested_at": TAKEN_AT,
                "tested_by": me["id"],
            }, timeout=30)
            if r.status_code >= 400:
                print(f"  GAGAL opm_test {fat_code} port {port}: {r.status_code} {r.text[:200]}")
                fail += 1
                continue

            done += 1
            if done % 20 == 0:
                print(f"  ... {done} tersimpan")
        except Exception as e:  # noqa: BLE001
            print(f"  ERROR {fat_code} port {port}: {e}")
            fail += 1

    print(f"\nSelesai. Tersimpan: {done}, dilewati (sudah ada): {skip}, gagal: {fail}, total: {len(manifest)}")


if __name__ == "__main__":
    main()
