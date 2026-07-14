import { Request, Response } from 'express';

interface OverpassResponse {
  elements?: unknown[];
}

const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          // This mirror only accepts its allow-listed Overpass client agents.
          'User-Agent': 'curl/8.7.1',
        },
        body: query,
        signal: controller.signal,
      });

      if (!response.ok) continue;
      return await response.json() as OverpassResponse;
    } catch (error) {
      console.warn(`Railway proxy failed for ${endpoint}:`, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('All Overpass API endpoints failed');
}

export const getRailwayGeometry = async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    let query: string;

    if (mode === 'bbox') {
      const { minLat, minLng, maxLat, maxLng } = req.body;
      if (
        !isCoordinate(minLat, 90) || !isCoordinate(maxLat, 90)
        || !isCoordinate(minLng, 180) || !isCoordinate(maxLng, 180)
        || minLat >= maxLat || minLng >= maxLng
        || maxLat - minLat > 5 || maxLng - minLng > 5
      ) {
        return res.status(400).json({ success: false, message: 'Invalid railway bounding box' });
      }

      const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
      query = `[out:json][timeout:15];way[railway~"^(rail|light_rail|subway|tram|narrow_gauge|monorail)$"](${bbox});out geom;`;
    } else if (mode === 'nearby') {
      const { lat, lng } = req.body;
      const radius = Number(req.body.radius);
      if (!isCoordinate(lat, 90) || !isCoordinate(lng, 180) || !Number.isFinite(radius) || radius <= 0 || radius > 2000) {
        return res.status(400).json({ success: false, message: 'Invalid nearby railway request' });
      }

      query = `[out:json][timeout:8];
(
  way(around:${radius},${lat},${lng})[railway~"^(rail|light_rail|subway|tram|narrow_gauge|monorail)$"];
  node(around:${radius},${lat},${lng})[railway="station"];
  node(around:${radius},${lat},${lng})[railway="halt"];
);
out geom;`;
    } else {
      return res.status(400).json({ success: false, message: 'Unknown railway request mode' });
    }

    const data = await fetchOverpass(query);
    return res.json(data);
  } catch (error) {
    console.error('Railway geometry error:', error);
    return res.status(502).json({ success: false, message: 'Railway geometry provider unavailable' });
  }
};
