/// <reference path="../pb_data/types.d.ts" />
// Ganti nama nilai "odp_finish" -> "fat_finish" di field photos.purpose.
// Belum ada data terpakai (fitur baru dibuat, belum sempat dipakai), jadi
// aman diganti langsung tanpa migrasi data.

migrate((app) => {
  const photos = app.findCollectionByNameOrId("photos")
  const purpose = photos.fields.getByName("purpose")
  purpose.values = ["opm_port", "fat_finish"]
  app.save(photos)
}, (app) => {
  const photos = app.findCollectionByNameOrId("photos")
  const purpose = photos.fields.getByName("purpose")
  purpose.values = ["opm_port", "odp_finish"]
  app.save(photos)
})
