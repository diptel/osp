"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { bestPos } from "@/lib/dhash";
import type { RecordModel } from "pocketbase";
import type * as LeafletNS from "leaflet";

type Asset = RecordModel & {
  kind: string;
  code: string;
  line?: string;
  subtype?: string;
  design_pos?: { lon: number; lat: number };
  asbuilt_pos?: { lon: number; lat: number };
};
type Route = RecordModel & {
  kind: string;
  code: string;
  line?: string;
  path?: [number, number][];
};

const KIND_COLOR: Record<string, string> = {
  fdt: "#5B2A9D",
  fat: "#16181D",
  pole: "#8A9099",
  slack: "#1F7A4D",
  homepass: "#2B5FB8",
};
const KIND_RADIUS: Record<string, number> = {
  fdt: 10,
  fat: 7,
  pole: 4,
  slack: 5,
  homepass: 3,
};
const KIND_LABEL: Record<string, string> = {
  fdt: "FDT",
  fat: "FAT",
  pole: "Tiang",
  slack: "Slack",
  homepass: "Homepass",
};
const ROUTE_COLOR: Record<string, string> = {
  feeder: "#2B5FB8",
  distribution: "#2B5FB8",
  sling: "#C2410C",
  drop: "#1F7A4D",
};

export default function PetaLapanganPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({
    fdt: true,
    fat: true,
    pole: true,
    slack: true,
    homepass: false,
  });
  const layersRef = useRef<Record<string, LeafletNS.LayerGroup>>({});
  const resizeObsRef = useRef<ResizeObserver | null>(null);

  // ---- lokasi GPS saya (live) ----
  const LxRef = useRef<typeof LeafletNS | null>(null);
  const meMarkerRef = useRef<LeafletNS.Marker | null>(null);
  const meAccuracyRef = useRef<LeafletNS.Circle | null>(null);
  const meHeadingRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [following, setFollowing] = useState(false);
  const followingRef = useRef(false);
  const [meError, setMeError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapDivRef.current) return;
      const Lx = leaflet.default;
      LxRef.current = Lx;

      if (!mapRef.current) {
        // maxZoom 19: server tile OpenStreetMap tidak punya level 20 — kalau
        // fitBounds nekat zoom ke 20 (titik-titik berdekatan), semua tile 404.
        mapRef.current = Lx.map(mapDivRef.current, { zoomControl: true, maxZoom: 19 }).setView(
          [-7.1035, 112.046],
          15
        );
        // Catatan: jangan pakai template {s}. (subdomain a/b/c) — OSM sudah
        // tidak melayani itu untuk tile.openstreetmap.org, hasilnya 400.
        Lx.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(mapRef.current);
        for (const kind of Object.keys(KIND_COLOR)) {
          layersRef.current[kind] = Lx.layerGroup();
          if (visible[kind]) layersRef.current[kind].addTo(mapRef.current);
        }
        layersRef.current["route"] = Lx.layerGroup().addTo(mapRef.current);

        // Kontainer baru dipasang lewat ref saat transisi route SPA; ukurannya
        // kadang belum "settle" ketika Leaflet pertama kali mengukur, jadi
        // tile request tidak pernah terkirim. Paksa Leaflet mengukur ulang.
        const map0 = mapRef.current;
        requestAnimationFrame(() => map0.invalidateSize());
        setTimeout(() => map0.invalidateSize(), 150);
        setTimeout(() => map0.invalidateSize(), 500);
        const ro = new ResizeObserver(() => map0.invalidateSize());
        ro.observe(mapDivRef.current);
        resizeObsRef.current = ro;
      }
      const map = mapRef.current;

      const [assets, routes] = await Promise.all([
        pb().collection("assets").getFullList<Asset>({ filter: `project = "${projectId}"` }),
        pb().collection("routes").getFullList<Route>({ filter: `project = "${projectId}"` }),
      ]);
      if (cancelled) return;

      const bounds: [number, number][] = [];
      const cnt: Record<string, number> = {};

      for (const kind of Object.keys(layersRef.current)) layersRef.current[kind].clearLayers();

      for (const a of assets) {
        const pos = bestPos(a.asbuilt_pos, a.design_pos);
        if (!pos) continue;
        cnt[a.kind] = (cnt[a.kind] || 0) + 1;
        const latlng: [number, number] = [pos.lat, pos.lon];
        bounds.push(latlng);
        const color = KIND_COLOR[a.kind] || "#8A9099";
        const marker = Lx.circleMarker(latlng, {
          radius: KIND_RADIUS[a.kind] || 4,
          color: "#fff",
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9,
        });
        marker.bindPopup(
          `<div style="font-family:ui-sans-serif,sans-serif"><b>${a.code}</b><br/>${KIND_LABEL[a.kind] || a.kind}${
            a.line ? " · Line " + a.line : ""
          }${a.subtype ? " · " + a.subtype : ""}</div>`
        );
        const group = layersRef.current[a.kind];
        if (group) marker.addTo(group);
      }

      for (const r of routes) {
        if (!r.path || r.path.length < 2) continue;
        const latlngs = r.path.map(([lon, lat]) => [lat, lon] as [number, number]);
        const line = Lx.polyline(latlngs, {
          color: ROUTE_COLOR[r.kind] || "#2B5FB8",
          weight: r.kind === "sling" ? 2 : 3,
          dashArray: r.kind === "sling" ? "4 4" : undefined,
        });
        line.bindPopup(`<div style="font-family:ui-sans-serif,sans-serif"><b>${r.code}</b></div>`);
        line.addTo(layersRef.current["route"]);
      }

      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
      // fitBounds butuh ukuran yang benar juga; invalidate + fit ulang sekali lagi.
      requestAnimationFrame(() => {
        map.invalidateSize();
        if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
      });
      setCounts(cnt);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      resizeObsRef.current?.disconnect();
    };
  }, [projectId]);

  // Ikon posisi saya: titik biru + panah arah hadap (heading), mirip Google Maps.
  function meIcon(Lx: typeof LeafletNS, heading: number | null) {
    const arrow =
      heading != null
        ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;transform:translate(-50%,-50%) rotate(${heading}deg) translateY(-16px);border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:14px solid #2B5FB8;opacity:0.9" class="me-arrow"></div>`
        : "";
    return Lx.divIcon({
      className: "",
      html: `<div style="position:relative;width:18px;height:18px">${arrow}<div style="position:absolute;left:50%;top:50%;width:14px;height:14px;transform:translate(-50%,-50%);background:#2B5FB8;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></div></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function onPosition(pos: GeolocationPosition) {
    const Lx = LxRef.current;
    const map = mapRef.current;
    if (!Lx || !map) return;
    const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
    const heading = typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : meHeadingRef.current;

    if (!meMarkerRef.current) {
      meMarkerRef.current = Lx.marker(latlng, { icon: meIcon(Lx, heading), zIndexOffset: 1000, interactive: false }).addTo(map);
    } else {
      meMarkerRef.current.setLatLng(latlng);
      meMarkerRef.current.setIcon(meIcon(Lx, heading));
    }
    if (!meAccuracyRef.current) {
      meAccuracyRef.current = Lx.circle(latlng, {
        radius: pos.coords.accuracy || 0,
        color: "#2B5FB8",
        weight: 1,
        fillColor: "#2B5FB8",
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      meAccuracyRef.current.setLatLng(latlng);
      meAccuracyRef.current.setRadius(pos.coords.accuracy || 0);
    }
    setMeError("");
    if (followingRef.current) {
      map.setView(latlng, Math.max(map.getZoom(), 17), { animate: true });
    }
  }

  function onHeading(deg: number) {
    meHeadingRef.current = deg;
    const Lx = LxRef.current;
    if (Lx && meMarkerRef.current) meMarkerRef.current.setIcon(meIcon(Lx, deg));
  }

  function onOrientation(e: DeviceOrientationEvent) {
    // webkitCompassHeading (iOS, sudah 0=utara langsung) kalau ada; selain itu
    // alpha perlu dibalik (360-alpha) supaya 0=utara, searah jarum jam.
    const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    if (typeof webkit === "number") onHeading(webkit);
    else if (e.absolute && e.alpha != null) onHeading((360 - e.alpha) % 360);
  }

  async function toggleFollow() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
      setFollowing(false);
      followingRef.current = false;
      return;
    }
    if (!("geolocation" in navigator)) {
      setMeError("Perangkat tidak mendukung GPS.");
      return;
    }
    setFollowing(true);
    followingRef.current = true;
    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, (err) => setMeError(err.message || "Gagal membaca lokasi GPS."), {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000,
    });
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE?.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") window.addEventListener("deviceorientation", onOrientation as EventListener);
      } catch {
        /* diam-diam gagal — tetap jalan tanpa arah panah */
      }
    } else {
      window.addEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.addEventListener("deviceorientation", onOrientation as EventListener);
    }
  }

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      window.removeEventListener("deviceorientationabsolute", onOrientation as EventListener);
      window.removeEventListener("deviceorientation", onOrientation as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(kind: string) {
    setVisible((v) => {
      const next = { ...v, [kind]: !v[kind] };
      const map = mapRef.current;
      const group = layersRef.current[kind];
      if (map && group) {
        if (next[kind]) group.addTo(map);
        else map.removeLayer(group);
      }
      return next;
    });
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={mapDivRef} className="absolute inset-0" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/70 text-sm text-muted z-[1000]">
          Memuat peta...
        </div>
      )}
      <div className="absolute top-3 left-3 right-3 bg-card/95 backdrop-blur border border-border rounded-xl p-2 flex gap-1.5 overflow-x-auto z-[1000]">
        {Object.keys(KIND_COLOR).map((kind) => (
          <button
            key={kind}
            onClick={() => toggle(kind)}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border ${
              visible[kind] ? "border-ink bg-ink text-white" : "border-border text-subtle bg-card"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: visible[kind] ? "#fff" : KIND_COLOR[kind] }}
            />
            {KIND_LABEL[kind]} {counts[kind] ? `· ${counts[kind]}` : ""}
          </button>
        ))}
      </div>

      <button
        onClick={toggleFollow}
        aria-label="Ikuti lokasi saya"
        className={`absolute bottom-4 right-3 z-[1000] w-12 h-12 rounded-full border shadow-lg flex items-center justify-center text-xl ${
          following ? "bg-accent border-accent text-white" : "bg-card border-border text-ink"
        }`}
      >
        {following ? "◎" : "📍"}
      </button>
      {meError && (
        <div className="absolute bottom-20 left-3 right-16 z-[1000] bg-warnbg text-warn text-xs rounded-lg px-3 py-2">
          {meError}
        </div>
      )}
    </div>
  );
}
