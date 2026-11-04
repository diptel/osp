/// <reference path="../pb_data/types.d.ts" />
// BRIIX OSP — aturan server yang tidak bisa diakali dari aplikasi HP.


// ============================================================
// FOTO: tolak foto galeri, tolak foto dobel, hitung jarak ke titik
// ============================================================
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/utils.js`)
  const r = e.record
  const staff = u.isStaff(e.auth)

  // 1. Foto lapangan wajib dari kamera aplikasi (admin/QC boleh unggah arsip lama)
  if (r.getString("source") !== "camera" && !staff) {
    throw new BadRequestError("Foto harus diambil langsung dari kamera aplikasi, bukan dari galeri.")
  }

  // 2. Foto dobel: bandingkan sidik foto dengan semua foto di proyek yang sama
  const hash = r.getString("phash").toLowerCase()
  r.set("phash", hash)
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
  const pkgs = e.app.findRecordsByFilter("work_packages", "project = {:p}", "type,name", 0, 0, { p: pid })
  const out = []
  let total = 0
  for (const p of pkgs) {
    let qty = 0
    if (p.getString("type") === "opm") {
      qty = e.app.findRecordsByFilter("opm_tests", "project = {:p} && status = 'approved'", "", 0, 0, { p: pid }).length
    } else {
      for (const it of e.app.findRecordsByFilter("work_items", "package = {:k} && status = 'approved'", "", 0, 0, { k: p.id })) {
        qty += it.getFloat("qty")
      }
    }
    const amount = Math.round(qty * p.getFloat("unit_price"))
    total += amount
    out.push({
      package: p.id, type: p.getString("type"), name: p.getString("name"), line: p.getString("line"),
      unit: p.getString("unit"), volume: p.getFloat("volume"), approved_qty: qty,
      unit_price: p.getFloat("unit_price"), amount, executor_type: p.getString("executor_type"),
      includes_material: p.getBool("includes_material"),
    })
  }
  return e.json(200, { project: pid, packages: out, total_amount: total })
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

  // Progres paket (selain OPM)
  const packages = all("work_packages", "project = {:p} && type != 'opm'").map((p) => {
    let qty = 0
    for (const it of e.app.findRecordsByFilter("work_items", "package = {:k} && status = 'approved'", "", 0, 0, { k: p.id })) {
      qty += it.getFloat("qty")
    }
    return { type: p.getString("type"), name: p.getString("name"), unit: p.getString("unit"),
             volume: p.getFloat("volume"), approved_qty: qty }
  })

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
    generated_at: new Date().toISOString(),
  })
})
