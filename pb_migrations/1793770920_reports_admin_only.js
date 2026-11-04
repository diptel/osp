/// <reference path="../pb_data/types.d.ts" />
// Generate laporan PDF dibatasi admin saja (bukan semua anggota proyek).

migrate((app) => {
  const reports = app.findCollectionByNameOrId("reports")
  reports.createRule = `@request.auth.role = "admin" && @request.body.generated_by = @request.auth.id`
  app.save(reports)
}, (app) => {
  const reports = app.findCollectionByNameOrId("reports")
  const member = (f) => `@request.auth.projects.id ?= ${f}`
  reports.createRule = `${member("@request.body.project")} && @request.body.generated_by = @request.auth.id`
  app.save(reports)
})
