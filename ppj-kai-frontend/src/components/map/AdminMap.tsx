'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRailwayGeometry } from '../../lib/railway';

interface EmergencyPoint {
  id: number;
  latitude: number;
  longitude: number;
  jenisTemuan: string;
  deskripsi: string;
  foto: string | null;
  createdAt: string;
  petugasNama?: string;
  jalur?: string;
}

interface TaskPoint {
  id: number;
  jalur: string;
  startPointLat: number;
  startPointLong: number;
  endPointLat: number;
  endPointLong: number;
  startPointName: string;
  endPointName: string;
  status: string;
  petugasNama?: string;
  petugasNipp?: string;
}

interface AdminMapProps {
  emergencies: EmergencyPoint[];
  tasks: TaskPoint[];
  onEmergencyClick?: (e: EmergencyPoint) => void;
}

// Keep for sidebar status badges
const STATUS_COLOR: Record<string, string> = {
  pending: '#94a3b8',
  in_progress: '#005bac',
  completed: '#22c55e',
};

/**
 * Deterministic HSL color from a string (e.g. petugas NIPP).
 * Same NIPP → same hue always. Different NIPPs → visually distinct hues.
 */
function petugasColor(nipp: string): string {
  let hash = 0;
  for (let i = 0; i < nipp.length; i++) {
    hash = nipp.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  // Use golden angle (137.5°) distribution for maximum perceptual spread
  const hue = ((Math.abs(hash) * 137) % 360);
  return `hsl(${hue}, 65%, 42%)`;
}

function makePin(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:28px;height:28px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:white">${label}</div>
      <div style="width:3px;height:10px;background:${color};opacity:0.7;border-radius:0 0 2px 2px;"></div>
    </div>`,
    iconSize: [28, 38],
    iconAnchor: [14, 38],
  });
}

// fetchRailwayGeometry is imported from lib/railway.ts
// which has automatic failover to multiple Overpass API mirrors

export default function AdminMap({ emergencies, tasks, onEmergencyClick }: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: false }).setView([-7.6, 110.4], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current);
    layerGroupRef.current = L.layerGroup().addTo(mapRef.current);
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Geometry cache — persists across re-renders, keyed by task coordinates
  const geometryCacheRef = useRef<Map<string, [number, number][][]>>(new Map());

  // Draw task routes + emergency markers
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();

    // Draw markers immediately, then load real railway geometry per task async
    tasks.forEach(task => {
      // Use petugas color as primary identifier; status shown via line style
      const color = task.petugasNipp ? petugasColor(task.petugasNipp) : (STATUS_COLOR[task.status] ?? '#94a3b8');
      const opacity = task.status === 'completed' ? 0.45 : 0.85;
      const dash = task.status === 'pending' ? '10,6' : undefined;
      const layer = layerGroupRef.current!;

      // A/B markers with petugas color
      L.marker([task.startPointLat, task.startPointLong], { icon: makePin(color, 'A') })
        .bindTooltip(
          `<b>${task.startPointName || 'Awal'}</b><br>
           <span style="font-size:11px;color:${color};font-weight:600">${task.petugasNama || ''}</span>`
        )
        .addTo(layer);

      L.marker([task.endPointLat, task.endPointLong], { icon: makePin(color, 'B') })
        .bindTooltip(`<b>${task.endPointName || 'Akhir'}</b>`)
        .addTo(layer);

      // Cache key based on start/end coordinates
      const cacheKey = `${task.startPointLat},${task.startPointLong}-${task.endPointLat},${task.endPointLong}`;
      const cached = geometryCacheRef.current.get(cacheKey);

      const drawRoute = (segments: [number, number][][]) => {
        if (!layerGroupRef.current || segments.length === 0) return;
        segments.forEach(seg => {
          L.polyline(seg, { color, weight: 5, opacity, dashArray: dash }).addTo(layerGroupRef.current!);
        });
      };

      if (cached) {
        // Use cached geometry — no API call
        drawRoute(cached);
      } else {
        // Fetch and cache (only cache non-empty results)
        fetchRailwayGeometry(
          task.startPointLat, task.startPointLong,
          task.endPointLat, task.endPointLong
        ).then(segments => {
          if (segments.length > 0) {
            geometryCacheRef.current.set(cacheKey, segments);
          }
          drawRoute(segments);
        });
      }
    });

    emergencies.forEach(em => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:36px;height:36px;background:rgba(220,38,38,0.2);border-radius:50%;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>
          <div style="width:22px;height:22px;background:#dc2626;border:2.5px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:10;font-size:12px;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.3)">⚠</div>
        </div><style>@keyframes ping{75%,100%{transform:scale(2);opacity:0}}</style>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      L.marker([em.latitude, em.longitude], { icon })
        .on('click', () => onEmergencyClick?.(em))
        .bindTooltip(`<b>⚠ ${em.jenisTemuan}</b><br><span style="font-size:11px">${em.petugasNama || ''}</span>`)
        .addTo(layerGroupRef.current!);
    });
  }, [emergencies, tasks]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
