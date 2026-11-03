# BRIIX OSP: database PocketBase

Backend untuk aplikasi lapangan BRIIX (vendor proyek FTTH untuk MyRepublic, Fistmedia, dan klien lain).
Dibuat dan diuji dengan **PocketBase v0.40.6**.

## Isi folder

| Path | Fungsi |
|---|---|
| `pb_migrations/1793700000_briixosp_schema.js` | Skema lengkap: 14 tabel, aturan akses per peran, dan index |
| `pb_hooks/main.pb.js` | Aturan server: cek foto, uji OPM, QC, geser titik, opname, portal klien |
| `pb_hooks/utils.js` | Fungsi bantu (jarak GPS, sidik foto) |
| `tools/seed.py` | Mengisi klien dan 4 proyek awal |
| `tools/import_kmz.py` | Impor KMZ desain ke titik, kabel, paket kerja, dan material |
| `tools/test_rules.py` | 33 uji otomatis aturan akses dan hooks |
| `client/dhash.js` | Sidik foto untuk PWA (dikirim di field `phash`) |
| `Dockerfile`, `docker-compose.yml` | Untuk dijalankan di 1Panel |

## Pasang di 1Panel

1. Kode ada di repo `diptel/briixosp`. Push ke `main` otomatis dideploy runner self-hosted (label `briixosp`) ke `/opt/1panel/docker/compose/briixosp`.
2. Di 1Panel buka **Container → Compose → Create**, arahkan ke `docker-compose.yml`, lalu jalankan.
3. Buat superuser:
   `docker exec -it briixosp /pb/pocketbase superuser upsert EMAIL PASSWORD --dir /pb/pb_data`
4. Di **Website**, buat reverse proxy dengan HTTPS (misalnya `osp.briix.co.id`) ke `http://127.0.0.1:8095`.
5. Dashboard admin PocketBase ada di `https://osp.briix.co.id/_/`.

Saat container start, migrasi dijalankan otomatis.

## Isi data awal

```bash
cd tools
python3 seed.py --pb https://osp.briix.co.id --email EMAIL --password PASSWORD
# mencetak id 4 proyek; impor KMZ ke proyek TMU:
python3 import_kmz.py --pb https://osp.briix.co.id --email EMAIL --password PASSWORD \
  --project <ID_PROYEK> --kmz BJN000814_KMZ.kmz --packages --materials
```

Hasil impor KMZ TMU123.035: 1 FDT, 24 FAT, 90 tiang, 25 slack, 346 homepass, 2 kabel distribusi, 11 sling wire, 6 paket kerja, dan 7 jenis material.
Importer memberi **peringatan** untuk kode tiang yang dobel di KMZ klien. Di KMZ ini ada 2 kasus, yaitu `MR.TMU123.P032` dan `P085`. Keduanya tetap disimpan dengan akhiran `#2`. Sebaiknya dikonfirmasi ke MyRepublic.

## Tabel

`clients` → `projects` → (`assets`, `routes`, `work_packages`, `photos`, `work_items`, `opm_tests`, `relocations`, `crew_logs`, `materials`, `material_moves`, `opnames`)

- **users**: peran `admin, qc, drafter, surveyor, mandor, splicer, pemborong`. Field `projects` menentukan proyek mana yang terlihat oleh user di HP.
- **assets**: FDT, FAT, tiang, JC, slack, homepass. Posisinya ada dua, desain (KMZ) dan as-built (setelah geser disetujui).
- **work_packages**: paket borongan per proyek, berisi volume, harga satuan, pilihan *jasa saja* atau *jasa + material*, dan pelaksananya (tim atau pemborong).
- **opm_tests**: satu baris untuk satu port FAT. Kombinasi FAT + port unik, dan satu foto hanya bisa dipakai untuk satu port.

## Aturan yang dijaga server

- Teknisi hanya melihat proyek yang ditugaskan, dan pemborong hanya melihat paket miliknya.
- User tidak bisa mengubah perannya sendiri.
- **Foto**: teknisi wajib memakai kamera aplikasi (admin/QC boleh mengunggah arsip). Foto dobel di proyek yang sama ditolak lengkap dengan nama foto/FAT aslinya. Jarak foto ke titik dihitung otomatis, dan foto ditandai `far` kalau lebih dari toleransi (default 50 m, bisa diatur per proyek).
- **Uji OPM**: port harus sesuai kapasitas FAT, foto harus untuk FAT yang sama, dan Input FDT otomatis terisi dari proyek.
- **QC**: hanya admin/QC yang bisa menyetujui. Penolakan wajib disertai catatan. Server mencatat siapa yang menyetujui dan kapan.
- **Geser titik**: jaraknya dihitung server. Begitu disetujui, posisi as-built titik ikut berubah.

## Endpoint tambahan

- `GET /api/briix/projects/{id}/opname` (admin): menghitung qty yang disetujui × harga satuan per paket, beserta totalnya.
- `GET /api/briix/portal/{token}` (tanpa login): data portal klien, hanya berisi pekerjaan yang sudah disetujui QC. Token tersimpan di `projects.portal_token` dan disembunyikan dari API biasa.

## Uji

```bash
python3 tools/test_rules.py --pb http://127.0.0.1:8090 --email EMAIL --password PASSWORD --project <ID_TMU>
```

Hasil saat dibuat: **33 lolos, 0 gagal**. Uji ini membuat user contoh (`*@briix.test`), jadi jalankan di server uji, bukan di server produksi.
