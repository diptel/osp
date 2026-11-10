/// <reference path="../pb_data/types.d.ts" />
// Finish RFS: selain foto Finish FAT, ada foto Finish FDT —
//   fdt_feeder : foto tiap core feeder yang masuk FDT (seq = nomor core, jumlah
//                mengikuti projects.feeder_cores), kamera + GPS
//   fdt_finish : foto akhir FDT dari luar (kamera + GPS)
//   fdt_opm    : foto cek redaman 1 port FDT mewakili (kamera + GPS), nilai
//                dBm disimpan di photos.value_dbm
// Setelah semuanya lengkap, proyek bisa dipindah ke tahap ATP.
// Form ATP E2E (laporan jenis "atp_form") memakai logo vendor utama
// (projects.atp_logo) di kiri dan logo klien di kanan.

migrate((app) => {
  const photos = app.findCollectionByNameOrId("photos")
  const purpose = photos.fields.getByName("purpose")
  purpose.values = ["opm_port", "fat_finish", "fdt_feeder", "fdt_finish", "fdt_opm"]
  photos.fields.add(new NumberField({ name: "seq", min: 0, onlyInt: true }))
  photos.fields.add(new NumberField({ name: "value_dbm" }))
  app.save(photos)

  const projects = app.findCollectionByNameOrId("projects")
  projects.fields.add(new NumberField({ name: "feeder_cores", min: 0, onlyInt: true }))
  projects.fields.add(new FileField({
    name: "atp_logo", maxSelect: 1, maxSize: 2 * 1024 * 1024,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"], thumbs: ["400x0"],
  }))
  app.save(projects)

  const reports = app.findCollectionByNameOrId("reports")
  const kind = reports.fields.getByName("kind")
  kind.values = ["opm", "fat_finish", "manajemen", "atp_form"]
  app.save(reports)
}, (app) => {
  const photos = app.findCollectionByNameOrId("photos")
  photos.fields.getByName("purpose").values = ["opm_port", "fat_finish"]
  photos.fields.removeByName("seq")
  photos.fields.removeByName("value_dbm")
  app.save(photos)
  const projects = app.findCollectionByNameOrId("projects")
  projects.fields.removeByName("feeder_cores")
  projects.fields.removeByName("atp_logo")
  app.save(projects)
  const reports = app.findCollectionByNameOrId("reports")
  reports.fields.getByName("kind").values = ["opm", "fat_finish", "manajemen"]
  app.save(reports)
})
