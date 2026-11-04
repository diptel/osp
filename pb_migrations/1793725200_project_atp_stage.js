/// <reference path="../pb_data/types.d.ts" />
// Tambah tahap pasca-RFS: RFS -> ATP -> Revisi ATP -> Lunas.
// "selesai" & "ditahan" lama tetap dipertahankan untuk data lama.

migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects")
  const status = projects.fields.getByName("status")
  status.values = ["draft", "survei", "desain", "berjalan", "rfs", "atp", "revisi_atp", "lunas", "selesai", "ditahan"]
  app.save(projects)
}, (app) => {
  const projects = app.findCollectionByNameOrId("projects")
  const status = projects.fields.getByName("status")
  status.values = ["draft", "survei", "desain", "berjalan", "selesai", "ditahan"]
  app.save(projects)
})
