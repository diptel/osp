/// <reference path="../pb_data/types.d.ts" />
// Migrasi DATA (bukan skema): susun paket pekerjaan TMU123.035 sesuai cara
// bayar klien — OPM per FAT, jointing per core (sisi FAT & sisi FDT),
// Join JB Feeder 5 core, Join FDT uplink 5 core (5 splitter 1:8, 3 aktif).
// Harga satuan dibiarkan 0 — diisi admin. Idempotent: paket yang sudah
// ada (per nama) tidak dibuat ulang. Di DB tanpa proyek ini (CI) dilewati.

migrate((app) => {
  const PID = "giouyf3kr1mgiwz"
  let project
  try { project = app.findRecordById("projects", PID) } catch (_) { return }

  const pkgs = app.findCollectionByNameOrId("work_packages")
  const existing = app.findRecordsByFilter("work_packages", "project = {:p}", "", 0, 0, { p: PID })
  const byName = (n) => existing.find((r) => r.getString("name") === n)
  const byType = (t) => existing.find((r) => r.getString("type") === t)

  // total core FAT (kosong = 1 core per 8 port)
  let cores = 0
  for (const fat of app.findRecordsByFilter("assets", "project = {:p} && kind = 'fat'", "", 0, 0, { p: PID })) {
    cores += fat.getInt("cores") || Math.ceil((fat.getInt("ports") || 8) / 8)
  }
  const fats = app.findRecordsByFilter("assets", "project = {:p} && kind = 'fat'", "", 0, 0, { p: PID }).length

  const upsert = (name, fields, reuse) => {
    let r = byName(name) || reuse
    if (!r) {
      r = new Record(pkgs)
      r.set("project", PID)
      r.set("status", "rencana")
      r.set("executor_type", "tim")
    }
    r.set("name", name)
    for (const k of Object.keys(fields)) r.set(k, fields[k])
    app.save(r)
    return r
  }

  // 1. OPM per FAT — pakai ulang paket opm hasil impor KMZ
  const opm = byName("Pasang & Uji OPM") || byType("opm")
  upsert("Pasang & Uji OPM", { type: "opm", unit: "fat", volume: fats || 24, count_mode: "fats_approved" }, opm)

  // 2. Jointing FAT — pakai ulang paket jointing hasil impor KMZ
  const joint = byName("Jointing FAT") || byName("Jointing FDT + FAT") || byType("jointing")
  upsert("Jointing FAT", { type: "jointing", unit: "core", volume: cores, count_mode: "fat_cores_approved", line: "" }, joint)

  // 3. Jointing FDT sisi FAT (core yang sama di FDT)
  upsert("Jointing FDT (sisi FAT)", { type: "jointing", unit: "core", volume: cores, count_mode: "fat_cores_approved" })

  // 4 & 5. Feeder: JB feeder 5 core, uplink FDT 5 core (5 splitter 1:8, 3 aktif)
  upsert("Join JB Feeder", { type: "jointing", unit: "core", volume: 5, count_mode: "manual", manual_qty: 0 })
  upsert("Join FDT uplink (feeder ke splitter)", { type: "jointing", unit: "core", volume: 5, count_mode: "manual", manual_qty: 0 })
}, (app) => {
  // tidak dibalik — ini penyesuaian data
})
