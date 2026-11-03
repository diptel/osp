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

module.exports = { distanceM, hamming, assetPos, geo, isStaff, DUP_BITS: 5 }
