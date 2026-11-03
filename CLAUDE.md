# BRIIX OSP — aturan teknis repo

Aplikasi proyek lapangan FTTH untuk lini **BRIIX OSP** (BRIIX sebagai kontraktor/vendor proyek untuk
ISP lain: MyRepublic, Fistmedia, dan BRIIX Infra sebagai salah satu klien). Bukan aset milik BRIIX Infra.

## Stack
- Backend: **PocketBase v0.40.6** (versi dikunci di `Dockerfile` dan workflow; naikkan bersamaan).
- Skema: `pb_migrations/` (JS). **Jangan ubah migrasi yang sudah terpasang di server** — buat file migrasi baru.
- Aturan server: `pb_hooks/` (JSVM). Fungsi bantu wajib lewat `require(\`${__hooks}/utils.js\`)`; fungsi
  tingkat atas di file `.pb.js` tidak terlihat dari dalam handler.
- PWA nanti di `pb_public/` (disajikan PocketBase di domain yang sama).

## Server & deploy
- Domain: **https://osp.briix.co.id** → reverse proxy 1Panel (SSL Let's Encrypt) ke `127.0.0.1:8095`.
- Folder: `/opt/1panel/docker/compose/briixosp`, container `briixosp`, data di `pb_data/` (tidak pernah
  disentuh deploy).
- Push ke `main` → `.github/workflows/deploy.yml` di runner self-hosted label `briixosp`:
  uji migrasi di DB kosong, rsync, `docker compose up -d --build`, cek `/api/health`.
- 1Panel tidak di-upgrade.

## Uji
- `tools/test_rules.py` (33 uji) — hanya ke server uji/lokal, membuat user `*@briix.test`.
- Jalankan lokal: `./pocketbase migrate up && ./pocketbase serve --dev`.

## Aturan
- Kata sandi/token/secret tidak ditulis di repo atau chat; diisi pemilik.
- n8n (instance xflow): awalan workflow `BRIIXOSP_`.
- Commit diakhiri baris atribusi Claude.
