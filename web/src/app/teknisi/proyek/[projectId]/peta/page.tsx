"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapDivRef.current) return;
      const Lx = leaflet.default;

      if (!mapRef.current) {
        mapRef.current = Lx.map(mapDivRef.current, { zoomControl: true }).setView([-7.1035, 112.046], 15);
        Lx.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 20,
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
        const pos = a.asbuilt_pos || a.design_pos;
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

      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
      // fitBounds butuh ukuran yang benar juga; invalidate + fit ulang sekali lagi.
      requestAnimationFrame(() => {
        map.invalidateSize();
        if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
      });
      setCounts(cnt);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      resizeObsRef.current?.disconnect();
    };
  }, [projectId]);

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
    </div>
  );
}
