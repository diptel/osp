/// <reference path="../pb_data/types.d.ts" />
// Manajemen proyek: pekerja (bulanan/freelance + tarif), tarif khusus per
// proyek, absensi harian (hadir + lembur per kejadian), dan biaya proyek
// (alat, makan, transport, sewa pickup, ...). Input oleh admin & surveyor
// anggota proyek; hapus hanya admin.

migrate((app) => {
  const T = (name, o = {}) => ({ name, type: "text", ...o })
  const N = (name, o = {}) => ({ name, type: "number", ...o })
  const B = (name, o = {}) => ({ name, type: "bool", ...o })
  const D = (name, o = {}) => ({ name, type: "date", ...o })
  const S = (name, values, o = {}) => ({ name, type: "select", values, maxSelect: 1, ...o })
  const F = (name, o = {}) => ({ name, type: "file", maxSelect: 1, maxSize: 15 * 1024 * 1024, ...o })
  const R = (name, col, o = {}) => ({ name, type: "relation", collectionId: col.id, maxSelect: 1, cascadeDelete: false, ...o })
  const STAMPS = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ]
  const make = (def) => {
    const c = new Collection({ type: "base", ...def, fields: [...def.fields, ...STAMPS] })
    app.save(c)
    return app.findCollectionByNameOrId(def.name)
  }

  const ADMIN = `@request.auth.role = "admin"`
  const OFFICE = `(@request.auth.role = "admin" || @request.auth.role = "qc" || @request.auth.role = "drafter")`
  const member = (f) => `@request.auth.projects.id ?= ${f}`
  // yang boleh input absensi/biaya: admin, atau surveyor anggota proyek itu
  const INPUT_NEW = `(${ADMIN} || (@request.auth.role = "surveyor" && ${member("@request.body.project")}))`
  const INPUT_OWN = `(${ADMIN} || (@request.auth.role = "surveyor" && ${member("project")}))`

  const projects = app.findCollectionByNameOrId("projects")
  const users = app.findCollectionByNameOrId("users")

  // target & anggaran proyek
  projects.fields.add(new NumberField({ name: "target_days", min: 0, onlyInt: true }))
  projects.fields.add(new NumberField({ name: "budget", min: 0 }))
  app.save(projects)

  // ---------- workers: master pekerja (tidak harus punya akun) ----------
  const workers = make({
    name: "workers",
    listRule: `@request.auth.id != "" && @request.auth.role != "pemborong"`,
    viewRule: `@request.auth.id != "" && @request.auth.role != "pemborong"`,
    createRule: `(${ADMIN} || @request.auth.role = "surveyor")`,
    updateRule: `(${ADMIN} || @request.auth.role = "surveyor")`,
    deleteRule: ADMIN,
    fields: [
      T("name", { required: true }),
      T("phone"),
      S("employment", ["bulanan", "freelance"], { required: true }),
      N("daily_rate", { min: 0 }),      // tarif per hari (bulanan: alokasi gaji per hari kerja)
      N("overtime_rate", { min: 0 }),   // tarif per kejadian lembur
      R("user", users),                 // opsional: tautan ke akun app
      B("active"),
      T("note"),
    ],
    indexes: ["CREATE INDEX idx_workers_name ON workers (name)"],
  })

  // ---------- project_rates: tarif khusus per proyek (menimpa tarif profil) ----------
  make({
    name: "project_rates",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("worker", workers, { required: true, cascadeDelete: true }),
      N("daily_rate", { min: 0 }),
      N("overtime_rate", { min: 0 }),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_project_rates_unique ON project_rates (project, worker)"],
  })

  // ---------- attendance: absensi harian per pekerja ----------
  make({
    name: "attendance",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `${INPUT_NEW} && @request.body.entered_by = @request.auth.id`,
    updateRule: INPUT_OWN,
    deleteRule: INPUT_OWN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("worker", workers, { required: true, cascadeDelete: true }),
      D("date", { required: true }),
      B("present"),
      N("overtime", { min: 0, onlyInt: true }),   // jumlah kejadian lembur hari itu
      T("note"),
      R("entered_by", users, { required: true }),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_attendance_unique ON attendance (project, worker, date)"],
  })

  // ---------- project_expenses: biaya proyek ----------
  make({
    name: "project_expenses",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `${INPUT_NEW} && @request.body.entered_by = @request.auth.id`,
    updateRule: INPUT_OWN,
    deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      D("date", { required: true }),
      S("category", ["alat", "makan", "transport", "sewa_pickup", "material", "lain"], { required: true }),
      N("amount", { required: true, min: 0 }),
      T("note"),
      F("receipt", { mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] }),
      R("entered_by", users, { required: true }),
    ],
    indexes: ["CREATE INDEX idx_expenses_project_date ON project_expenses (project, date)"],
  })
}, (app) => {
  for (const n of ["project_expenses", "attendance", "project_rates", "workers"]) {
    try { app.delete(app.findCollectionByNameOrId(n)) } catch (_) {}
  }
  const projects = app.findCollectionByNameOrId("projects")
  projects.fields.removeByName("target_days")
  projects.fields.removeByName("budget")
  app.save(projects)
})
