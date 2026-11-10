/// <reference path="../pb_data/types.d.ts" />
// Jenis laporan "fdt_finish": Rekap Foto Finish FDT (core feeder + FDT luar + OPM).
migrate((app) => {
  const c = app.findCollectionByNameOrId("reports")
  c.fields.getByName("kind").values = ["opm", "fat_finish", "manajemen", "atp_form", "fdt_finish"]
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId("reports")
  c.fields.getByName("kind").values = ["opm", "fat_finish", "manajemen", "atp_form"]
  app.save(c)
})
