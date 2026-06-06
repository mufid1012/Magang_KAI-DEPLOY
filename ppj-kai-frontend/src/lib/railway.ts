function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type NodeId = string;

interface Graph {
  coords: Map<NodeId, [number, number]>;
  edges: Map<NodeId, { id: NodeId; dist: number }[]>;
}

// ─── Overpass Cache ──────────────────────────────────────────────────
// Module-level cache keyed by rounded bbox string → avoids re-fetching
const overpassCache = new Map<string, { elements: any[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedOverpass(cacheKey: string): any[] | null {
  const entry = overpassCache.get(cacheKey);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.elements;
  if (entry) overpassCache.delete(cacheKey);
  return null;
}

function setCachedOverpass(cacheKey: string, elements: any[]) {
  overpassCache.set(cacheKey, { elements, ts: Date.now() });
  // Evict old entries if cache grows too large
  if (overpassCache.size > 30) {
    const oldest = Array.from(overpassCache.entries()).sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 10; i++) overpassCache.delete(oldest[i][0]);
  }
}

// Round bbox to 3 decimal places (~111m) for cache key deduplication
function bboxCacheKey(minLat: number, minLng: number, maxLat: number, maxLng: number): string {
  return `${minLat.toFixed(3)},${minLng.toFixed(3)},${maxLat.toFixed(3)},${maxLng.toFixed(3)}`;
}

// ─── Graph Building ──────────────────────────────────────────────────

function buildGraph(elements: any[]): Graph {
  const coords = new Map<NodeId, [number, number]>();
  const edges = new Map<NodeId, { id: NodeId; dist: number }[]>();

  for (const way of elements) {
    if (!way.geometry || way.geometry.length < 2) continue;
    const geom: { lat: number; lon: number }[] = way.geometry;

    for (let i = 0; i < geom.length; i++) {
      const id: NodeId = `${geom[i].lat},${geom[i].lon}`;
      coords.set(id, [geom[i].lat, geom[i].lon]);
      if (!edges.has(id)) edges.set(id, []);

      if (i > 0) {
        const prevId: NodeId = `${geom[i - 1].lat},${geom[i - 1].lon}`;
        if (!edges.has(prevId)) edges.set(prevId, []);
        const dist = haversineM(geom[i].lat, geom[i].lon, geom[i - 1].lat, geom[i - 1].lon);
        edges.get(id)!.push({ id: prevId, dist });
        edges.get(prevId)!.push({ id, dist });
      }
    }
  }

  return { coords, edges };
}

// ─── Connected Components & Bridging ─────────────────────────────────

function findComponents(graph: Graph): Map<NodeId, number> {
  const componentOf = new Map<NodeId, number>();
  let idx = 0;
  for (const nodeId of Array.from(graph.coords.keys())) {
    if (componentOf.has(nodeId)) continue;
    const queue = [nodeId];
    componentOf.set(nodeId, idx);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const { id: nbId } of (graph.edges.get(cur) || [])) {
        if (!componentOf.has(nbId)) {
          componentOf.set(nbId, idx);
          queue.push(nbId);
        }
      }
    }
    idx++;
  }
  return componentOf;
}

/**
 * Bridge disconnected components ONLY if nearest nodes are within MAX_BRIDGE_DIST.
 * This prevents artificial long bridges across unrelated tracks.
 */
const MAX_BRIDGE_DIST = 50; // meters

function bridgeComponents(graph: Graph): void {
  const componentOf = findComponents(graph);
  const componentNodes = new Map<number, NodeId[]>();
  for (const [nodeId, comp] of componentOf) {
    if (!componentNodes.has(comp)) componentNodes.set(comp, []);
    componentNodes.get(comp)!.push(nodeId);
  }

  const compIds = Array.from(componentNodes.keys());
  if (compIds.length <= 1) return;

  // Try to bridge every pair of components if close enough
  for (let i = 0; i < compIds.length; i++) {
    for (let j = i + 1; j < compIds.length; j++) {
      const nodesA = componentNodes.get(compIds[i])!;
      const nodesB = componentNodes.get(compIds[j])!;

      // Sample to keep manageable
      const sampleA = nodesA.length > 80 ? nodesA.filter((_, k) => k % Math.ceil(nodesA.length / 80) === 0) : nodesA;
      const sampleB = nodesB.length > 80 ? nodesB.filter((_, k) => k % Math.ceil(nodesB.length / 80) === 0) : nodesB;

      let bestDist = Infinity;
      let bestA: NodeId | null = null;
      let bestB: NodeId | null = null;

      for (const a of sampleA) {
        const ca = graph.coords.get(a)!;
        for (const b of sampleB) {
          const cb = graph.coords.get(b)!;
          const d = haversineM(ca[0], ca[1], cb[0], cb[1]);
          if (d < bestDist) { bestDist = d; bestA = a; bestB = b; }
        }
      }

      if (bestA && bestB && bestDist <= MAX_BRIDGE_DIST) {
        graph.edges.get(bestA)!.push({ id: bestB, dist: bestDist });
        graph.edges.get(bestB)!.push({ id: bestA, dist: bestDist });
      }
    }
  }
}

