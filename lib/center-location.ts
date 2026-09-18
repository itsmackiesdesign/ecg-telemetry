export type CenterCoordinates = {latitude?: string | number | null; longitude?: string | number | null};
export function parseCoordinate(value: string | number | null | undefined, max: number): number | null {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isFinite(number) && Math.abs(number) <= max ? number : null;
}
export function centerLocation(center: CenterCoordinates) {
  const lat = parseCoordinate(center.latitude, 90), lon = parseCoordinate(center.longitude, 180);
  if (lat === null || lon === null) return null;
  const west = Math.max(-180, lon - .006), east = Math.min(180, lon + .006);
  const south = Math.max(-90, lat - .004), north = Math.min(90, lat + .004);
  return {
    lat, lon,
    // OSM bbox uses longitude first; the marker uses latitude first.
    embed: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${west},${south},${east},${north}`)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`,
    link: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lon}`)}`,
  };
}
