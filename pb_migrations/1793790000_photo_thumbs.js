/// <reference path="../pb_data/types.d.ts" />
// Tambah ukuran thumbnail 1200px untuk foto — dipakai Rekap Finish FAT
// supaya tulisan/label di FAT tetap terbaca di PDF (400px terlalu kecil
// untuk kotak sebesar seperempat halaman). Laporan OPM tetap 400px
// (192 foto; kalau dinaikkan PDF-nya jadi terlalu besar).

migrate((app) => {
  const photos = app.findCollectionByNameOrId("photos")
  const file = photos.fields.find((f) => f.name === "file")
  file.thumbs = ["400x0", "1200x0"]
  app.save(photos)
}, (app) => {
  const photos = app.findCollectionByNameOrId("photos")
  const file = photos.fields.find((f) => f.name === "file")
  file.thumbs = ["400x0"]
  app.save(photos)
})