// ─── Nearest Node & Dijkstra ─────────────────────────────────────────

function nearestNode(graph: Graph, lat: number, lng: number): NodeId | null {
  let minDist = Infinity;
  let nearest: NodeId | null = null;
  for (const [id, [nlat, nlng]] of graph.coords) {
    const d = haversineM(lat, lng, nlat, nlng);
    if (d < minDist) { minDist = d; nearest = id; }
  }
  return nearest;
}

function dijkstra(graph: Graph, startId: NodeId, endId: NodeId): [number, number][] | null {
  const dist = new Map<NodeId, number>();
  const prev = new Map<NodeId, NodeId | null>();
  const visited = new Set<NodeId>();

  for (const id of Array.from(graph.coords.keys())) dist.set(id, Infinity);
  dist.set(startId, 0);
  prev.set(startId, null);

  const pq: { id: NodeId; d: number }[] = [{ id: startId, d: 0 }];

  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const { id } = pq.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (id === endId) break;

    for (const { id: nbId, dist: edgeDist } of (graph.edges.get(id) || [])) {
      if (visited.has(nbId)) continue;
      const newDist = dist.get(id)! + edgeDist;
      if (newDist < dist.get(nbId)!) {
        dist.set(nbId, newDist);
        prev.set(nbId, id);
        pq.push({ id: nbId, d: newDist });
      }
    }
  }

  if (!prev.has(endId) && startId !== endId) return null;
  const path: [number, number][] = [];
  let cur: NodeId | null | undefined = endId;
  while (cur != null) {
    const c = graph.coords.get(cur);
    if (c) path.unshift(c);
    cur = prev.get(cur);
  }
  return path.length >= 2 ? path : null;
}

// ─── Fallback: Raw Way Segments ──────────────────────────────────────

/**
 * Extract raw way segments near the route line as fallback.
 * Filters ways by proximity to the route corridor.
 */
function extractRawWaySegments(
  elements: any[],
  startLat: number, startLng: number,
  endLat: number, endLng: number
): [number, number][][] {
  const midLat = (startLat + endLat) / 2;
  const midLng = (startLng + endLng) / 2;
  const routeLen = haversineM(startLat, startLng, endLat, endLng);
  const maxDist = routeLen * 1.2 + 1000;

  const segments: [number, number][][] = [];
  for (const way of elements) {
    if (!way.geometry || way.geometry.length < 2) continue;
    const geom: { lat: number; lon: number }[] = way.geometry;

    // Check if any point of this way is within the corridor
    let isRelevant = false;
    for (let i = 0; i < geom.length; i += Math.max(1, Math.floor(geom.length / 5))) {
      if (haversineM(midLat, midLng, geom[i].lat, geom[i].lon) < maxDist) {
        isRelevant = true;
        break;
      }
    }
    if (!isRelevant) continue;

    segments.push(geom.map(p => [p.lat, p.lon]));
  }
  return segments;
}

// ─── Overpass API ────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchOverpass(query: string, timeoutMs = 12000): Promise<any> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!res.ok) { console.warn(`Overpass ${endpoint}: ${res.status}`); continue; }
      return await res.json();
    } catch (err) {
      console.warn(`Overpass ${endpoint} failed:`, err);
      continue;
    }
  }
  throw new Error('All Overpass API endpoints failed');
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Fetch railway geometry between two points.
 *
 * Strategy:
 * 1. Compute tight bounding box with small buffer
 * 2. Check cache; if miss, query Overpass
 * 3. Build graph → snap start/end to nearest rail node → bridge components (≤50m)
 * 4. Dijkstra shortest path
 * 5. If Dijkstra fails → return raw way segments (NEVER straight line)
 */
