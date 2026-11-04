/// <reference path="../pb_data/types.d.ts" />
// Template paket pekerjaan: daftar paket (jenis, satuan, cara hitung, harga,
// cara isi volume) yang bisa diterapkan ke proyek lain sekali klik.
// items (JSON): [{ type, name, unit, count_mode, unit_price, executor_type,
//                  volume_mode: "fats"|"fat_cores"|"ports"|"fixed", volume }]

migrate((app) => {
  const ADMIN = `@request.auth.role = "admin"`
  const c = new Collection({
    type: "base",
    name: "package_templates",
    listRule: ADMIN, viewRule: ADMIN, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "id", type: "text", system: true, required: true, primaryKey: true,
        autogeneratePattern: "[a-z0-9]{15}", pattern: "^[a-z0-9]+$", min: 15, max: 15 },
      { name: "name", type: "text", required: true },
      { name: "note", type: "text" },
      { name: "items", type: "json", maxSize: 200000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_pkg_tpl_name ON package_templates (name)"],
  })
  app.save(c)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("package_templates")) } catch (_) {}
})
