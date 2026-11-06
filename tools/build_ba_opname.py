#!/usr/bin/env python3
"""Contoh Berita Acara Opname (BA) — PT BRIIX Technologi Indonesia.

    python3 tools/build_ba_opname.py [out.pdf] [data.json]

Tanpa data.json → memakai contoh TMU123.035. Format JSON lihat CONTOH di bawah.
"""
import json, sys, pathlib, datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOGO = ROOT / "web" / "public" / "icon-512.png"

CONTOH = {
  "nomor": "001/BA-OPN/BRIIXTECH/XI/2026",
  "tanggal": "2026-11-06",
  "periode": "1 Oktober 2026 s.d. 5 November 2026",
  "termin": "Opname ke-1 (100% pekerjaan jointing & uji OPM)",
  "pihak_pertama": {
    "nama": "PT Xing Shengze Technology Indonesia",
    "alamat": "[alamat pemberi kerja]",
    "wakil": "[nama]", "jabatan": "[jabatan]",
    "spk": "SPK/PO No. [nomor] tanggal [tanggal]"
  },
  "pihak_kedua": {
    "nama": "PT BRIIX Technologi Indonesia",
    "alamat": "Jl. Mawar No. 05, RT 001 RW 002, Sedayulawas, Brondong, Lamongan, Jawa Timur 62263",
    "wakil": "Shofiyudin", "jabatan": "Direktur",
    "npwp": "21.341.319.8-645.000"
  },
  "proyek": {
    "nama": "Pembangunan Jaringan FTTH MyRepublic — Cluster Temu RW 1,2,3 Bojonegoro",
    "kode": "TMU123.035 (BJN000814)", "lokasi": "Kec. Temu, Kab. Bojonegoro, Jawa Timur",
    "lingkup": "Jointing FDT/FAT dan uji redaman OPM"
  },
  "items": [
    ["Pasang & Uji OPM per FAT", "FAT", 24, 24, 24, 100000],
    ["Jointing FAT (sisi FAT)", "core", 24, 24, 24, 20000],
    ["Jointing FDT (sisi FAT)", "core", 24, 24, 24, 20000],
    ["Join JB Feeder", "core", 5, 5, 5, 20000],
    ["Join FDT uplink (feeder ke splitter)", "core", 5, 5, 5, 20000]
  ],
  "catatan": [
    "Volume di atas adalah hasil pemeriksaan bersama di lapangan dan telah diverifikasi QC; bukti foto uji OPM per port (192 port) dan foto FAT selesai terlampir dalam Laporan Uji OPM TMU123.035.",
    "Harga belum termasuk PPN (Pihak Kedua berstatus Non-PKP). Pihak Pertama memotong PPh Pasal 23 atas jasa sesuai ketentuan dan menyerahkan bukti potong kepada Pihak Kedua.",
    "Pembayaran dilakukan paling lambat 14 (empat belas) hari kalender sejak BA ini ditandatangani, ke rekening Bank Mandiri 178-00-1066097-1 a.n. PT BRIIX Technologi Indonesia.",
    "Pekerjaan yang di kemudian hari dinyatakan perlu revisi oleh pemilik proyek (ATP) akan diperbaiki Pihak Kedua tanpa biaya tambahan sepanjang masih dalam lingkup BA ini."
  ],
  "mengetahui": {"nama": "[nama]", "jabatan": "Site Manager / QC Pihak Pertama"}
}

