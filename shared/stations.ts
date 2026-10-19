export interface StationPoint { name: string; lat: number; lng: number; }
const catalog: readonly StationPoint[] = [
  {
    "name": "Sta. Maguwo",
    "lat": -7.78504,
    "lng": 110.436899
  },
  {
    "name": "Sta. Lempuyangan",
    "lat": -7.789961,
    "lng": 110.375275
  },
  {
    "name": "Sta. Yogyakarta",
    "lat": -7.78887,
    "lng": 110.363213
  },
  {
    "name": "Sta. Patukan",
    "lat": -7.790771,
    "lng": 110.325332
  },
  {
    "name": "Sta. Wojo",
    "lat": -7.862278,
    "lng": 110.041092
  },
  {
    "name": "Sta. Jenar",
    "lat": -7.802037,
    "lng": 110.000797
  },
  {
    "name": "Sta. Wates",
    "lat": -7.859248,
    "lng": 110.158247
  },
  {
    "name": "Sta. Brambanan",
    "lat": -7.756641,
    "lng": 110.500415
  },
  {
    "name": "Sta. Klaten",
    "lat": -7.712576,
    "lng": 110.60298
  },
  {
    "name": "Sta. Delanggu",
    "lat": -7.622398,
    "lng": 110.706588
  },
  {
    "name": "Sta. Solo Balapan",
    "lat": -7.557184,
    "lng": 110.819394
  },
  {
    "name": "Sta. Wonogiri",
    "lat": -7.815882,
    "lng": 110.921733
  },
  {
    "name": "Sta. Sumberlawang",
    "lat": -7.32781,
    "lng": 110.863565
  },
  {
    "name": "Sta. Palur",
    "lat": -7.56803,
    "lng": 110.875387
  },
  {
    "name": "Sta. Sragen",
    "lat": -7.429623,
    "lng": 111.016701
  },
  {
    "name": "Sta. Kedungbanteng",
    "lat": -7.405138,
    "lng": 111.117101
  }
];
const byName = new Map(catalog.map(station => [station.name, station]));
function route(names: readonly string[]): readonly StationPoint[] {
  return names.map(name => { const station = byName.get(name); if (!station) throw new Error('Unknown station: ' + name); return station; });
}
export const STATIONS = route(["Sta. Maguwo","Sta. Lempuyangan","Sta. Yogyakarta","Sta. Patukan","Sta. Wojo","Sta. Jenar","Sta. Wates","Sta. Brambanan","Sta. Klaten","Sta. Delanggu","Sta. Solo Balapan","Sta. Wonogiri","Sta. Sumberlawang","Sta. Palur","Sta. Sragen"]);
export const GUEST_STATIONS = route(["Sta. Jenar","Sta. Wojo","Sta. Wates","Sta. Patukan","Sta. Yogyakarta","Sta. Lempuyangan","Sta. Maguwo","Sta. Brambanan","Sta. Klaten","Sta. Delanggu","Sta. Solo Balapan","Sta. Palur","Sta. Sragen","Sta. Kedungbanteng"]);
