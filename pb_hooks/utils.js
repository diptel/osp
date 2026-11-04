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

module.exports = { distanceM, hamming, assetPos, geo, isStaff, packageProgress, DUP_BITS: 5 }
