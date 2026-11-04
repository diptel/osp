/// <reference path="../pb_data/types.d.ts" />
// Nama aplikasi untuk tab browser & judul halaman admin PocketBase (/_/).
// Catatan: dashboard /_/ sendiri adalah bundel React bawaan PocketBase,
// tidak ada slot logo kustom di sana tanpa compile ulang binary —
// logo BRIIX OSP dipasang di halaman root (pb_public/index.html) dan
// di aplikasi web/PWA (web/src/components/BriixLogo.tsx) saja.

migrate((app) => {
  const settings = app.settings()
  settings.meta.appName = "BRIIX OSP"
  settings.meta.appURL = "https://osp.briix.co.id"
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.meta.appName = "PocketBase"
  app.save(settings)
})
