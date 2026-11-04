/// <reference path="../pb_data/types.d.ts" />
// Laporan PDF tersimpan per proyek — supaya teknisi/admin tidak perlu
// generate ulang tiap kali butuh laporan. Admin bisa hapus; teknisi/admin
// bisa generate laporan baru (nambah entri baru, bukan menimpa yang lama).

migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects")
  const users = app.findCollectionByNameOrId("users")

  const OFFICE = `(@request.auth.role = "admin" || @request.auth.role = "qc" || @request.auth.role = "drafter")`
  const ADMIN = `@request.auth.role = "admin"`
  const member = (f) => `@request.auth.projects.id ?= ${f}`

  const collection = new Collection({
    type: "base",
    name: "reports",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `${member("@request.body.project")} && @request.body.generated_by = @request.auth.id`,
    updateRule: ADMIN,
    deleteRule: ADMIN,
    fields: [
      {
        name: "id", type: "text", system: true, required: true, primaryKey: true,
        autogeneratePattern: "[a-z0-9]{15}", pattern: "^[a-z0-9]+$", min: 15, max: 15,
      },
      { name: "project", type: "relation", required: true, cascadeDelete: true, collectionId: projects.id, maxSelect: 1 },
      { name: "label", type: "text" },
      {
        name: "file", type: "file", required: true, maxSelect: 1,
        maxSize: 20 * 1024 * 1024, mimeTypes: ["application/pdf"],
      },
      { name: "generated_by", type: "relation", required: true, collectionId: users.id, maxSelect: 1 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_reports_project ON reports (project, created)"],
  })
  app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("reports")) } catch (_) {}
})
