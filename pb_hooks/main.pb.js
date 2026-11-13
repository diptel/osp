/// <reference path="../pb_data/types.d.ts" />
// BRIIX OSP — aturan server yang tidak bisa diakali dari aplikasi HP.


// ============================================================
// FOTO: tolak foto galeri, tolak foto dobel, hitung jarak ke titik
// ============================================================
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/utils.js`)
  const r = e.record
  const staff = u.isStaff(e.auth)

  // 1. Foto lapangan wajib dari kamera aplikasi (admin/QC boleh unggah arsip lama).
  //    Pengecualian: foto "FAT Finish" (dokumentasi FAT yang sudah selesai & semua
  //    port terverifikasi, syarat tambahan setelah RFS) boleh dari galeri HP atau
  //    file PC, siapa saja member proyek.
  if (r.getString("source") !== "camera" && r.getString("purpose") !== "fat_finish" && !staff) {
    throw new BadRequestError("Foto harus diambil langsung dari kamera aplikasi, bukan dari galeri.")
  }

  // 2. Foto dobel: bandingkan sidik foto dengan semua foto di proyek yang sama.
  //    Dilewati untuk foto "FAT Finish" — itu cuma syarat dokumentasi, wajar
  //    kalau beberapa box/closure yang sudah selesai kelihatan mirip, bukan
  //    indikasi foto dicurangi seperti pada foto uji OPM per port.
  const hash = r.getString("phash").toLowerCase()
  r.set("phash", hash)
  if (r.getString("purpose") !== "fat_finish") {
    const others = e.app.findRecordsByFilter("photos", "project = {:p}", "", 0, 0, { p: r.getString("project") })
    for (const o of others) {
      if (u.hamming(hash, o.getString("phash")) <= u.DUP_BITS) {
        const label = o.getString("label") || o.id
        let where = ""
        if (o.getString("asset")) {
          try { where = " (" + e.app.findRecordById("assets", o.getString("asset")).getString("code") + ")" } catch (_) {}
        }
        throw new BadRequestError(`Foto ini sama dengan foto yang sudah dipakai: ${label}${where}. Ambil foto baru di lokasi.`)
      }
    }
  }

  // 3. Jarak foto ke titik (FAT/tiang/dll)
  const assetId = r.getString("asset")
  const pos = u.geo(r, "pos")
  if (assetId && pos) {
    const asset = e.app.findRecordById("assets", assetId)
    if (asset.getString("project") !== r.getString("project")) {
      throw new BadRequestError("Titik tidak termasuk proyek ini.")
    }
    const d = u.distanceM(pos, u.assetPos(asset))
    if (d !== null) {
      const project = e.app.findRecordById("projects", r.getString("project"))
      const tol = project.getInt("gps_tolerance_m") || 50
      r.set("distance_m", d)
      r.set("far", d > tol)
    }
  }
  e.next()
}, "photos")

// ============================================================
// UJI OPM: satu foto = satu port, port sesuai kapasitas FAT
// ============================================================
onRecordCreateRequest((e) => {
  const r = e.record
  const projectId = r.getString("project")
  const fat = e.app.findRecordById("assets", r.getString("fat"))
  if (fat.getString("kind") !== "fat" || fat.getString("project") !== projectId) {
    throw new BadRequestError("FAT tidak valid untuk proyek ini.")
  }
  const maxPort = fat.getInt("ports") || 8
  if (r.getInt("port_fat") < 1 || r.getInt("port_fat") > maxPort) {
    throw new BadRequestError(`Port FAT harus 1–${maxPort}.`)
  }
  const photo = e.app.findRecordById("photos", r.getString("photo"))
  if (photo.getString("project") !== projectId) {
    throw new BadRequestError("Foto bukan dari proyek ini.")
  }
  if (photo.getString("asset") && photo.getString("asset") !== fat.id) {
    throw new BadRequestError("Foto ini diambil untuk titik lain, bukan untuk FAT " + fat.getString("code") + ".")
  }
  if (!photo.getString("asset")) {
    photo.set("asset", fat.id)
    e.app.save(photo)
  }
  if (!r.get("input_fdt_dbm")) {
    const project = e.app.findRecordById("projects", projectId)
    r.set("input_fdt_dbm", project.get("fdt_input_dbm"))
  }
  if (!require(`${__hooks}/utils.js`).isStaff(e.auth)) r.set("status", "submitted")
  e.next()
}, "opm_tests")

// ============================================================
// GESER TITIK: hitung jarak saat diajukan
// ============================================================
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/utils.js`)
  const r = e.record
  const asset = e.app.findRecordById("assets", r.getString("asset"))
  if (asset.getString("project") !== r.getString("project")) {
    throw new BadRequestError("Titik tidak termasuk proyek ini.")
  }
  r.set("distance_m", u.distanceM(u.assetPos(asset), u.geo(r, "to_pos")))
  r.set("status", "submitted")
  e.next()
}, "relocations")

