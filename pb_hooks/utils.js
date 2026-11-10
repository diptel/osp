// Helper bersama untuk hooks BRIIX OSP. Dipanggil lewat require(`${__hooks}/utils.js`).

// Jarak dua titik (meter), haversine.
function distanceM(a, b) {
  if (!a || !b || (!a.lat && !a.lon) || (!b.lat && !b.lon)) return null
  const R = 6371000, rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

// Jumlah bit beda antara dua hash hex 64-bit.
function hamming(h1, h2) {
  let d = 0
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(h1.substr(i, 4), 16) ^ parseInt(h2.substr(i, 4), 16)
    while (x) { d += x & 1; x >>= 1 }
  }
  return d
}

// Ambil posisi efektif titik: as-built kalau ada, kalau tidak posisi desain.
function assetPos(asset) {
  const ab = asset.get("asbuilt_pos")
  if (ab && (ab.lat || ab.lon)) return ab
  return asset.get("design_pos")
}

function geo(record, field) {
  const g = record.get(field)
  return g && (g.lat || g.lon) ? { lat: g.lat, lon: g.lon } : null
}

function isStaff(auth) {
  return !!auth && (auth.getString("role") === "admin" || auth.getString("role") === "qc")
}

// Hitung progres disetujui QC per paket pekerjaan satu proyek (dipakai
// endpoint opname admin DAN endpoint progres untuk anggota proyek).
function packageProgress(app, pid) {
  const pkgs = app.findRecordsByFilter("work_packages", "project = {:p}", "type,name", 0, 0, { p: pid })
  const approvedByFat = {}
  for (const t of app.findRecordsByFilter("opm_tests", "project = {:p} && status = 'approved'", "", 0, 0, { p: pid })) {
    const f = t.getString("fat")
    approvedByFat[f] = (approvedByFat[f] || 0) + 1
  }
  const portsApproved = Object.values(approvedByFat).reduce((a, b) => a + b, 0)
  let fatsDone = 0
  let coresDone = 0
  for (const fat of app.findRecordsByFilter("assets", "project = {:p} && kind = 'fat'", "", 0, 0, { p: pid })) {
    const need = fat.getInt("ports") || 8
    if ((approvedByFat[fat.id] || 0) >= need) {
      fatsDone += 1
      coresDone += fat.getInt("cores") || Math.ceil(need / 8)
    }
  }
  const out = []
  let total = 0
  for (const p of pkgs) {
    let mode = p.getString("count_mode")
    if (!mode) mode = p.getString("type") === "opm" ? "ports_approved" : "work_items"
    let qty = 0
    if (mode === "ports_approved") qty = portsApproved
    else if (mode === "fats_approved") qty = fatsDone
    else if (mode === "fat_cores_approved") qty = coresDone
    else if (mode === "manual") qty = p.getFloat("manual_qty")
    else {
      for (const it of app.findRecordsByFilter("work_items", "package = {:k} && status = 'approved'", "", 0, 0, { k: p.id })) {
        qty += it.getFloat("qty")
      }
    }
    const amount = Math.round(qty * p.getFloat("unit_price"))
    total += amount
    out.push({
      package: p.id, type: p.getString("type"), name: p.getString("name"), line: p.getString("line"),
      unit: p.getString("unit"), volume: p.getFloat("volume"), approved_qty: qty, count_mode: mode,
      unit_price: p.getFloat("unit_price"), amount, executor_type: p.getString("executor_type"),
      includes_material: p.getBool("includes_material"),
    })
  }
  return { packages: out, total_amount: total, fats_done: fatsDone, cores_done: coresDone, ports_approved: portsApproved }
}

