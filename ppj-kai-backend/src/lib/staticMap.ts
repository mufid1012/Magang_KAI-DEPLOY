/**
 * Server-side static map renderer using node-canvas + OpenStreetMap tiles.
 * Draws the GPS track, start/end markers and numbered finding markers.
 * NOTE: 'canvas' is loaded lazily so the server still boots if the package is missing.
 */
import https from 'https';
import http from 'http';

let createCanvas: any;
let loadImage: any;
let canvasAvailable = false;
try {
  const canvasModule = require('canvas');
  createCanvas = canvasModule.createCanvas;
  loadImage = canvasModule.loadImage;
  canvasAvailable = true;
} catch {
  console.warn('[staticMap] "canvas" package not found — PDF map rendering will be disabled. Install with: npm install canvas');
}

const TILE = 256;
const MAX_ZOOM = 17;

export type LatLng = [number, number];
export interface MapMarker { lat: number; lng: number; label: string; color: string }
export interface StaticMapResult { dataUrl: string; tilesLoaded: number; tilesTotal: number }
export interface MapView { zoom: number; left: number; top: number }

/** Web-Mercator position in pixels at the given zoom (whole world = 256 * 2^zoom). */
export function worldPixel(lat: number, lng: number, zoom: number): [number, number] {
  const size = TILE * 2 ** zoom;
  const sin = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return [((lng + 180) / 360) * size, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size];
}

/**
 * Highest zoom whose pixel extent of every point fits inside the frame minus padding,
 * plus the top-left world pixel that centers those points in the frame.
 */
export function planMapView(points: LatLng[], width: number, height: number, padding: number): MapView {
  let zoom = MAX_ZOOM;
  for (; zoom > 1; zoom--) {
    const px = points.map(([lat, lng]) => worldPixel(lat, lng, zoom));
    const spanX = Math.max(...px.map(p => p[0])) - Math.min(...px.map(p => p[0]));
    const spanY = Math.max(...px.map(p => p[1])) - Math.min(...px.map(p => p[1]));
    if (spanX <= width - 2 * padding && spanY <= height - 2 * padding) break;
  }
  const px = points.map(([lat, lng]) => worldPixel(lat, lng, zoom));
  const cx = (Math.max(...px.map(p => p[0])) + Math.min(...px.map(p => p[0]))) / 2;
  const cy = (Math.max(...px.map(p => p[1])) + Math.min(...px.map(p => p[1]))) / 2;
  return { zoom, left: cx - width / 2, top: cy - height / 2 };
}

function fetchBuffer(url: string, redirects = 3): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'PPJKAI-TrackInspectionApp/1.0', 'Accept': 'image/png,image/*;q=0.8' },
      timeout: 6000,
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        fetchBuffer(res.headers.location, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// CARTO basemaps now answer HTTP 200 with an "API KEY REQUIRED" placeholder image,
// so they cannot be used as a silent primary source. OSM is what the frontend maps use.
async function fetchTile(x: number, y: number, z: number, retries = 2): Promise<any> {
  const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loadImage(await fetchBuffer(url));
    } catch {
      if (attempt < retries) await new Promise(r => setTimeout(r, 250));
    }
  }
  return null;
}

function drawPin(ctx: any, x: number, y: number, radius: number, fill: string, stroke: string, text: string, textColor: string) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = textColor;
  ctx.font = `bold ${text.length > 1 ? radius * 0.95 : radius * 1.1}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
}

/**
 * Render a static map image. Needs at least one route point or marker.
 * width/height are layout pixels; the canvas is `scale` times larger for print sharpness.
 */
export async function renderStaticMap(
  route: LatLng[],
  markers: MapMarker[] = [],
  options: { width?: number; height?: number; scale?: number; routeColor?: string } = {},
): Promise<StaticMapResult | null> {
  const { width = 690, height = 380, scale = 1.5, routeColor = '#004482' } = options;
  const allPoints: LatLng[] = [...route, ...markers.map(m => [m.lat, m.lng] as LatLng)];
  if (!canvasAvailable || allPoints.length === 0) return null;

  try {
    const { zoom, left, top } = planMapView(allPoints, width, height, 36);
    const project = (lat: number, lng: number): [number, number] => {
      const [x, y] = worldPixel(lat, lng, zoom);
      return [x - left, y - top];
    };

    const canvas = createCanvas(Math.round(width * scale), Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, width, height);

    // Only fetch tiles that intersect the frame.
    const tilesPerSide = 2 ** zoom;
    const tx1 = Math.floor(left / TILE), tx2 = Math.floor((left + width) / TILE);
    const ty1 = Math.max(0, Math.floor(top / TILE)), ty2 = Math.min(tilesPerSide - 1, Math.floor((top + height) / TILE));
    const jobs: Promise<boolean>[] = [];
    for (let ty = ty1; ty <= ty2; ty++) {
      for (let tx = tx1; tx <= tx2; tx++) {
        const wrappedX = ((tx % tilesPerSide) + tilesPerSide) % tilesPerSide;
        jobs.push(fetchTile(wrappedX, ty, zoom).then(img => {
          if (!img) return false;
          ctx.drawImage(img, tx * TILE - left, ty * TILE - top, TILE, TILE);
          return true;
        }));
      }
    }
    const loaded = (await Promise.all(jobs)).filter(Boolean).length;

    // Route: white casing under the colored line keeps it legible over busy tiles.
    if (route.length >= 2) {
      const path = route.map(([lat, lng]) => project(lat, lng));
      for (const [color, lineWidth] of [['#ffffff', 7], [routeColor, 4]] as const) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        path.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
      }
    }

    // Spread markers that land on the same spot so each number stays readable.
    const placed: [number, number][] = [];
    for (const marker of markers) {
      let [x, y] = project(marker.lat, marker.lng);
      for (let step = 1; placed.some(([px, py]) => Math.hypot(px - x, py - y) < 18) && step < 24; step++) {
        const angle = step * 2.4;
        const [bx, by] = project(marker.lat, marker.lng);
        x = bx + Math.cos(angle) * 9 * Math.sqrt(step);
        y = by + Math.sin(angle) * 9 * Math.sqrt(step);
      }
      placed.push([x, y]);
      const isEndpoint = marker.label === 'A' || marker.label === 'B';
      const fill = marker.label === 'A' ? '#ffffff' : marker.color;
      const text = marker.label === 'A' ? routeColor : '#ffffff';
      drawPin(ctx, x, y, isEndpoint ? 10 : 9.5, fill, marker.label === 'A' ? routeColor : '#ffffff', marker.label, text);
    }

    // OSM tile licence requires visible attribution.
    const credit = '© OpenStreetMap contributors';
    ctx.font = '10px sans-serif';
    const creditWidth = ctx.measureText(credit).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(width - creditWidth, height - 16, creditWidth, 16);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(credit, width - 5, height - 8);

    // JPEG keeps a print-sharp map around a tenth of the PNG size inside the PDF.
    const jpeg: Buffer = canvas.toBuffer('image/jpeg', { quality: 0.85 });
    return { dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`, tilesLoaded: loaded, tilesTotal: jobs.length };
  } catch (err) {
    console.error('renderStaticMap error:', err);
    return null;
  }
}
