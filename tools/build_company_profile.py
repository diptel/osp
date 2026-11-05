#!/usr/bin/env python3
"""Bangun PDF company profile BRIIX OSP dari tools/company_profile.json.

    python3 tools/build_company_profile.py            # -> pb_public/assets/company-profile-briix-osp.pdf
    python3 tools/build_company_profile.py out.pdf

Semua data (legalitas, layanan, pengalaman) diambil dari JSON — ubah di sana,
jangan di skrip ini. Nilai yang masih berawalan "[ISI" ditandai kuning di PDF.
"""
import json, sys, datetime, pathlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, Image, KeepTogether, ListFlowable, ListItem)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "tools" / "company_profile.json").read_text(encoding="utf-8"))
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "pb_public" / "assets" / "company-profile-briix-osp.pdf"
LOGO = ROOT / "web" / "public" / "icon-512.png"

INK = colors.HexColor("#16181D"); ACC = colors.HexColor("#2B5FB8"); MUTED = colors.HexColor("#5F6670")
LINE = colors.HexColor("#E6E8EB"); BG = colors.HexColor("#F7F7F5"); WARN = colors.HexColor("#FFF3B0")

def st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=10, leading=14, textColor=INK)
    base.update(kw); return ParagraphStyle(name, **base)
H1 = st("h1", fontName="Helvetica-Bold", fontSize=22, leading=26, spaceAfter=4)
H2 = st("h2", fontName="Helvetica-Bold", fontSize=14, leading=18, spaceBefore=10, spaceAfter=6, textColor=INK)
BODY = st("body"); SMALL = st("small", fontSize=8.5, leading=11, textColor=MUTED)
LEAD = st("lead", fontSize=11, leading=16, textColor=MUTED)
CELL = st("cell", fontSize=9.5, leading=12.5); CELLB = st("cellb", fontName="Helvetica-Bold", fontSize=9.5, leading=12.5)

def esc(s): return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def val(s):
    """Paragraph; nilai belum diisi ditandai kuning."""
    s = str(s)
    if s.startswith("[ISI"):
        return Paragraph(f'<font backColor="#FFF3B0">{esc(s)}</font>', CELL)
    return Paragraph(esc(s), CELL)

def kv_table(rows, col1=48*mm):
    t = Table([[Paragraph(esc(k), CELLB), val(v)] for k, v in rows], colWidths=[col1, 170*mm - col1 - 2*mm])
    t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LINEBELOW", (0,0), (-1,-1), 0.4, LINE),
                           ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3)]))
    return t

def header_footer(canv, doc):
    canv.saveState()
    w, h = A4
    canv.setFillColor(INK); canv.rect(0, h - 12*mm, w, 12*mm, fill=1, stroke=0)
    canv.setFillColor(colors.white); canv.setFont("Helvetica-Bold", 9)
    canv.drawString(18*mm, h - 7.5*mm, "BRIIX OSP  ·  Company Profile")
    canv.setFont("Helvetica", 8); canv.drawRightString(w - 18*mm, h - 7.5*mm, DATA["web_url"].replace("https://", ""))
    canv.setFillColor(MUTED); canv.setFont("Helvetica", 8)
    canv.drawString(18*mm, 10*mm, f"{DATA['legal']['nama_badan_usaha']}  ·  bagian dari BRIIX ({DATA['pusat_url'].replace('https://','')})")
    canv.drawRightString(w - 18*mm, 10*mm, f"Hal. {doc.page}")
    canv.restoreState()

