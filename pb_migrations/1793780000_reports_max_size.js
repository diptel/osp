/// <reference path="../pb_data/types.d.ts" />
// Laporan dengan banyak foto (proyek besar, ratusan port) bisa gampang
// lewat 20MB — naikkan batas file ke 80MB supaya laporan yang sah tidak
// ditolak validasi ukuran file.

migrate((app) => {
  const reports = app.findCollectionByNameOrId("reports")
  const file = reports.fields.find((f) => f.name === "file")
  file.maxSize = 80 * 1024 * 1024
  app.save(reports)
}, (app) => {
  const reports = app.findCollectionByNameOrId("reports")
  const file = reports.fields.find((f) => f.name === "file")
  file.maxSize = 20 * 1024 * 1024
  app.save(reports)
})