def terbilang(n):
    sat = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"]
    def t(x):
        if x < 12: return sat[x]
        if x < 20: return t(x - 10) + " belas"
        if x < 100: return t(x // 10) + " puluh" + (" " + t(x % 10) if x % 10 else "")
        if x < 200: return "seratus" + (" " + t(x - 100) if x > 100 else "")
        if x < 1000: return t(x // 100) + " ratus" + (" " + t(x % 100) if x % 100 else "")
        if x < 2000: return "seribu" + (" " + t(x - 1000) if x > 1000 else "")
        if x < 10**6: return t(x // 1000) + " ribu" + (" " + t(x % 1000) if x % 1000 else "")
        if x < 10**9: return t(x // 10**6) + " juta" + (" " + t(x % 10**6) if x % 10**6 else "")
        return t(x // 10**9) + " miliar" + (" " + t(x % 10**9) if x % 10**9 else "")
    return (t(int(n)) or "nol").strip().capitalize() + " rupiah"

def rp(n): return "Rp " + f"{int(round(n)):,}".replace(",", ".")

def build(d, out):
    INK = colors.HexColor("#16181D"); LINE = colors.HexColor("#C9CDD3"); BG = colors.HexColor("#F2F3F5")
    def st(n, **k):
        b = dict(fontName="Helvetica", fontSize=10, leading=14, textColor=INK); b.update(k); return ParagraphStyle(n, **b)
    TITLE = st("t", fontName="Helvetica-Bold", fontSize=15, leading=18, alignment=TA_CENTER)
    SUB = st("s", fontSize=10, alignment=TA_CENTER, textColor=colors.HexColor("#5F6670"))
    BODY = st("b", alignment=TA_JUSTIFY); SMALL = st("sm", fontSize=8.5, leading=11)
    CELL = st("c", fontSize=8.8, leading=11); CELLB = st("cb", fontName="Helvetica-Bold", fontSize=9, leading=11.5)
    CELLR = st("cr", fontSize=9, leading=11.5, alignment=2); CELLRB = st("crb", fontName="Helvetica-Bold", fontSize=9, leading=11.5, alignment=2)

    tgl = datetime.date.fromisoformat(d["tanggal"])
    BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]
    HARI = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"]
    tgl_s = f"{HARI[tgl.weekday()]}, {tgl.day} {BULAN[tgl.month-1]} {tgl.year}"
    P1, P2, PR = d["pihak_pertama"], d["pihak_kedua"], d["proyek"]

    def kv(rows, w1=38*mm):
        t = Table([[Paragraph(k, CELL), Paragraph(":", CELL), Paragraph(v, CELL)] for k, v in rows], colWidths=[w1, 6*mm, 170*mm - w1 - 6*mm])
        t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING", (0,0), (-1,-1), 1), ("BOTTOMPADDING", (0,0), (-1,-1), 1)]))
        return t

    s = []
    s.append(Paragraph("BERITA ACARA OPNAME PEKERJAAN", TITLE))
    s.append(Paragraph(f"Nomor: {d['nomor']}", SUB))
    s.append(Spacer(1, 10))
    s.append(Paragraph(
        f"Pada hari ini {tgl_s}, bertempat di lokasi pekerjaan, kami yang bertanda tangan di bawah ini:", BODY))
    s.append(Spacer(1, 6))
    s.append(kv([("Nama", f"<b>{P1['wakil']}</b>"), ("Jabatan", P1["jabatan"]), ("Perusahaan", f"<b>{P1['nama']}</b>"), ("Alamat", P1["alamat"])]))
    s.append(Paragraph("selanjutnya disebut <b>PIHAK PERTAMA</b> (Pemberi Kerja);", BODY)); s.append(Spacer(1, 4))
    s.append(kv([("Nama", f"<b>{P2['wakil']}</b>"), ("Jabatan", P2["jabatan"]), ("Perusahaan", f"<b>{P2['nama']}</b>"), ("Alamat", P2["alamat"]), ("NPWP", P2["npwp"])]))
    s.append(Paragraph("selanjutnya disebut <b>PIHAK KEDUA</b> (Pelaksana Pekerjaan).", BODY)); s.append(Spacer(1, 8))
    s.append(Paragraph(
        f"Berdasarkan {P1['spk']}, kedua belah pihak telah bersama-sama melakukan pemeriksaan dan pengukuran hasil pekerjaan "
        f"(opname) di lapangan dengan hasil sebagai berikut:", BODY))
    s.append(Spacer(1, 6))
    s.append(kv([("Nama proyek", PR["nama"]), ("Kode proyek", PR["kode"]), ("Lokasi", PR["lokasi"]), ("Lingkup", PR["lingkup"]),
                 ("Periode opname", d["periode"]), ("Termin", d["termin"])]))
    s.append(Spacer(1, 8))

    head = [Paragraph(x, CELLB) for x in ["No", "Uraian pekerjaan", "Sat.", "Vol. kontrak", "Kumulatif BA lalu", "Opname ini", "Harga satuan", "Jumlah"]]
    rows = [head]; total = 0
    for i, (nama, sat, vol, kum, now, harga) in enumerate(d["items"], 1):
        jumlah = now * harga; total += jumlah
        rows.append([Paragraph(str(i), CELL), Paragraph(nama, CELL), Paragraph(sat, CELL), Paragraph(f"{vol:g}", CELLR),
                     Paragraph(f"{kum - now:g}", CELLR), Paragraph(f"<b>{now:g}</b>", CELLR), Paragraph(rp(harga), CELLR), Paragraph(rp(jumlah), CELLR)])
    rows.append(["", Paragraph("<b>TOTAL OPNAME INI</b>", CELLB), "", "", "", "", "", Paragraph(f"<b>{rp(total)}</b>", CELLRB)])
    t = Table(rows, colWidths=[8*mm, 46*mm, 12*mm, 16*mm, 20*mm, 16*mm, 24*mm, 28*mm], repeatRows=1)
    t.setStyle(TableStyle([("GRID", (0,0), (-1,-1), 0.5, LINE), ("BACKGROUND", (0,0), (-1,0), BG), ("BACKGROUND", (0,-1), (-1,-1), BG),
                           ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4)]))
    s.append(t)
    s.append(Spacer(1, 4))
    s.append(Paragraph(f"Terbilang: <i>{terbilang(total)}</i>", BODY))
    s.append(Spacer(1, 8))
    s.append(Paragraph("<b>Catatan:</b>", BODY))
    for i, c in enumerate(d["catatan"], 1):
        s.append(Paragraph(f"{i}. {c}", st("n", fontSize=9.5, leading=13, leftIndent=10, alignment=TA_JUSTIFY)))
    s.append(Spacer(1, 8))
    s.append(Paragraph(
        "Demikian Berita Acara Opname ini dibuat dengan sebenarnya dalam rangkap 2 (dua) bermeterai cukup, masing-masing mempunyai "
        "kekuatan hukum yang sama, untuk dipergunakan sebagaimana mestinya.", BODY))
    s.append(Spacer(1, 14))

    sig = Table([
        [Paragraph("<b>PIHAK PERTAMA</b><br/>" + P1["nama"], st("sc", alignment=TA_CENTER, fontSize=9.5)),
         Paragraph("<b>PIHAK KEDUA</b><br/>" + P2["nama"], st("sc2", alignment=TA_CENTER, fontSize=9.5))],
        [Spacer(1, 26*mm), Spacer(1, 26*mm)],
        [Paragraph(f"<u><b>{P1['wakil']}</b></u><br/>{P1['jabatan']}", st("sn", alignment=TA_CENTER, fontSize=9.5)),
         Paragraph(f"<u><b>{P2['wakil']}</b></u><br/>{P2['jabatan']}", st("sn2", alignment=TA_CENTER, fontSize=9.5))],
    ], colWidths=[85*mm, 85*mm])
    sig.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP")]))
    m = d.get("mengetahui")
    blok = [sig]
    if m:
        blok += [Spacer(1, 10),
                 Table([[Paragraph("Mengetahui / diperiksa,", st("m", alignment=TA_CENTER, fontSize=9.5))], [Spacer(1, 22*mm)],
                        [Paragraph(f"<u><b>{m['nama']}</b></u><br/>{m['jabatan']}", st("mn", alignment=TA_CENTER, fontSize=9.5))]], colWidths=[170*mm])]
    s.append(KeepTogether(blok))

    def deco(canv, doc):
        canv.saveState(); w, h = A4
        if LOGO.exists(): canv.drawImage(str(LOGO), 20*mm, h - 22*mm, 11*mm, 11*mm, mask="auto")
        canv.setFont("Helvetica-Bold", 10); canv.setFillColor(INK); canv.drawString(33*mm, h - 15*mm, P2["nama"])
        canv.setFont("Helvetica", 8); canv.setFillColor(colors.HexColor("#5F6670"))
        canv.drawString(33*mm, h - 19.5*mm, "BRIIX OSP · Outside Plant & FTTH Contractor · osp.briix.co.id")
        canv.setStrokeColor(LINE); canv.line(20*mm, h - 25*mm, w - 20*mm, h - 25*mm)
        canv.setFont("Helvetica", 8); canv.drawRightString(w - 20*mm, 10*mm, f"BA Opname {d['nomor']} · hal. {doc.page}")
        canv.restoreState()

    doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=30*mm, bottomMargin=18*mm,
                            title=f"BA Opname {d['nomor']}", author=P2["nama"])
    doc.build(s, onFirstPage=deco, onLaterPages=deco)
    return out

if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("/tmp/ba-opname.pdf")
    data = json.loads(pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")) if len(sys.argv) > 2 else CONTOH
    print("PDF:", build(data, out))
