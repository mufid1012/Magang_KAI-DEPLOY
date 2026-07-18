'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRailwayGeometry } from '../../lib/railway';

interface DynamicMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  trackPath?: [number, number][];
  routeStart?: { lat: number; lng: number; name?: string };
  routeEnd?: { lat: number; lng: number; name?: string };
}

type RailPoint = [number, number];

interface RailProjection {
  point: RailPoint;
  segmentIndex: number;
  progress: number;
  distanceSquared: number;
}

function projectPointToRail(point: RailPoint, rail: RailPoint[]): RailProjection | null {
  if (rail.length < 2) return null;

  const lngScale = Math.cos(point[0] * Math.PI / 180);
  let best: RailProjection | null = null;

  for (let i = 0; i < rail.length - 1; i++) {
    const a = rail[i];
    const b = rail[i + 1];
    const ax = a[1] * lngScale;
    const ay = a[0];
    const bx = b[1] * lngScale;
    const by = b[0];
    const px = point[1] * lngScale;
    const py = point[0];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
    const projected: RailPoint = [
      a[0] + (b[0] - a[0]) * progress,
      a[1] + (b[1] - a[1]) * progress,
    ];
    const projectedX = projected[1] * lngScale;
    const distanceSquared = (px - projectedX) ** 2 + (py - projected[0]) ** 2;

    if (!best || distanceSquared < best.distanceSquared) {
      best = { point: projected, segmentIndex: i, progress, distanceSquared };
    }
  }

  return best;
}

function buildRailAlignedTrack(gpsTrack: RailPoint[], railwaySegments: RailPoint[][]): RailPoint[] {
  if (gpsTrack.length < 2) return [];

  const firstGpsPoint = gpsTrack[0];
  const lastGpsPoint = gpsTrack[gpsTrack.length - 1];
  let selected: { rail: RailPoint[]; start: RailProjection; end: RailProjection; score: number } | null = null;

  for (const rail of railwaySegments) {
    const start = projectPointToRail(firstGpsPoint, rail);
    const end = projectPointToRail(lastGpsPoint, rail);
    if (!start || !end) continue;
    const score = start.distanceSquared + end.distanceSquared;
    if (!selected || score < selected.score) selected = { rail, start, end, score };
  }

  if (!selected) return [];

  const { rail, start, end } = selected;
  const startOrder = start.segmentIndex + start.progress;
  const endOrder = end.segmentIndex + end.progress;
  const aligned: RailPoint[] = [start.point];

  if (startOrder <= endOrder) {
    for (let i = start.segmentIndex + 1; i <= end.segmentIndex; i++) aligned.push(rail[i]);
  } else {
    for (let i = start.segmentIndex; i > end.segmentIndex; i--) aligned.push(rail[i]);
  }
  aligned.push(end.point);

  return aligned.filter((point, index) => (
    index === 0 || point[0] !== aligned[index - 1][0] || point[1] !== aligned[index - 1][1]
  ));
}

