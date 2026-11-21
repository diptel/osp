/// <reference path="../pb_data/types.d.ts" />
// Uji OPM boleh dikirim oleh anggota proyek dengan peran lapangan apa pun
// (sebelumnya hanya splicer & mandor → surveyor/pemborong gagal "Gagal menyimpan").
migrate((app) => {
  const c = app.findCollectionByNameOrId("opm_tests")
  c.createRule = `((@request.auth.role = "admin" || @request.auth.role = "qc") || @request.auth.projects.id ?= @request.body.project) && @request.body.tested_by = @request.auth.id`
  app.save(c)
}, (app) => {
  const c = app.findCollectionByNameOrId("opm_tests")
  c.createRule = `((@request.auth.role = "admin" || @request.auth.role = "qc") || (@request.auth.projects.id ?= @request.body.project && (@request.auth.role = "splicer" || @request.auth.role = "mandor"))) && @request.body.tested_by = @request.auth.id`
  app.save(c)
})
