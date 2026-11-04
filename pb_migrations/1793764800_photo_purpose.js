/// <reference path="../pb_data/types.d.ts" />
// Foto "ODP Finish" (dokumentasi box ODP/FDT yang sudah selesai, syarat
// tambahan setelah RFS) — beda dari foto uji OPM per port: boleh diimpor
// dari galeri/PC, tidak wajib dari kamera aplikasi.

migrate((app) => {
  const photos = app.findCollectionByNameOrId("photos")
  photos.fields.add(new SelectField({
    name: "purpose",
    maxSelect: 1,
    values: ["opm_port", "odp_finish"],
  }))
  app.save(photos)
}, (app) => {
  const photos = app.findCollectionByNameOrId("photos")
  photos.fields.removeByName("purpose")
  app.save(photos)
})