// ============================================================
// QC: catat siapa & kapan; tolak wajib ada catatan
// ============================================================
onRecordUpdateRequest((e) => {
  const r = e.record
  const st = r.getString("status")
  const before = r.original().getString("status")
  if (st !== before && (st === "approved" || st === "rejected")) {
    if (!require(`${__hooks}/utils.js`).isStaff(e.auth)) throw new ForbiddenError("Hanya admin/QC yang boleh menyetujui atau menolak.")
    if (st === "rejected" && !r.getString("qc_note").trim()) {
      throw new BadRequestError("Catatan QC wajib diisi kalau ditolak.")
    }
    // Batas redaman proyek: uji OPM di bawah batas tidak bisa disetujui
    if (st === "approved" && e.collection.name === "opm_tests") {
      const project = e.app.findRecordById("projects", r.getString("project"))
      if (project.getBool("opm_limit_enabled")) {
        const min = project.getFloat("opm_min_dbm")
        if (r.getFloat("opm_dbm") < min) {
          throw new BadRequestError(`Redaman ${r.getFloat("opm_dbm")} dBm di bawah batas proyek (${min} dBm) — tidak bisa disetujui, perlu perbaikan.`)
        }
      }
    }
    r.set("qc_by", e.auth.id)
    r.set("qc_at", new DateTime())
  }
  e.next()
}, "work_items", "opm_tests", "relocations")

// Geser titik disetujui -> posisi as-built titik ikut berubah
onRecordAfterUpdateSuccess((e) => {
  const r = e.record
  if (r.getString("status") === "approved" && r.original().getString("status") !== "approved") {
    const asset = e.app.findRecordById("assets", r.getString("asset"))
    asset.set("asbuilt_pos", r.get("to_pos"))
    e.app.save(asset)
  }
  e.next()
}, "relocations")

// ============================================================
// OPNAME: hitung volume disetujui QC x harga satuan per paket
// GET /api/briix/projects/{id}/opname   (admin)
// ============================================================
routerAdd("GET", "/api/briix/projects/{id}/opname", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") throw new ForbiddenError("Khusus admin.")
  const pid = e.request.pathValue("id")
  e.app.findRecordById("projects", pid)
  const r = require(`${__hooks}/utils.js`).packageProgress(e.app, pid)
  return e.json(200, Object.assign({ project: pid }, r))
})

// Ringkasan dasbor admin: nilai kontrak, opname, biaya, dan L/R semua proyek
// (tidak diarsip). GET /api/briix/dashboard/summary   (admin)
routerAdd("GET", "/api/briix/dashboard/summary", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") throw new ForbiddenError("Khusus admin.")
  const u = require(`${__hooks}/utils.js`)
  const workersById = {}
  for (const w of e.app.findRecordsByFilter("workers", "id != ''", "", 0, 0)) workersById[w.id] = w
  const rows = []
  for (const p of e.app.findRecordsByFilter("projects", "archived = false", "-created", 0, 0)) {
    const pid = p.id
    const prog = u.packageProgress(e.app, pid)
    const cost = u.projectCost(e.app, pid, workersById)
    rows.push({
      id: pid, code: p.getString("code"), cluster_id: p.getString("cluster_id"),
      cluster_name: p.getString("cluster_name"), name: p.getString("name"), status: p.getString("status"),
      contract_value: prog.contract_value, opname_total: prog.total_amount,
      labor: cost.labor, labor_tunai: cost.labor_tunai, expenses: cost.expenses,
      margin: prog.total_amount - cost.labor - cost.expenses,
    })
  }
  return e.json(200, { projects: rows })
})

