export interface StationPoint {
  name: string;
  lat: number;
  lng: number;
}

// Canonical station coordinates used by assignment forms and all frontend maps.
export const STATIONS: readonly StationPoint[] = [
  { name: 'Sta. Maguwo', lat: -7.785040, lng: 110.436899 },
  { name: 'Sta. Lempuyangan', lat: -7.789961, lng: 110.375275 },
  { name: 'Sta. Yogyakarta', lat: -7.788870, lng: 110.363213 },
  { name: 'Sta. Patukan', lat: -7.790771, lng: 110.325332 },
  { name: 'Sta. Wojo', lat: -7.862278, lng: 110.041092 },
  { name: 'Sta. Jenar', lat: -7.802037, lng: 110.000797 },
  { name: 'Sta. Wates', lat: -7.859248, lng: 110.158247 },
  { name: 'Sta. Brambanan', lat: -7.756641, lng: 110.500415 },
  { name: 'Sta. Klaten', lat: -7.712576, lng: 110.602980 },
  { name: 'Sta. Delanggu', lat: -7.622398, lng: 110.706588 },
  { name: 'Sta. Solo Balapan', lat: -7.557184, lng: 110.819394 },
  { name: 'Sta. Wonogiri', lat: -7.815882, lng: 110.921733 },
  { name: 'Sta. Sumberlawang', lat: -7.327810, lng: 110.863565 },
  { name: 'Sta. Palur', lat: -7.568030, lng: 110.875387 },
  { name: 'Sta. Sragen', lat: -7.429623, lng: 111.016701 },
];
