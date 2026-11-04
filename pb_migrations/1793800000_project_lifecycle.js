/// <reference path="../pb_data/types.d.ts" />
// Siklus hidup proyek: status "dibatalkan" (dengan alasan) + penanda arsip.
// Arsip sengaja BUKAN status, supaya proyek selesai/dibatalkan bisa
// diarsipkan tanpa kehilangan status terakhirnya (bisa dipulihkan).

migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects")
  const status = projects.fields.getByName("status")
  status.values = ["draft", "survei", "desain", "berjalan", "rfs", "atp", "revisi_atp", "lunas", "selesai", "ditahan", "dibatalkan"]
  projects.fields.add(new BoolField({ name: "archived" }))
  projects.fields.add(new TextField({ name: "cancel_reason" }))
  projects.fields.add(new DateField({ name: "archived_at" }))
  app.save(projects)
}, (app) => {
  const projects = app.findCollectionByNameOrId("projects")
  const status = projects.fields.getByName("status")
  status.values = ["draft", "survei", "desain", "berjalan", "rfs", "atp", "revisi_atp", "lunas", "selesai", "ditahan"]
  projects.fields.removeByName("archived")
  projects.fields.removeByName("cancel_reason")
  projects.fields.removeByName("archived_at")
  app.save(projects)
})
