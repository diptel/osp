/// <reference path="../pb_data/types.d.ts" />
// BRIIX OSP — skema database proyek FTTH (vendor BRIIX untuk banyak klien).
// Satu klien bisa punya banyak proyek; tiap proyek berdiri sendiri
// (KMZ, titik, paket borongan, QC, opname, laporan, portal klien).

migrate((app) => {
  // ---------- helpers ----------
  const T = (name, o = {}) => ({ name, type: "text", ...o })
  const N = (name, o = {}) => ({ name, type: "number", ...o })
  const B = (name, o = {}) => ({ name, type: "bool", ...o })
  const D = (name, o = {}) => ({ name, type: "date", ...o })
  const J = (name, o = {}) => ({ name, type: "json", maxSize: 2000000, ...o })
  const G = (name, o = {}) => ({ name, type: "geoPoint", ...o })
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

  // ---------- rule fragments ----------
  const AUTH = `@request.auth.id != ""`
  const ADMIN = `@request.auth.role = "admin"`
  const STAFF = `(@request.auth.role = "admin" || @request.auth.role = "qc")`
  const OFFICE = `(@request.auth.role = "admin" || @request.auth.role = "qc" || @request.auth.role = "drafter")`
  const member = (f) => `@request.auth.projects.id ?= ${f}`
  const notPemborong = `@request.auth.role != "pemborong"`

  // ---------- clients ----------
  const clients = make({
    name: "clients",
    listRule: AUTH, viewRule: AUTH, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      T("name", { required: true }),
      T("code"),
      F("logo", { mimeTypes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] }),
      S("report_template", ["myrepublic_opm", "generic"]),
      T("notes"),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_clients_name ON clients (name)"],
  })

  // ---------- projects ----------
  const projects = make({
    name: "projects",
    listRule: `${OFFICE} || ${member("id")}`,
    viewRule: `${OFFICE} || ${member("id")}`,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      R("client", clients, { required: true }),
      T("code"),                       // kode proyek klien, mis. BJN000814
      T("name", { required: true }),
      T("region"),                     // Bojonegoro, Jakarta, Lamongan - Sukodadi, ...
      T("cluster_name"),               // Temu RW 1,2,3 Bojonegoro
      T("cluster_id"),                 // TMU 123.035
      T("olt"),
      N("fdt_input_dbm"),              // Input FDT terukur, mis. -9.84
      S("design_source", ["briix", "import"], { required: true }),
      F("kmz", { mimeTypes: [] }),
      S("status", ["draft", "survei", "desain", "berjalan", "selesai", "ditahan"], { required: true }),
      D("start_date"),
      D("target_date"),
      B("material_tracking"),
      N("gps_tolerance_m", { min: 0 }),     // batas jarak foto ke titik (default 50)
      T("portal_token", { autogeneratePattern: "[a-z0-9]{32}", hidden: true }),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_projects_token ON projects (portal_token) WHERE portal_token != ''",
      "CREATE INDEX idx_projects_client ON projects (client)",
    ],
  })

  // ---------- users (auth bawaan) ----------
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new TextField({ name: "phone" }))
  users.fields.add(new SelectField({
    name: "role", required: true, maxSelect: 1,
    values: ["admin", "qc", "drafter", "surveyor", "mandor", "splicer", "pemborong"],
  }))
  users.fields.add(new RelationField({ name: "projects", collectionId: projects.id, maxSelect: 999, cascadeDelete: false }))
  users.fields.add(new BoolField({ name: "active" }))
  users.listRule = `id = @request.auth.id || ${STAFF}`
  users.viewRule = `id = @request.auth.id || ${STAFF}`
  users.createRule = ADMIN
  // user hanya boleh ubah data dirinya sendiri, tapi tidak peran/proyek/status aktif
  users.updateRule = `${ADMIN} || (id = @request.auth.id && @request.body.role:isset = false && @request.body.projects:isset = false && @request.body.active:isset = false)`
  users.deleteRule = ADMIN
  app.save(users)

  // ---------- assets: titik jaringan (FDT/ODC/FAT/tiang/JC/slack/homepass) ----------
  const assetsTmp = make({
    name: "assets",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `${OFFICE} || (@request.auth.role = "surveyor" && ${member("@request.body.project")})`,
    updateRule: `${OFFICE} || (@request.auth.role = "surveyor" && ${member("project")})`,
    deleteRule: OFFICE,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      S("kind", ["odc", "fdt", "fat", "pole", "jc", "slack", "homepass", "other"], { required: true }),
      T("code"),                 // TMU123.035.A01, MR.TMU123.P003, NN-374
      T("line"),                 // A, B, ...
      T("subtype"),              // 7-2.5, 7-3, 1x8, FDT 48C ...
      G("design_pos"),
      G("asbuilt_pos"),
      N("ports", { min: 0 }),     // FAT 8 port, FDT 48 port
      N("fdt_port", { min: 0 }),  // port FDT yang menyuplai FAT ini (0 = belum)
      J("props"),
      S("status", ["rencana", "terpasang", "selesai"]),
    ],
  })
  // parent (FAT -> FDT, homepass -> FAT) butuh relasi ke dirinya sendiri
  assetsTmp.fields.add(new RelationField({ name: "parent", collectionId: assetsTmp.id, maxSelect: 1 }))
  assetsTmp.indexes = [
    "CREATE UNIQUE INDEX idx_assets_code ON assets (project, kind, code) WHERE code != ''",
    "CREATE UNIQUE INDEX idx_assets_fdtport ON assets (parent, fdt_port) WHERE fdt_port > 0",
    "CREATE INDEX idx_assets_project_kind ON assets (project, kind)",
  ]
  app.save(assetsTmp)
  const assets = app.findCollectionByNameOrId("assets")

  // ---------- routes: kabel feeder/distribusi, sling wire, drop ----------
  make({
    name: "routes",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: OFFICE, updateRule: OFFICE, deleteRule: OFFICE,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      S("kind", ["feeder", "distribution", "sling", "drop"], { required: true }),
      T("code"),
      T("line"),
      T("cable_type"),          // FO 48C/4T
      N("cores", { min: 0 }),
      N("length_m", { min: 0 }),          // panjang desain (dari nama/KMZ)
      N("length_geom_m", { min: 0 }),     // panjang hitung dari garis
      J("path"),                          // [[lon,lat], ...]
    ],
    indexes: ["CREATE INDEX idx_routes_project ON routes (project, kind)"],
  })
  const routes = app.findCollectionByNameOrId("routes")

  // ---------- work_packages: paket borongan / pekerjaan ----------
  const pkgView = `${STAFF} || (${member("project")} && (${notPemborong} || executor = @request.auth.id))`
  const packages = make({
    name: "work_packages",
    listRule: pkgView, viewRule: pkgView,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      S("type", ["survei", "desain", "kabel", "tiang", "jointing", "opm"], { required: true }),
      T("name", { required: true }),
      T("line"),
      S("unit", ["m", "tiang", "titik", "port", "paket"], { required: true }),
      N("volume", { min: 0 }),
      N("unit_price", { min: 0 }),
      B("includes_material"),                         // jasa saja vs jasa + material
      S("executor_type", ["tim", "pemborong"], { required: true }),
      R("executor", users),                           // mandor / pemborong / splicer
      D("start_date"),
      D("target_date"),
      S("status", ["rencana", "berjalan", "selesai"]),
    ],
    indexes: ["CREATE INDEX idx_pkg_project ON work_packages (project)"],
  })

  // ---------- photos: semua bukti foto ----------
  const photos = make({
    name: "photos",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `(${STAFF} || ${member("@request.body.project")}) && @request.body.uploaded_by = @request.auth.id`,
    updateRule: STAFF,
    deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("asset", assets),
      R("route", routes),
      F("file", { required: true, mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"], thumbs: ["400x0"] }),
      T("label"),                                   // "port 3", "cor", "tray splice"
      D("taken_at"),
      G("pos"),
      N("accuracy_m", { min: 0 }),
      S("source", ["camera", "gallery"], { required: true }),
      T("phash", { pattern: "^[0-9a-f]{16}$", required: true }), // dHash 64-bit dari PWA
      N("distance_m"),                              // diisi server: jarak ke titik
      B("far"),                                     // diisi server: di luar toleransi
      R("uploaded_by", users, { required: true }),
    ],
    indexes: ["CREATE INDEX idx_photos_project_hash ON photos (project, phash)"],
  })
  photos.fields.add(new RelationField({ name: "dup_of", collectionId: photos.id, maxSelect: 1 }))
  app.save(photos)

  // ---------- work_items: progres per tiang / segmen / titik (masuk QC) ----------
  const itemView = `${STAFF} || (${member("project")} && (${notPemborong} || package.executor = @request.auth.id))`
  make({
    name: "work_items",
    listRule: itemView, viewRule: itemView,
    createRule: `${member("@request.body.project")} && @request.body.submitted_by = @request.auth.id && @request.body.status = "submitted"`,
    updateRule: `${STAFF} || (submitted_by = @request.auth.id && status = "rejected" && @request.body.status:isset = true && @request.body.status = "submitted")`,
    deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("package", packages, { required: true }),
      R("asset", assets),
      R("route", routes),
      N("qty", { min: 0 }),
      T("step"),                                     // lubang/berdiri/cor, tarik/klem, splice
      R("photos", photos, { maxSelect: 20 }),
      S("status", ["submitted", "approved", "rejected"], { required: true }),
      R("submitted_by", users, { required: true }),
      R("qc_by", users),
      T("qc_note"),
      D("qc_at"),
      T("note"),
    ],
    indexes: ["CREATE INDEX idx_items_pkg ON work_items (package, status)"],
  })

  // ---------- opm_tests: satu baris = satu port FAT ----------
  make({
    name: "opm_tests",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `(${STAFF} || (${member("@request.body.project")} && (@request.auth.role = "splicer" || @request.auth.role = "mandor"))) && @request.body.tested_by = @request.auth.id`,
    updateRule: `${STAFF} || (tested_by = @request.auth.id && status = "rejected")`,
    deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("fat", assets, { required: true }),
      N("port_fat", { required: true, min: 1, max: 64, onlyInt: true }),
      N("opm_dbm", { required: true, min: -60, max: 10 }),
      S("wavelength", ["1310", "1490", "1550"]),
      N("input_fdt_dbm"),
      N("output_fdt_dbm"),
      R("photo", photos, { required: true }),
      D("tested_at"),
      R("tested_by", users, { required: true }),
      S("status", ["submitted", "approved", "rejected"], { required: true }),
      R("qc_by", users),
      T("qc_note"),
      D("qc_at"),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_opm_port ON opm_tests (fat, port_fat)",
      "CREATE UNIQUE INDEX idx_opm_photo ON opm_tests (photo)",
    ],
  })

  // ---------- relocations: geser titik (as-built) ----------
  make({
    name: "relocations",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: `${member("@request.body.project")} && @request.body.requested_by = @request.auth.id`,
    updateRule: STAFF,
    deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("asset", assets, { required: true }),
      G("to_pos", { required: true }),
      N("distance_m"),                               // diisi server
      S("reason", ["warga_menolak", "akses", "lainnya"], { required: true }),
      T("note"),
      R("photo", photos),
      S("status", ["submitted", "approved", "rejected"], { required: true }),
      R("requested_by", users, { required: true }),
      R("qc_by", users),
      T("qc_note"),
      D("qc_at"),
    ],
  })

  // ---------- crew_logs: absensi kru harian (tanpa akun) ----------
  make({
    name: "crew_logs",
    listRule: `${STAFF} || leader = @request.auth.id`,
    viewRule: `${STAFF} || leader = @request.auth.id`,
    createRule: `${member("@request.body.project")} && @request.body.leader = @request.auth.id`,
    updateRule: `${STAFF} || leader = @request.auth.id`,
    deleteRule: STAFF,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("package", packages),
      R("leader", users, { required: true }),
      D("date", { required: true }),
      J("workers"),                                  // ["Agus", "Budi", ...]
      N("count", { min: 0, onlyInt: true }),
      T("note"),
    ],
  })

  // ---------- materials (opsional per proyek) ----------
  const materials = make({
    name: "materials",
    listRule: `${OFFICE} || ${member("project")}`,
    viewRule: `${OFFICE} || ${member("project")}`,
    createRule: STAFF, updateRule: STAFF, deleteRule: STAFF,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      T("name", { required: true }),
      T("unit"),
      N("need_qty", { min: 0 }),                     // kebutuhan dari KMZ
      S("source", ["briix", "klien", "pemborong"]),
      T("kmz_key"),                                  // kunci impor (cable:A, pole:7-3, ...)
    ],
    indexes: ["CREATE UNIQUE INDEX idx_mat_key ON materials (project, kmz_key) WHERE kmz_key != ''"],
  })
  make({
    name: "material_moves",
    listRule: `${STAFF} || ${member("project")}`,
    viewRule: `${STAFF} || ${member("project")}`,
    createRule: `${STAFF} || (@request.auth.role = "mandor" && ${member("@request.body.project")} && @request.body.by = @request.auth.id)`,
    updateRule: STAFF, deleteRule: STAFF,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("material", materials, { required: true }),
      S("direction", ["masuk", "keluar", "kembali", "terpasang"], { required: true }),
      N("qty", { required: true }),
      D("date"),
      R("by", users),
      T("note"),
    ],
  })

  // ---------- opnames: berita acara opname & pembayaran ----------
  make({
    name: "opnames",
    listRule: `${ADMIN} || package.executor = @request.auth.id`,
    viewRule: `${ADMIN} || package.executor = @request.auth.id`,
    createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      R("project", projects, { required: true, cascadeDelete: true }),
      R("package", packages, { required: true }),
      D("period_start"),
      D("period_end"),
      N("approved_qty", { min: 0 }),
      N("amount", { min: 0 }),
      N("paid_amount", { min: 0 }),
      S("status", ["draft", "terbit", "dibayar_sebagian", "lunas"], { required: true }),
      F("doc", { mimeTypes: ["application/pdf"] }),
      T("note"),
    ],
  })
}, (app) => {
  for (const n of ["opnames", "material_moves", "materials", "crew_logs", "relocations", "opm_tests",
                   "work_items", "photos", "work_packages", "routes", "assets"]) {
    try { app.delete(app.findCollectionByNameOrId(n)) } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users")
  for (const f of ["phone", "role", "projects", "active"]) users.fields.removeByName(f)
  app.save(users)
  for (const n of ["projects", "clients"]) {
    try { app.delete(app.findCollectionByNameOrId(n)) } catch (_) {}
  }
})
