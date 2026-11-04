/// <reference path="../pb_data/types.d.ts" />
// Opname: harga paket bisa per FAT / per core, bukan cuma per port.
// - work_packages.unit: + "fat", "core"
// - work_packages.count_mode: cara hitung volume disetujui untuk opname
//     ports_approved     = jumlah port OPM disetujui QC (lama, default opm)
//     fats_approved      = jumlah FAT yang SEMUA portnya disetujui QC
//     fat_cores_approved = jumlah core FAT (assets.cores) dari FAT yang selesai
//                          (dipakai Jointing FAT dan Jointing FDT sisi FAT)
//     work_items         = jumlah qty progres kerja disetujui QC (lama, default lain)
//     manual             = diisi admin langsung (manual_qty), mis. Join Feeder 3 core
// - work_packages.manual_qty
// - assets.cores: jumlah core yang di-splice ke FAT (kosong = ceil(ports/8))

migrate((app) => {
  const pkgs = app.findCollectionByNameOrId("work_packages")
  const unit = pkgs.fields.getByName("unit")
  unit.values = ["m", "tiang", "titik", "port", "fat", "core", "paket"]
  pkgs.fields.add(new SelectField({
    name: "count_mode", maxSelect: 1,
    values: ["ports_approved", "fats_approved", "fat_cores_approved", "work_items", "manual"],
  }))
  pkgs.fields.add(new NumberField({ name: "manual_qty", min: 0 }))
  app.save(pkgs)

  const assets = app.findCollectionByNameOrId("assets")
  assets.fields.add(new NumberField({ name: "cores", min: 0, onlyInt: true }))
  app.save(assets)
}, (app) => {
  const pkgs = app.findCollectionByNameOrId("work_packages")
  const unit = pkgs.fields.getByName("unit")
  unit.values = ["m", "tiang", "titik", "port", "paket"]
  pkgs.fields.removeByName("count_mode")
  pkgs.fields.removeByName("manual_qty")
  app.save(pkgs)
  const assets = app.findCollectionByNameOrId("assets")
  assets.fields.removeByName("cores")
  app.save(assets)
})