export default function DynamicMap({ lat, lng, zoom = 16, trackPath, routeStart, routeEnd }: DynamicMapProps) {
  const routeOpacity = trackPath && trackPath.length > 0 ? 0.25 : 0.75;
  const routeStartLat = routeStart?.lat;
  const routeStartLng = routeStart?.lng;
  const routeStartName = routeStart?.name;
  const routeEndLat = routeEnd?.lat;
  const routeEndLng = routeEnd?.lng;
  const routeEndName = routeEnd?.name;
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [railwaySegments, setRailwaySegments] = useState<RailPoint[][]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([lat, lng], zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);

    const pulseIcon = L.divIcon({
      className: '',
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;width:40px;height:40px;background:rgba(0,91,172,0.25);border-radius:50%;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="width:16px;height:16px;background:#005bac;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);z-index:10;"></div>
      </div>
      <style>@keyframes ping{75%,100%{transform:scale(2);opacity:0}}</style>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    markerRef.current = L.marker([lat, lng], { icon: pulseIcon }).addTo(mapRef.current);
    routeLayerRef.current = L.layerGroup().addTo(mapRef.current);
    trackLayerRef.current = L.layerGroup().addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update user position
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom());
  }, [lat, lng]);

  // Draw the travelled path using actual railway geometry. Raw GPS points are
  // intentionally not connected directly because sparse/noisy samples create
  // straight chords that cut across bends in the railway.
  useEffect(() => {
    if (!mapRef.current || !trackLayerRef.current) return;

    const layer = trackLayerRef.current;
    layer.clearLayers();
    if (!trackPath || trackPath.length < 2) return;

    const alignedTrack = buildRailAlignedTrack(trackPath, railwaySegments);
    if (alignedTrack.length < 2) return;

    const polyline = L.polyline(alignedTrack, {
      color: '#f59e0b',
      weight: 6,
      opacity: 0.95,
    }).addTo(layer);
    mapRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 16 });

    return () => { layer.clearLayers(); };
  }, [trackPath, railwaySegments]);

  // Draw route following actual railway geometry
  useEffect(() => {
    if (!routeLayerRef.current || !mapRef.current) return;
    routeLayerRef.current.clearLayers();
    setRailwaySegments([]);
    if (routeStartLat == null || routeStartLng == null || routeEndLat == null || routeEndLng == null) return;

    const layer = routeLayerRef.current;
    const map = mapRef.current;

    const makePin = (color: string, letter: string, name?: string) => L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="background:${color};color:white;border:2.5px solid white;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${letter}</div>
        <div style="width:3px;height:8px;background:${color};opacity:0.8;border-radius:0 0 2px 2px;"></div>
        ${name ? `<div style="background:${color};color:white;font-size:9px;font-weight:600;padding:1px 5px;border-radius:4px;white-space:nowrap;max-width:90px;overflow:hidden;text-overflow:ellipsis;margin-top:1px;">${name}</div>` : ''}
      </div>`,
      iconSize: [26, name ? 48 : 36],
      iconAnchor: [13, name ? 48 : 36],
    });

    // Add start/end markers immediately
    L.marker([routeStartLat, routeStartLng], { icon: makePin('#16a34a', 'A', routeStartName) })
      .bindTooltip(`<b>Titik Awal</b>${routeStartName ? `<br>${routeStartName}` : ''}`)
      .addTo(layer);
    L.marker([routeEndLat, routeEndLng], { icon: makePin('#dc2626', 'B', routeEndName) })
      .bindTooltip(`<b>Titik Akhir</b>${routeEndName ? `<br>${routeEndName}` : ''}`)
      .addTo(layer);

    // Fit map to route immediately
    const bounds = L.latLngBounds([routeStartLat, routeStartLng], [routeEndLat, routeEndLng]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });

    // Fetch real railway geometry async
    setLoadingRoute(true);
    let cancelled = false;
    fetchRailwayGeometry(routeStartLat, routeStartLng, routeEndLat, routeEndLng)
      .then(segments => {
        if (cancelled) return;
        setRailwaySegments(segments);
        // Remove any existing straight line and draw real track
        if (segments.length > 0) {
          segments.forEach(seg => {
            L.polyline(seg, { color: '#005bac', weight: 4, opacity: routeOpacity }).addTo(layer);
          });
        }
      })
      .finally(() => { if (!cancelled) setLoadingRoute(false); });

    return () => { cancelled = true; };
  }, [routeStartLat, routeStartLng, routeStartName, routeEndLat, routeEndLng, routeEndName, routeOpacity]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {loadingRoute && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-surface/90 backdrop-blur-sm rounded-full px-md py-xs shadow-md flex items-center gap-sm font-label-sm text-on-surface z-[500] pointer-events-none">
          <span className="material-symbols-outlined text-primary text-[14px] animate-spin">refresh</span>
          Memuat jalur rel...
        </div>
      )}
    </div>
  );
}