def cover(canv, doc):
    canv.saveState()
    w, h = A4
    canv.setFillColor(INK); canv.rect(0, 0, w, h, fill=1, stroke=0)
    foto = DATA.get("foto_sampul")
    if foto and (ROOT / foto).exists():
        # foto kantor memenuhi separuh atas sampul (crop proporsional)
        from PIL import Image as PILImage
        im = PILImage.open(ROOT / foto); iw, ih = im.size
        box_w, box_h = w, h * 0.46
        scale = max(box_w / iw, box_h / ih); cw, ch = iw * scale, ih * scale
        canv.saveState(); pth = canv.beginPath(); pth.rect(0, h - box_h, box_w, box_h); canv.clipPath(pth, stroke=0)
        canv.drawImage(str(ROOT / foto), (box_w - cw) / 2, h - box_h - (ch - box_h) / 2, cw, ch)
        canv.restoreState()
    canv.setFillColor(ACC); canv.rect(0, 0, 10*mm, h * 0.54, fill=1, stroke=0)
    if LOGO.exists():
        canv.drawImage(str(LOGO), 24*mm, h * 0.54 - 34*mm, 20*mm, 20*mm, mask="auto")
    canv.setFillColor(colors.white); canv.setFont("Helvetica-Bold", 34)
    canv.drawString(50*mm, h * 0.54 - 28*mm, "BRIIX")
    canv.setFillColor(colors.HexColor("#8FB3F2")); canv.drawString(50*mm + 61*mm, h * 0.54 - 28*mm, "OSP")
    canv.setFillColor(colors.white); canv.setFont("Helvetica-Bold", 16)
    canv.drawString(24*mm, h * 0.54 - 50*mm, "Company Profile")
    canv.setFont("Helvetica", 11); canv.setFillColor(colors.HexColor("#C9CDD3"))
    y = h * 0.54 - 62*mm
    for line in wrap(DATA["tagline"], 70):
        canv.drawString(24*mm, y, line); y -= 6*mm
    canv.setFont("Helvetica", 10); canv.setFillColor(colors.HexColor("#A6ACB5"))
    canv.drawString(24*mm, 40*mm, DATA["legal"]["nama_badan_usaha"] + (f' ({DATA["legal"]["singkatan"]})' if DATA["legal"].get("singkatan") else ""))
    canv.drawString(24*mm, 34*mm, f"{DATA['web_url']}   ·   pusat: {DATA['pusat_url']}")
    canv.drawString(24*mm, 28*mm, "Diperbarui " + datetime.date.today().strftime("%d %B %Y"))
    canv.restoreState()

def wrap(text, n):
    out, cur = [], ""
    for wd in text.split():
        if len(cur) + len(wd) + 1 > n: out.append(cur); cur = wd
        else: cur = (cur + " " + wd).strip()
    if cur: out.append(cur)
    return out

