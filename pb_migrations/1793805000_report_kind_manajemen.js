/// <reference path="../pb_data/types.d.ts" />
// Jenis laporan baru: "manajemen" (laporan manajemen proyek internal).
migrate((app) => {
  const c = app.findCollectionByNameOrId("reports")
  const f = c.fields.getByName("kind")
  f.values = ["opm", "fat_finish", "manajemen"]
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId("reports")
  const f = c.fields.getByName("kind")
  f.values = ["opm", "fat_finish"]
  app.save(c)
})
