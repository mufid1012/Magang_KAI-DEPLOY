/**
 * Server-side static map renderer using node-canvas + OSM tiles.
 * Renders a map image with a GPS track polyline — no browser needed.
 * NOTE: 'canvas' is loaded lazily so the server still boots if the package is missing.
 */
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

// --- Tile math helpers ---
function lng2tile(lng: number, zoom: number) { return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom)); }
function lat2tile(lat: number, zoom: number) {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
}
function tile2lng(x: number, zoom: number) { return (x / Math.pow(2, zoom)) * 360 - 180; }
function tile2lat(y: number, zoom: number) {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

// Convert lat/lng to pixel coordinates on the tile grid
function latLngToPixel(lat: number, lng: number, zoom: number, originTileX: number, originTileY: number): [number, number] {
  const n = Math.pow(2, zoom);
  const xTile = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const px = (xTile - originTileX) * 256;
  const py = (yTile - originTileY) * 256;
  return [px, py];
}

// Choose best zoom level for the bounding box to fit in given dimensions
function bestZoom(minLat: number, maxLat: number, minLng: number, maxLng: number, width: number, height: number): number {
  for (let z = 17; z >= 1; z--) {
    const x1 = lng2tile(minLng, z);
    const x2 = lng2tile(maxLng, z);
    const y1 = lat2tile(maxLat, z); // note: lat decreases as tile y increases
    const y2 = lat2tile(minLat, z);
    const tilesX = x2 - x1 + 1;
    const tilesY = y2 - y1 + 1;
    if (tilesX * 256 <= width * 2 && tilesY * 256 <= height * 2) {
      return z;
    }
  }
  return 3;
}

import https from 'https';
import http from 'http';

// Fetch tile buffer with proper headers to comply with tile usage policies
function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'PPJKAI-TrackInspectionApp/1.0 (https://kai.id)',
        'Accept': 'image/png,image/*;q=0.8',
        'Referer': 'https://kai.id/'
      },
      timeout: 6000
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
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

// Fetch a single tile with retry and fallback servers
async function fetchTile(x: number, y: number, z: number, retries = 2): Promise<any> {
  const subdomains = ['a', 'b', 'c', 'd'];
  const s = subdomains[Math.abs(x + y) % subdomains.length];
  
  // Primary: CartoDB Voyager (clean, fast, railway-friendly, very reliable for server-side rendering)
  // Fallback: OpenStreetMap with proper User-Agent
  const urls = [
    `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    `https://${s.slice(0, 3)}.tile.openstreetmap.org/${z}/${x}/${y}.png`
  ];

  for (const url of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const buffer = await fetchBuffer(url);
        const img = await loadImage(buffer);
        return img;
      } catch (err) {
        if (attempt === retries) break;
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }
  return null;
}

/**
 * Render a static map image with a GPS route path drawn on it.
 * @returns base64 data URL (PNG)
 */
export async function renderStaticMap(
  routePath: [number, number][],
  width = 800,
  height = 400
): Promise<string | null> {
  if (!routePath || routePath.length < 2) return null;
  if (!canvasAvailable) return null;

  try {
    // Calculate bounding box with padding
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of routePath) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    // Add ~10% padding
    const latPad = (maxLat - minLat) * 0.15 || 0.005;
    const lngPad = (maxLng - minLng) * 0.15 || 0.005;
    minLat -= latPad; maxLat += latPad;
    minLng -= lngPad; maxLng += lngPad;

    const zoom = bestZoom(minLat, maxLat, minLng, maxLng, width, height);

    // Get tile range
    const tileX1 = lng2tile(minLng, zoom);
    const tileX2 = lng2tile(maxLng, zoom);
    const tileY1 = lat2tile(maxLat, zoom);
    const tileY2 = lat2tile(minLat, zoom);

    const tilesWide = tileX2 - tileX1 + 1;
    const tilesTall = tileY2 - tileY1 + 1;
    const tileCanvasW = tilesWide * 256;
    const tileCanvasH = tilesTall * 256;

    // Create large canvas for all tiles
    const tileCanvas = createCanvas(tileCanvasW, tileCanvasH);
    const tileCtx = tileCanvas.getContext('2d');

    // Fill background
    tileCtx.fillStyle = '#e8e8e8';
    tileCtx.fillRect(0, 0, tileCanvasW, tileCanvasH);

    // Fetch and draw all tiles in parallel
    const tilePromises: Promise<void>[] = [];
    for (let ty = tileY1; ty <= tileY2; ty++) {
      for (let tx = tileX1; tx <= tileX2; tx++) {
        tilePromises.push(
          fetchTile(tx, ty, zoom).then(img => {
            if (img) {
              const dx = (tx - tileX1) * 256;
              const dy = (ty - tileY1) * 256;
              tileCtx.drawImage(img, dx, dy, 256, 256);
            }
          })
        );
      }
    }
    await Promise.all(tilePromises);

    // Calculate the center of the route in pixel coords to crop from tile canvas
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const [centerPx, centerPy] = latLngToPixel(centerLat, centerLng, zoom, tileX1, tileY1);

    // Source rectangle for cropping
    const sx = Math.max(0, Math.round(centerPx - width / 2));
    const sy = Math.max(0, Math.round(centerPy - height / 2));
    const sw = Math.min(width, tileCanvasW - sx);
    const sh = Math.min(height, tileCanvasH - sy);

    // Create output canvas
    const outputCanvas = createCanvas(width, height);
    const ctx = outputCanvas.getContext('2d');

    // Fill bg
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, width, height);

    // Draw cropped tiles
    ctx.drawImage(tileCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    // Draw route polyline
    ctx.beginPath();
    ctx.strokeStyle = '#005bac';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (let i = 0; i < routePath.length; i++) {
      const [lat, lng] = routePath[i];
      const [px, py] = latLngToPixel(lat, lng, zoom, tileX1, tileY1);
      const x = px - sx;
      const y = py - sy;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw start marker (green circle)
    const [startPx, startPy] = latLngToPixel(routePath[0][0], routePath[0][1], zoom, tileX1, tileY1);
    const sX = startPx - sx, sY = startPy - sy;
    ctx.beginPath();
    ctx.arc(sX, sY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#16a34a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Label "A"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', sX, sY);

    // Draw end marker (red circle)
    const last = routePath[routePath.length - 1];
    const [endPx, endPy] = latLngToPixel(last[0], last[1], zoom, tileX1, tileY1);
    const eX = endPx - sx, eY = endPy - sy;
    ctx.beginPath();
    ctx.arc(eX, eY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Label "B"
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('B', eX, eY);

    // Convert to base64 PNG
    return outputCanvas.toDataURL('image/png');
  } catch (err) {
    console.error('renderStaticMap error:', err);
    return null;
  }
}
