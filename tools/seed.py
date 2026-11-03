#!/usr/bin/env python3
"""Isi data awal: klien dan proyek yang sedang berjalan.

  python3 seed.py --pb http://127.0.0.1:8090 --email admin@x --password ...

Aman dijalankan ulang (yang sudah ada dilewati). Mencetak id proyek untuk import_kmz.py.
"""
import argparse

from pbclient import PB

CLIENTS = [
    {"name": "MyRepublic", "code": "MYREP", "report_template": "myrepublic_opm"},
    {"name": "Fistmedia", "code": "FIST", "report_template": "generic"},
]

PROJECTS = [
    {"client": "MyRepublic", "code": "BJN000814", "name": "APD Temu RW 01, 02 dan 03",
     "region": "Bojonegoro", "cluster_name": "Temu RW 1,2,3 Bojonegoro", "cluster_id": "TMU 123.035",
     "olt": "OLT Buorno", "fdt_input_dbm": -9.84, "design_source": "import", "status": "berjalan"},
    {"client": "MyRepublic", "code": "", "name": "Proyek MyRepublic Jakarta",
     "region": "Jakarta", "design_source": "import", "status": "draft"},
    {"client": "MyRepublic", "code": "", "name": "Proyek MyRepublic Lamongan Sukodadi",
     "region": "Lamongan - Sukodadi", "design_source": "import", "status": "draft"},
    {"client": "Fistmedia", "code": "", "name": "Proyek Fistmedia Sedayulawas",
     "region": "Sedayulawas", "design_source": "briix", "status": "draft"},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pb", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    pb = PB(a.pb, a.email, a.password)

    cid = {}
    for c in CLIENTS:
        rec = pb.first("clients", f'name="{c["name"]}"') or pb.create("clients", c)
        cid[c["name"]] = rec["id"]

    for p in PROJECTS:
        rec = pb.first("projects", f'name="{p["name"]}"')
        if not rec:
            rec = pb.create("projects", {**p, "client": cid[p["client"]], "gps_tolerance_m": 50,
                                         "material_tracking": False})
        print(f'{rec["id"]}  {p["client"]:<11} {p["region"]:<20} {p["name"]}')


if __name__ == "__main__":
    main()
