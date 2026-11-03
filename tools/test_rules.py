#!/usr/bin/env python3
"""Uji otomatis aturan akses & hooks BRIIX OSP terhadap server PocketBase yang berjalan.

  python3 test_rules.py --pb http://127.0.0.1:8090 --email admin@x --password ... --project <id>

Membuat user uji (role berbeda), lalu mengecek skenario lapangan sungguhan:
foto dobel, foto galeri, port FAT dobel, QC, geser titik, portal klien, opname.
"""
import argparse
import io
import sys

import requests
from PIL import Image

ok_count = fail_count = 0


def check(name, cond, detail=""):
    global ok_count, fail_count
    if cond:
        ok_count += 1
        print(f"  OK    {name}")
    else:
        fail_count += 1
        print(f"  GAGAL {name}  {detail}")


def jpeg(seed):
    im = Image.new("RGB", (64, 64), (seed * 40 % 255, 90, 120))
    b = io.BytesIO()
    im.save(b, "JPEG")
    return b.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pb", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--project", required=True)
    a = ap.parse_args()
    U = a.pb.rstrip("/")
    su = requests.post(f"{U}/api/collections/_superusers/auth-with-password",
                       json={"identity": a.email, "password": a.password}).json()["token"]
    SU = {"Authorization": su}
    pid = a.project
    other = requests.get(f"{U}/api/collections/projects/records", headers=SU,
                         params={"filter": f'id!="{pid}"', "perPage": 1}).json()["items"][0]["id"]

    def mkuser(email, role, projects):
        r = requests.get(f"{U}/api/collections/users/records", headers=SU, params={"filter": f'email="{email}"'}).json()
        if r["items"]:
            uid = r["items"][0]["id"]
        else:
            uid = requests.post(f"{U}/api/collections/users/records", headers=SU, json={
                "email": email, "password": "Lapangan12345", "passwordConfirm": "Lapangan12345",
                "name": role.title(), "role": role, "projects": projects, "active": True, "verified": True}).json()["id"]
        tok = requests.post(f"{U}/api/collections/users/auth-with-password",
                            json={"identity": email, "password": "Lapangan12345"}).json()["token"]
        return uid, {"Authorization": tok}

    admin_id, ADM = mkuser("fi@briix.test", "admin", [])
    qc_id, QC = mkuser("qc@briix.test", "qc", [])
    sp_id, SP = mkuser("splicer@briix.test", "splicer", [pid])
    pbr_id, PBR = mkuser("pemborong@briix.test", "pemborong", [pid])
    out_id, OUT = mkuser("splicer2@briix.test", "splicer", [other])

    fats = requests.get(f"{U}/api/collections/assets/records", headers=SU,
                        params={"filter": f'project="{pid}" && kind="fat"', "perPage": 50, "sort": "code"}).json()["items"]
    fat = next(f for f in fats if f["code"].endswith(".A05"))
    fat2 = next(f for f in fats if f["code"].endswith(".A06"))
    fp = fat["design_pos"]

    def photo(H, asset, phash, source="camera", seed=1, dlat=0.00005, label="port"):
        return requests.post(f"{U}/api/collections/photos/records", headers=H, data={
            "project": pid, "asset": asset, "label": label, "source": source, "phash": phash,
            "pos": f'{{"lat": {fp["lat"] + dlat}, "lon": {fp["lon"]}}}',
            "uploaded_by": {SP["Authorization"]: sp_id, ADM["Authorization"]: admin_id}.get(H["Authorization"], ""),
            "taken_at": "2026-11-03 14:12:00.000Z",
        }, files={"file": (f"p{seed}.jpg", jpeg(seed), "image/jpeg")})

    print("\nAkses proyek")
    r = requests.get(f"{U}/api/collections/projects/records", headers=SP).json()
    check("splicer hanya melihat proyeknya sendiri", [p["id"] for p in r["items"]] == [pid], r)
    r = requests.get(f"{U}/api/collections/projects/records", headers=QC).json()
    check("QC melihat semua proyek", r["totalItems"] == 4, r.get("totalItems"))
    r = requests.get(f"{U}/api/collections/assets/records", headers=OUT, params={"filter": f'project="{pid}"'}).json()
    check("teknisi proyek lain tidak melihat titik TMU", r["totalItems"] == 0, r.get("totalItems"))
    r = requests.patch(f"{U}/api/collections/users/records/{sp_id}", headers=SP, json={"role": "admin"})
    check("splicer tidak bisa menaikkan perannya sendiri", r.status_code in (400, 403, 404), r.status_code)
    r = requests.get(f"{U}/api/briix/portal/x", headers=SP)
    check("portal dengan token salah -> 404", r.status_code == 404, r.status_code)

    print("\nFoto")
    h1 = "f0f0a5a5c3c30f0f"
    r1 = photo(SP, fat["id"], h1, seed=1)
    check("foto kamera di dekat FAT diterima", r1.status_code == 200, r1.text[:200])
    p1 = r1.json()
    check("server isi jarak ke FAT", p1.get("distance_m") is not None and p1["distance_m"] < 10 and not p1["far"], p1.get("distance_m"))
    r = photo(SP, fat["id"], "f0f0a5a5c3c30f0e", seed=2)
    check("foto dobel (beda 1 bit) ditolak", r.status_code == 400 and "sudah dipakai" in r.text, r.text[:200])
    r = photo(SP, fat["id"], "0123456789abcdef", source="gallery", seed=3)
    check("foto dari galeri ditolak untuk teknisi", r.status_code == 400 and "galeri" in r.text, r.text[:200])
    r = photo(ADM, fat["id"], "1111222233334444", source="gallery", seed=4)
    check("admin boleh unggah arsip dari galeri", r.status_code == 200, r.text[:200])
    r = photo(SP, fat["id"], "5555666677778888", seed=5, dlat=0.002)
    check("foto 220 m dari FAT ditandai jauh", r.status_code == 200 and r.json()["far"] is True, r.text[:200])
    p_far = r.json()
    r2 = photo(SP, fat["id"], "9999aaaabbbbcccc", seed=6)
    p2 = r2.json()

    print("\nUji OPM")
    def opm(H, uid, fat_id, port, ph, val=-19.6):
        return requests.post(f"{U}/api/collections/opm_tests/records", headers=H, json={
            "project": pid, "fat": fat_id, "port_fat": port, "opm_dbm": val, "wavelength": "1550",
            "photo": ph, "tested_by": uid, "status": "approved"})
    r = opm(SP, sp_id, fat["id"], 1, p1["id"])
    check("uji port 1 tersimpan", r.status_code == 200, r.text[:200])
    t1 = r.json()
    check("status dipaksa 'submitted' (teknisi tak bisa approve sendiri)", t1.get("status") == "submitted", t1.get("status"))
    check("input FDT terisi otomatis dari proyek", t1.get("input_fdt_dbm") == -9.84, t1.get("input_fdt_dbm"))
    r = opm(SP, sp_id, fat["id"], 1, p2["id"])
    check("port 1 FAT yang sama tidak bisa diisi dua kali", r.status_code == 400, r.status_code)
    r = opm(SP, sp_id, fat["id"], 2, p1["id"])
    check("foto yang sama tidak bisa dipakai port lain", r.status_code == 400, r.status_code)
    r = opm(SP, sp_id, fat2["id"], 1, p2["id"])
    check("foto FAT A05 tidak bisa dipakai untuk FAT A06", r.status_code == 400 and "titik lain" in r.text, r.text[:200])
    r = opm(SP, sp_id, fat["id"], 9, p2["id"])
    check("port 9 ditolak (FAT 1:8)", r.status_code == 400, r.status_code)
    r = opm(SP, sp_id, fat["id"], 2, p_far["id"])
    t2 = r.json()

    print("\nQC")
    r = requests.patch(f"{U}/api/collections/opm_tests/records/{t1['id']}", headers=SP, json={"status": "approved"})
    check("splicer tidak bisa menyetujui", r.status_code in (400, 403, 404), r.status_code)
    r = requests.patch(f"{U}/api/collections/opm_tests/records/{t2['id']}", headers=QC, json={"status": "rejected"})
    check("tolak tanpa catatan ditolak", r.status_code == 400 and "Catatan" in r.text, r.text[:200])
    r = requests.patch(f"{U}/api/collections/opm_tests/records/{t2['id']}", headers=QC,
                       json={"status": "rejected", "qc_note": "Foto 220 m dari FAT, ukur ulang di lokasi"})
    check("QC menolak dengan catatan", r.status_code == 200 and r.json()["qc_by"] == qc_id, r.text[:200])
    r = requests.patch(f"{U}/api/collections/opm_tests/records/{t1['id']}", headers=QC, json={"status": "approved"})
    check("QC menyetujui + tercatat siapa & kapan", r.status_code == 200 and r.json()["qc_by"] == qc_id and r.json()["qc_at"], r.text[:200])

    print("\nGeser titik")
    pole = requests.get(f"{U}/api/collections/assets/records", headers=SU,
                        params={"filter": f'project="{pid}" && code="MR.TMU123.P007"'}).json()["items"][0]
    pp = pole["design_pos"]
    r = requests.post(f"{U}/api/collections/relocations/records", headers=SP, json={
        "project": pid, "asset": pole["id"], "to_pos": {"lat": pp["lat"] + 0.00038, "lon": pp["lon"]},
        "reason": "warga_menolak", "note": "pindah depan rumah no. 12", "requested_by": sp_id, "status": "approved"})
    check("pengajuan geser tersimpan, jarak dihitung server", r.status_code == 200 and 38 <= r.json()["distance_m"] <= 46, r.text[:200])
    rel = r.json()
    r = requests.patch(f"{U}/api/collections/relocations/records/{rel['id']}", headers=QC, json={"status": "approved"})
    after = requests.get(f"{U}/api/collections/assets/records/{pole['id']}", headers=SU).json()
    check("disetujui -> posisi as-built tiang ikut pindah", r.status_code == 200 and abs(after["asbuilt_pos"]["lat"] - (pp["lat"] + 0.00038)) < 1e-7, after.get("asbuilt_pos"))

    print("\nBorongan & opname")
    pkgs = requests.get(f"{U}/api/collections/work_packages/records", headers=SU, params={"filter": f'project="{pid}"'}).json()["items"]
    tiangA = next(p for p in pkgs if p["name"] == "Tanam tiang Line A")
    kabelB = next(p for p in pkgs if p["name"] == "Tarik kabel Line B")
    requests.patch(f"{U}/api/collections/work_packages/records/{tiangA['id']}", headers=ADM,
                   json={"executor_type": "pemborong", "executor": pbr_id, "unit_price": 750000})
    r = requests.get(f"{U}/api/collections/work_packages/records", headers=PBR).json()
    check("pemborong hanya melihat paket miliknya", [p["id"] for p in r["items"]] == [tiangA["id"]], [p["name"] for p in r["items"]])
    item = requests.post(f"{U}/api/collections/work_items/records", headers=PBR, json={
        "project": pid, "package": tiangA["id"], "asset": pole["id"], "qty": 1, "step": "cor",
        "status": "submitted", "submitted_by": pbr_id})
    check("pemborong lapor 1 tiang", item.status_code == 200, item.text[:200])
    r = requests.post(f"{U}/api/collections/work_items/records", headers=PBR, json={
        "project": pid, "package": tiangA["id"], "qty": 5, "status": "approved", "submitted_by": pbr_id})
    check("pemborong tidak bisa lapor langsung 'approved'", r.status_code in (400, 403), r.status_code)
    requests.patch(f"{U}/api/collections/work_items/records/{item.json()['id']}", headers=QC, json={"status": "approved"})
    r = requests.get(f"{U}/api/briix/projects/{pid}/opname", headers=QC)
    check("opname khusus admin", r.status_code == 403, r.status_code)
    r = requests.get(f"{U}/api/briix/projects/{pid}/opname", headers=ADM).json()
    row = next(p for p in r["packages"] if p["package"] == tiangA["id"])
    check("opname = qty disetujui x harga (1 x 750.000)", row["approved_qty"] == 1 and row["amount"] == 750000, row)
    opmrow = next(p for p in r["packages"] if p["type"] == "opm")
    check("opname OPM hitung port yang disetujui saja", opmrow["approved_qty"] == 1, opmrow)

    print("\nPortal klien")
    token = requests.get(f"{U}/api/collections/projects/records/{pid}", headers=SU).json()["portal_token"]
    r = requests.get(f"{U}/api/collections/projects/records/{pid}", headers=QC).json()
    check("token portal tersembunyi dari API biasa", "portal_token" not in r, list(r)[:5])
    r = requests.get(f"{U}/api/briix/portal/{token}")
    js = r.json() if r.status_code == 200 else {}
    check("portal terbuka tanpa login", r.status_code == 200 and js.get("client") == "MyRepublic", r.text[:200])
    check("portal: 1 dari 192 port disetujui (yang ditolak tidak tampil)",
          js.get("opm", {}).get("ports_total") == 192 and js["opm"]["ports_approved"] == 1, js.get("opm", {}).get("ports_approved"))

    print(f"\nHasil: {ok_count} lolos, {fail_count} gagal")
    return 1 if fail_count else 0


if __name__ == "__main__":
    sys.exit(main())
