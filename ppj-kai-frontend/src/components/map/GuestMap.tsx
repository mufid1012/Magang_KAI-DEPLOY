'use client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect,useRef,useState } from 'react';
import { fetchRailwayGeometry } from '../../lib/railway';
import { GUEST_STATIONS } from '../../lib/stations';

// ─── DAOP 6 Yogyakarta main-line stations (west → east) ─────────────────────
const DAOP6_STATIONS = GUEST_STATIONS;

// Bounding box (SW ↔ NE) with 0.04° padding
const PAD = 0.04;
const allLats = DAOP6_STATIONS.map(s => s.lat);
const allLngs = DAOP6_STATIONS.map(s => s.lng);
const BOUNDS: L.LatLngBoundsExpression = [
  [Math.min(...allLats) - PAD, Math.min(...allLngs) - PAD],
  [Math.max(...allLats) + PAD, Math.max(...allLngs) + PAD],
];

const ROUTE_COLOR = '#005bac';

export default function GuestMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // ── Initialise Leaflet map ─────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const bounds = L.latLngBounds(BOUNDS as [L.LatLngTuple, L.LatLngTuple]);

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).fitBounds(bounds, { padding: [30, 30] });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Lock viewport
    map.setMaxBounds(bounds);
    map.setMinZoom(Math.max(0, map.getZoom() - 1));

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ── Draw station markers + railway geometry ────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const layerGroup = L.layerGroup().addTo(map);

    // Station markers
    DAOP6_STATIONS.forEach((station, idx) => {
      const isTerminal = idx === 0 || idx === DAOP6_STATIONS.length - 1;

      L.circleMarker([station.lat, station.lng], {
        radius: isTerminal ? 7 : 5,
        fillColor: isTerminal ? ROUTE_COLOR : '#ffffff',
        color: ROUTE_COLOR,
        weight: isTerminal ? 3 : 2,
        fillOpacity: 1,
      })
        .bindTooltip(
          `<div style="text-align:center">
            <b style="font-size:12px">${station.name}</b>
            ${isTerminal ? '<br><span style="font-size:9px;color:#64748b">Terminal</span>' : ''}
          </div>`,
          { direction: 'top', offset: [0, -8] }
        )
        .addTo(layerGroup);
    });

    // Railway geometry between consecutive stations
    for (let i = 0; i < DAOP6_STATIONS.length - 1; i++) {
      const from = DAOP6_STATIONS[i];
      const to = DAOP6_STATIONS[i + 1];

      fetchRailwayGeometry(from.lat, from.lng, to.lat, to.lng).then(segments => {
        if (segments.length > 0) {
          segments.forEach(seg => {
            L.polyline(seg, {
              color: ROUTE_COLOR,
              weight: 4,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(layerGroup);
          });
        } else {
          // Fallback: dashed straight line when Overpass data unavailable
          L.polyline(
            [[from.lat, from.lng], [to.lat, to.lng]],
            { color: ROUTE_COLOR, weight: 3, opacity: 0.5, dashArray: '8,6' }
          ).addTo(layerGroup);
        }
      });
    }

    return () => { layerGroup.remove(); };
  }, [mapReady]);

  return <div ref={containerRef} className="w-full h-full" />;
}