export async function fetchRailwayGeometry(
  startLat: number, startLng: number,
  endLat: number, endLng: number
): Promise<[number, number][][]> {
  const minLat = Math.min(startLat, endLat);
  const maxLat = Math.max(startLat, endLat);
  const minLng = Math.min(startLng, endLng);
  const maxLng = Math.max(startLng, endLng);

  // Small buffer: 15% of span or 0.005° (~550m) minimum
  const latPad = Math.max((maxLat - minLat) * 0.15, 0.005);
  const lngPad = Math.max((maxLng - minLng) * 0.15, 0.005);
  const bMinLat = minLat - latPad;
  const bMinLng = minLng - lngPad;
  const bMaxLat = maxLat + latPad;
  const bMaxLng = maxLng + lngPad;
  const bbox = `${bMinLat.toFixed(6)},${bMinLng.toFixed(6)},${bMaxLat.toFixed(6)},${bMaxLng.toFixed(6)}`;
  const cacheKey = bboxCacheKey(bMinLat, bMinLng, bMaxLat, bMaxLng);

  let elements: any[];

  // Check cache first
  const cached = getCachedOverpass(cacheKey);
  if (cached) {
    elements = cached;
  } else {
    const query = `[out:json][timeout:15];way[railway~"^(rail|light_rail|subway|tram|narrow_gauge|monorail)$"](${bbox});out geom;`;
    try {
      const data = await fetchOverpass(query);
      elements = data.elements || [];
      if (elements.length > 0) setCachedOverpass(cacheKey, elements);
    } catch (err) {
      console.error('fetchRailwayGeometry: Overpass error', err);
      return [];
    }
  }

  if (elements.length === 0) {
    console.warn('No railway elements found in bbox:', bbox);
    return [];
  }

  // Build graph
  const graph = buildGraph(elements);
  if (graph.coords.size === 0) return extractRawWaySegments(elements, startLat, startLng, endLat, endLng);

  // Snap start/end to nearest rail node BEFORE pathfinding
  const startNode = nearestNode(graph, startLat, startLng);
  const endNode = nearestNode(graph, endLat, endLng);
  if (!startNode || !endNode) {
    return extractRawWaySegments(elements, startLat, startLng, endLat, endLng);
  }

  // Bridge disconnected components (max 50m gap)
  bridgeComponents(graph);

  // Dijkstra
  const path = dijkstra(graph, startNode, endNode);
  if (path && path.length >= 2) return [path];

  // Dijkstra failed → raw way segments (NEVER straight line)
  console.warn('Dijkstra failed, returning raw rail segments');
  const rawSegments = extractRawWaySegments(elements, startLat, startLng, endLat, endLng);
  return rawSegments.length > 0 ? rawSegments : [];
}

/**
 * Snap a coordinate to the nearest railway track point.
 */
export async function snapToRailwayPoint(
  lat: number, lng: number
): Promise<{ lat: number; lng: number; name: string } | null> {
  const RADIUS = 1000;
  const query = `[out:json][timeout:8];
(
  way(around:${RADIUS},${lat},${lng})[railway~"^(rail|light_rail|subway|tram|narrow_gauge|monorail)$"];
  node(around:${RADIUS},${lat},${lng})[railway="station"];
  node(around:${RADIUS},${lat},${lng})[railway="halt"];
);
out geom;`;

  try {
    const data = await fetchOverpass(query, 10000);
    if (!data.elements || data.elements.length === 0) return null;

    let minDist = Infinity;
    let nearest: { lat: number; lng: number; name: string } | null = null;

    for (const el of data.elements) {
      const tags = el.tags || {};
      const name = tags.name || tags['name:id'] || tags.ref || 'Jalur Rel';

      if (el.type === 'way' && el.geometry) {
        for (const node of el.geometry) {
          const d = haversineM(lat, lng, node.lat, node.lon);
          if (d < minDist) { minDist = d; nearest = { lat: node.lat, lng: node.lon, name }; }
        }
      }
      if (el.type === 'node' && el.lat != null) {
        const d = haversineM(lat, lng, el.lat, el.lon);
        if (d < minDist) { minDist = d; nearest = { lat: el.lat, lng: el.lon, name }; }
      }
    }

    return nearest;
  } catch (err) {
    console.error('snapToRailwayPoint error:', err);
    return null;
  }
}
