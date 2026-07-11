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

export default function DynamicMap({ lat, lng, zoom = 16, trackPath, routeStart, routeEnd }: DynamicMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

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

  // Draw GPS track path while active
  useEffect(() => {
    if (!mapRef.current || !trackPath || trackPath.length < 2) return;
    const polyline = L.polyline(trackPath, { color: '#005bac', weight: 5, opacity: 0.8 }).addTo(mapRef.current);
    // Fit map to show full track path
    mapRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 16 });
    return () => { polyline.remove(); };
  }, [trackPath]);

  // Draw route following actual railway geometry
  useEffect(() => {
    if (!routeLayerRef.current || !mapRef.current) return;
    routeLayerRef.current.clearLayers();
    if (!routeStart || !routeEnd) return;

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
    L.marker([routeStart.lat, routeStart.lng], { icon: makePin('#16a34a', 'A', routeStart.name) })
      .bindTooltip(`<b>Titik Awal</b>${routeStart.name ? `<br>${routeStart.name}` : ''}`)
      .addTo(layer);
    L.marker([routeEnd.lat, routeEnd.lng], { icon: makePin('#dc2626', 'B', routeEnd.name) })
      .bindTooltip(`<b>Titik Akhir</b>${routeEnd.name ? `<br>${routeEnd.name}` : ''}`)
      .addTo(layer);

    // Fit map to route immediately
    const bounds = L.latLngBounds([routeStart.lat, routeStart.lng], [routeEnd.lat, routeEnd.lng]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });

    // Fetch real railway geometry async
    setLoadingRoute(true);
    fetchRailwayGeometry(routeStart.lat, routeStart.lng, routeEnd.lat, routeEnd.lng)
      .then(segments => {
        // Remove any existing straight line and draw real track
        if (segments.length > 0) {
          segments.forEach(seg => {
            L.polyline(seg, { color: '#005bac', weight: 4, opacity: 0.75 }).addTo(layer);
          });
        } else {
          // Fallback: straight dashed line if no OSM data
          L.polyline(
            [[routeStart.lat, routeStart.lng], [routeEnd.lat, routeEnd.lng]],
            { color: '#005bac', weight: 4, dashArray: '12,8', opacity: 0.55 }
          ).addTo(layer);
        }
      })
      .finally(() => setLoadingRoute(false));
  }, [routeStart, routeEnd]);

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
