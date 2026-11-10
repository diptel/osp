/// <reference path="../pb_data/types.d.ts" />
// - projects.opm_limit_enabled / opm_min_dbm: batas redaman minimal yang
//   boleh disetujui QC (berlaku untuk port FAT dan cek 1 port FDT). Nilai
//   dBm di bawah batas (lebih negatif) tidak bisa disetujui.
// - photos.place: nama lokasi (desa, kecamatan, kabupaten) hasil reverse
//   geocode saat foto diambil, ikut dibakar di stempel.
migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects")
  projects.fields.add(new BoolField({ name: "opm_limit_enabled" }))
  projects.fields.add(new NumberField({ name: "opm_min_dbm", min: -60, max: 10 }))
  app.save(projects)
  const photos = app.findCollectionByNameOrId("photos")
  photos.fields.add(new TextField({ name: "place" }))
  app.save(photos)
}, (app) => {
  const projects = app.findCollectionByNameOrId("projects")
  projects.fields.removeByName("opm_limit_enabled")
  projects.fields.removeByName("opm_min_dbm")
  app.save(projects)
  const photos = app.findCollectionByNameOrId("photos")
  photos.fields.removeByName("place")
  app.save(photos)
})