def build():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=20*mm, bottomMargin=18*mm,
                            title="Company Profile BRIIX OSP", author=DATA["legal"]["nama_badan_usaha"])
    L = DATA["legal"]; s = [PageBreak()]  # hal. 1 = sampul (digambar di canvas)

    # halaman 2: tentang + legalitas
    s.append(Paragraph("Tentang BRIIX OSP", H1))
    s.append(Paragraph(esc(
        f"BRIIX OSP adalah lini jasa kontraktor jaringan fiber optik luar gedung (Outside Plant) dari grup BRIIX "
        f"({DATA['pusat_url'].replace('https://','')}), dijalankan oleh {L['nama_badan_usaha']}. Kami mengerjakan pembangunan jaringan "
        f"FTTH untuk penyedia internet dan mitra ICT: survei & desain, tarik kabel, tanam tiang, jointing FDT/FAT, uji redaman OPM "
        f"per port, hingga laporan ATP dan serah terima."), LEAD))
    s.append(Spacer(1, 4))
    if DATA.get("latar_belakang"):
        s.append(Paragraph(esc(DATA["latar_belakang"]), BODY)); s.append(Spacer(1, 4))
    s.append(Paragraph(esc(
        "Seluruh pekerjaan dikelola lewat aplikasi lapangan milik sendiri: setiap bukti foto diambil dari kamera aplikasi dengan "
        "lokasi GPS, diverifikasi tim QC sebelum dilaporkan, dan klien dapat memantau progres serta nilai opname melalui portal."), BODY))

    s.append(Paragraph("Legalitas perusahaan", H2))
    rows = [("Nama badan usaha", L["nama_badan_usaha"] + (f' (disingkat {L["singkatan"]})' if L.get("singkatan") else "")),
            ("Bentuk", L["bentuk"]), ("Akta pendirian", L["akta_pendirian"]),
            ("SK Kemenkumham", L["sk_kemenkumham"]), ("NIB", L["nib"]), ("NPWP", L["npwp"]), ("Status PKP", L["pkp"])]
    if L.get("modal"): rows.append(("Modal", L["modal"]))
    rows += [("KBLI", "; ".join(L["kbli"])), ("Alamat", L["alamat"]), ("Telepon / WA", L["telepon"]), ("Email", L["email"]),
             ("Pengurus", L["direktur"]), ("Rekening", L["bank"])]
    if L.get("izin_lain"): rows.append(("Izin lain", "; ".join(L["izin_lain"])))
    if L.get("sertifikat_lain"): rows.append(("Sertifikat lain", "; ".join(L["sertifikat_lain"])))
    s.append(kv_table(rows))
    s.append(Paragraph("Salinan dokumen legalitas (akta pendirian, SK Kemenkumham, NIB, NPWP, PKPLH) tersedia dan dilampirkan atas permintaan.", SMALL))

    # halaman 2: layanan + cara kerja
    s.append(PageBreak())
    s.append(Paragraph("Layanan", H1))
    s.append(Paragraph("Dapat diambil sebagai paket lengkap atau hanya tahap tertentu, menyesuaikan lingkup klien.", LEAD))
    cells = []
    for name, desc in DATA["layanan"]:
        cells.append([Paragraph(f"<b>{esc(name)}</b><br/><font color='#5F6670'>{esc(desc)}</font>", CELL)])
    # 2 kolom
    pairs = [cells[i:i+2] for i in range(0, len(cells), 2)]
    grid = Table([[c[0] for c in p] + ([""] if len(p) < 2 else []) for p in pairs], colWidths=[85*mm, 85*mm])
    grid.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BOX", (0,0), (-1,-1), 0.4, LINE),
                              ("INNERGRID", (0,0), (-1,-1), 0.4, LINE), ("BACKGROUND", (0,0), (-1,-1), colors.white),
                              ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
                              ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8)]))
    s.append(grid)

    s.append(Paragraph("Cara kerja", H2))
    steps = ["Survei & desain — jalur dan titik ditetapkan, KMZ disepakati dengan klien.",
             "Pembangunan — tiang, kabel, jointing dikerjakan per line; setiap titik difoto dengan lokasi GPS.",
             "Uji OPM per port — teknisi mengukur tiap port FAT; hasil dan foto masuk antrean QC.",
             "QC & RFS — tim QC menyetujui atau meminta ulang; FAT lengkap dinyatakan siap layanan.",
             "ATP & opname — laporan diserahkan, revisi klien ditindaklanjuti, opname dihitung dari volume yang disetujui."]
    s.append(ListFlowable([ListItem(Paragraph(esc(x), BODY)) for x in steps], bulletType="1", leftIndent=14))

    s.append(Paragraph("Standar mutu & K3", H2))
    s.append(ListFlowable([ListItem(Paragraph(esc(x), BODY)) for x in [
        "Satu foto untuk satu port/titik; foto ganda dan foto galeri ditolak sistem secara otomatis.",
        "Angka di laporan identik dengan layar alat ukur di foto — tidak diketik ulang.",
        "Material dan spesifikasi mengikuti standar tertulis yang disetujui klien/main vendor.",
        "Tim lapangan dibekali APD; pendaftaran BPJS Ketenagakerjaan pekerja mengikuti ketentuan kontrak.",
        "Kami terbuka untuk mengikuti pelatihan/sertifikasi teknisi yang disyaratkan klien atau main vendor.",
        "Tahapan proyek (Berjalan → RFS → ATP → Revisi ATP → Lunas) terlihat oleh semua pihak."]], bulletType="bullet", leftIndent=14))

    # halaman 3: pengalaman, tim, peralatan, kontak
    s.append(PageBreak())
    s.append(Paragraph("Pengalaman proyek", H1))
    t = Table([[Paragraph("<b>Klien</b>", CELL), Paragraph("<b>Proyek</b>", CELL), Paragraph("<b>Lingkup</b>", CELL), Paragraph("<b>Tahun</b>", CELL)]] +
              [[val(a), val(b), val(c), val(d)] for a, b, c, d in DATA["pengalaman"]],
              colWidths=[28*mm, 52*mm, 72*mm, 16*mm])
    t.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BACKGROUND", (0,0), (-1,0), BG),
                           ("LINEBELOW", (0,0), (-1,-1), 0.4, LINE), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]))
    s.append(t)
    s.append(Paragraph("Referensi klien: " + esc(", ".join(DATA["referensi_klien"])), SMALL))

    s.append(Paragraph("Tim", H2))
    s.append(kv_table([(a, b) for a, b in DATA["tim"]], col1=60*mm))
    s.append(Paragraph("Peralatan", H2))
    s.append(ListFlowable([ListItem(val(x)) for x in DATA["peralatan"]], bulletType="bullet", leftIndent=14))

    s.append(Paragraph("Kontak", H2))
    s.append(kv_table([("Perusahaan", L["nama_badan_usaha"]), ("Alamat", L["alamat"]), ("Telepon / WA", L["telepon"]),
                       ("Email", L["email"]), ("Web", DATA["web_url"]), ("Pusat grup", DATA["pusat_url"])]))

    doc.build(s, onFirstPage=cover, onLaterPages=header_footer)
    return OUT

if __name__ == "__main__":
    p = build()
    print("PDF:", p, f"({p.stat().st_size // 1024} KB)")