// Progres paket untuk anggota proyek (app teknisi) — TANPA harga/nominal.
routerAdd("GET", "/api/briix/projects/{id}/progress", (e) => {
  if (!e.auth) throw new ForbiddenError("Perlu login.")
  const pid = e.request.pathValue("id")
  e.app.findRecordById("projects", pid)
  const role = e.auth.getString("role")
  const office = role === "admin" || role === "qc" || role === "drafter"
  const member = (e.auth.get("projects") || []).indexOf(pid) >= 0
  if (!office && !member) throw new ForbiddenError("Bukan anggota proyek ini.")
  const r = require(`${__hooks}/utils.js`).packageProgress(e.app, pid)
  const packages = r.packages.map((p) => ({
    package: p.package, type: p.type, name: p.name, line: p.line, unit: p.unit,
    volume: p.volume, approved_qty: p.approved_qty, count_mode: p.count_mode,
  }))
  return e.json(200, { project: pid, packages, fats_done: r.fats_done, cores_done: r.cores_done, ports_approved: r.ports_approved })
})

// ============================================================
// FINISH RFS → ATP
// GET  /api/briix/projects/{id}/rfs-status    checklist kelengkapan (anggota/staf)
// POST /api/briix/projects/{id}/rfs-complete  pindah ke tahap ATP kalau lengkap
//                                              (admin, atau surveyor anggota)
// ============================================================
routerAdd("GET", "/api/briix/projects/{id}/rfs-status", (e) => {
  if (!e.auth) throw new ForbiddenError("Perlu login.")
  const pid = e.request.pathValue("id")
  const role = e.auth.getString("role")
  const office = role === "admin" || role === "qc" || role === "drafter"
  if (!office && (e.auth.get("projects") || []).indexOf(pid) < 0) throw new ForbiddenError("Bukan anggota proyek ini.")
  return e.json(200, require(`${__hooks}/utils.js`).rfsChecklist(e.app, pid))
})

routerAdd("POST", "/api/briix/projects/{id}/rfs-complete", (e) => {
  if (!e.auth) throw new ForbiddenError("Perlu login.")
  const pid = e.request.pathValue("id")
  const role = e.auth.getString("role")
  const member = (e.auth.get("projects") || []).indexOf(pid) >= 0
  if (role !== "admin" && !(role === "surveyor" && member)) throw new ForbiddenError("Hanya admin atau surveyor anggota proyek.")
  const c = require(`${__hooks}/utils.js`).rfsChecklist(e.app, pid)
  if (!c.complete) throw new BadRequestError("Checklist Finish RFS belum lengkap.")
  const project = e.app.findRecordById("projects", pid)
  const st = project.getString("status")
  if (["atp", "revisi_atp", "lunas", "selesai"].indexOf(st) >= 0) return e.json(200, { status: st, changed: false })
  project.set("status", "atp")
  e.app.save(project)
  return e.json(200, { status: "atp", changed: true })
})

