export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.min(1, Math.max(0, Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2));
  return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number { return haversineMeters(lat1,lng1,lat2,lng2)/1000; }

export function formatDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): string { return haversineKm(lat1,lng1,lat2,lng2).toFixed(1); }
