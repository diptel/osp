/// <reference path="../pb_data/types.d.ts" />
// Bedakan jenis laporan tersimpan: rekap OPM vs rekap foto Finish FAT.

migrate((app) => {
  const reports = app.findCollectionByNameOrId("reports")
  reports.fields.add(new SelectField({
    name: "kind",
    maxSelect: 1,
    values: ["opm", "fat_finish"],
  }))
  app.save(reports)
}, (app) => {
  const reports = app.findCollectionByNameOrId("reports")
  reports.fields.removeByName("kind")
  app.save(reports)
})