// Checklist kelengkapan Finish RFS (dipakai endpoint rfs-status & rfs-complete)
function rfsChecklist(app, pid) {
  const project = app.findRecordById("projects", pid)
  const fats = app.findRecordsByFilter("assets", "project = {:p} && kind = 'fat'", "line,code", 0, 0, { p: pid })
  const approvedByFat = {}
  for (const t of app.findRecordsByFilter("opm_tests", "project = {:p} && status = 'approved'", "", 0, 0, { p: pid })) {
    approvedByFat[t.getString("fat")] = (approvedByFat[t.getString("fat")] || 0) + 1
  }
  const finishByFat = {}
  for (const ph of app.findRecordsByFilter("photos", "project = {:p} && purpose = 'fat_finish'", "", 0, 0, { p: pid })) {
    finishByFat[ph.getString("asset")] = (finishByFat[ph.getString("asset")] || 0) + 1
  }
  const fatRows = fats.map((f) => {
    const need = f.getInt("ports") || 8
    return { id: f.id, code: f.getString("code"), ports: need, approved: approvedByFat[f.id] || 0,
             finish_photos: finishByFat[f.id] || 0 }
  })
  const fatsVerified = fatRows.filter((r) => r.approved >= r.ports).length
  const fatsWithPhoto = fatRows.filter((r) => r.finish_photos > 0).length

  const feederNeed = project.getInt("feeder_cores") || 0
  // hanya foto VALID yang dihitung: ada GPS, jarak dalam toleransi (far = false)
  const okPhoto = (ph) => !ph.getBool("far") && ph.get("distance_m") !== null && ph.get("distance_m") !== undefined
  const feeder = app.findRecordsByFilter("photos", "project = {:p} && purpose = 'fdt_feeder'", "seq", 0, 0, { p: pid })
    .filter(okPhoto)
    .map((ph) => ({ id: ph.id, seq: ph.getInt("seq"), file: ph.getString("file") }))
  // foto akhir FDT luar SEKALIGUS menampilkan layar OPM 1 port (nilai dBm di value_dbm)
  const fdtFinishAll = app.findRecordsByFilter("photos", "project = {:p} && purpose = 'fdt_finish'", "-created", 0, 0, { p: pid })
  const fdtFinishList = fdtFinishAll.filter(okPhoto)
  const fdtFinish = fdtFinishList.length
  const fdtFinishFar = fdtFinishAll.length - fdtFinish
  // nilai redaman: dari foto akhir FDT (baru) atau foto fdt_opm terpisah (lama)
  const limitOn = project.getBool("opm_limit_enabled")
  const minDbm = project.getFloat("opm_min_dbm")
  const hasDbm = (ph) => ph.get("value_dbm") !== null && ph.get("value_dbm") !== undefined && ph.getFloat("value_dbm") !== 0
  const fdtOpmAll = fdtFinishList.filter(hasDbm)
    .concat(app.findRecordsByFilter("photos", "project = {:p} && purpose = 'fdt_opm'", "-created", 0, 0, { p: pid }).filter(hasDbm))
  const fdtOpm = fdtOpmAll.filter((ph) => !limitOn || ph.getFloat("value_dbm") >= minDbm)
  const fdtOpmBelow = fdtOpmAll.length - fdtOpm.length
  const seqs = {}
  for (const f of feeder) seqs[f.seq] = true
  let feederDone = 0
  for (let i = 1; i <= feederNeed; i++) if (seqs[i]) feederDone++

  const items = [
    { key: "fat_verified", label: "Semua port FAT terverifikasi QC", done: fats.length > 0 && fatsVerified === fats.length, detail: `${fatsVerified}/${fats.length} FAT` },
    { key: "fat_finish", label: "Foto Finish tiap FAT", done: fats.length > 0 && fatsWithPhoto === fats.length, detail: `${fatsWithPhoto}/${fats.length} FAT` },
    { key: "fdt_feeder", label: "Foto core feeder masuk FDT (valid)", done: feederNeed > 0 && feederDone >= feederNeed, detail: feederNeed ? `${feederDone}/${feederNeed} core` : "jumlah core feeder belum diisi admin" },
    { key: "fdt_finish", label: "Foto akhir FDT (luar) + layar OPM 1 port", done: fdtFinish > 0 && fdtOpm.length > 0,
      detail: fdtFinish ? (fdtOpm.length ? `${fdtOpm[0].getFloat("value_dbm")} dBm` : (fdtOpmBelow ? `${fdtOpmAll[0].getFloat("value_dbm")} dBm di bawah batas ${minDbm} dBm` : "foto ada, nilai dBm belum diisi"))
                        : (fdtFinishFar ? "foto ada tapi tidak valid (jauh dari titik FDT) — foto ulang di lokasi" : "belum ada") },
  ]
  return { status: project.getString("status"), feeder_cores: feederNeed, opm_limit_enabled: limitOn, opm_min_dbm: minDbm,
           fats: fatRows, items, complete: items.every((i) => i.done) }
}

module.exports = { distanceM, hamming, assetPos, geo, isStaff, packageProgress, rfsChecklist, DUP_BITS: 5 }