// ============================================================
// PORTAL KLIEN: link tanpa login, hanya data yang sudah disetujui QC
// GET /api/briix/portal/{token}
// ============================================================
routerAdd("GET", "/api/briix/portal/{token}", (e) => {
  const token = e.request.pathValue("token")
  if (!token || token.length < 24) throw new NotFoundError()
  let project
  try {
    project = e.app.findFirstRecordByFilter("projects", "portal_token = {:t}", { t: token })
  } catch (_) {
    throw new NotFoundError()
  }
  const pid = project.id
  const client = e.app.findRecordById("clients", project.getString("client"))
  const all = (col, filter, params) => e.app.findRecordsByFilter(col, filter, "", 0, 0, Object.assign({ p: pid }, params || {}))

  // Uji OPM per FAT
  const fats = all("assets", "project = {:p} && kind = 'fat'")
  const approved = all("opm_tests", "project = {:p} && status = 'approved'")
  const perFat = {}
  const portsByFat = {}
  for (const t of approved) {
    const fid = t.getString("fat")
    perFat[fid] = (perFat[fid] || 0) + 1
    if (!portsByFat[fid]) portsByFat[fid] = []
    portsByFat[fid].push({ port: t.getInt("port_fat"), dbm: t.getFloat("opm_dbm") })
  }
  let portsTotal = 0
  const fatList = fats.map((f) => {
    const ports = f.getInt("ports") || 8
    portsTotal += ports
    const pos = f.get("asbuilt_pos") && f.get("asbuilt_pos").lat ? f.get("asbuilt_pos") : f.get("design_pos")
    const tests = (portsByFat[f.id] || []).sort((a, b) => a.port - b.port)
    return { code: f.getString("code"), line: f.getString("line"), ports, ports_ok: perFat[f.id] || 0,
             lat: pos ? pos.lat : null, lon: pos ? pos.lon : null, tests }
  }).sort((a, b) => a.code < b.code ? -1 : 1)

  // Progres paket (semua jenis, cara hitung sesuai count_mode) — tanpa harga
  const packages = require(`${__hooks}/utils.js`).packageProgress(e.app, pid).packages.map((p) => ({
    type: p.type, name: p.name, unit: p.unit, volume: p.volume, approved_qty: p.approved_qty,
  }))

  // Laporan PDF tersimpan yang boleh dilihat klien (OPM & rekap Finish FAT;
  // laporan manajemen internal TIDAK ikut)
  const reports = e.app.findRecordsByFilter("reports", "project = {:p} && (kind = 'opm' || kind = 'fat_finish' || kind = 'fdt_finish' || kind = '')", "-created", 0, 0, { p: pid })
    .map((r) => ({ id: r.id, kind: r.getString("kind") || "opm", label: r.getString("label"), created: r.getString("created") }))

  return e.json(200, {
    client: client.getString("name"),
    project: {
      code: project.getString("code"), name: project.getString("name"), region: project.getString("region"),
      cluster_id: project.getString("cluster_id"), cluster_name: project.getString("cluster_name"),
      olt: project.getString("olt"), fdt_input_dbm: project.getFloat("fdt_input_dbm"),
      status: project.getString("status"), target_date: project.getString("target_date"),
    },
    opm: { ports_total: portsTotal, ports_approved: approved.length, fats: fatList },
    packages,
    reports,
    generated_at: new Date().toISOString(),
  })
})

// Unduh file laporan lewat portal (tanpa login) — hanya laporan OPM/Finish FAT
// milik proyek yang token-nya cocok.
routerAdd("GET", "/api/briix/portal/{token}/report/{rid}", (e) => {
  const token = e.request.pathValue("token")
  if (!token || token.length < 24) throw new NotFoundError()
  let project
  try { project = e.app.findFirstRecordByFilter("projects", "portal_token = {:t}", { t: token }) } catch (_) { throw new NotFoundError() }
  const r = e.app.findRecordById("reports", e.request.pathValue("rid"))
  if (r.getString("project") !== project.id) throw new NotFoundError()
  const kind = r.getString("kind") || "opm"
  if (kind !== "opm" && kind !== "fat_finish" && kind !== "fdt_finish") throw new NotFoundError()
  const fsys = e.app.newFilesystem()
  try {
    const key = r.baseFilesPath() + "/" + r.getString("file")
    return fsys.serve(e.response, e.request, key, r.getString("file"))
  } finally {
    fsys.close()
  }
})

// Link portal klien untuk admin: ambil (buat kalau belum ada) / reset token.
// portal_token bersifat hidden di API biasa, jadi lewat route ini.
routerAdd("GET", "/api/briix/projects/{id}/portal-link", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") throw new ForbiddenError("Khusus admin.")
  const p = e.app.findRecordById("projects", e.request.pathValue("id"))
  let token = p.getString("portal_token")
  if (!token) {
    token = $security.randomStringWithAlphabet(32, "abcdefghijklmnopqrstuvwxyz0123456789")
    p.set("portal_token", token)
    e.app.save(p)
  }
  return e.json(200, { token })
})
routerAdd("POST", "/api/briix/projects/{id}/portal-link/reset", (e) => {
  if (!e.auth || e.auth.getString("role") !== "admin") throw new ForbiddenError("Khusus admin.")
  const p = e.app.findRecordById("projects", e.request.pathValue("id"))
  const token = $security.randomStringWithAlphabet(32, "abcdefghijklmnopqrstuvwxyz0123456789")
  p.set("portal_token", token)
  e.app.save(p)
  return e.json(200, { token })
})
