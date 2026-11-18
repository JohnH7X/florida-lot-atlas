import type { Position } from 'geojson';
import { lotCenter, type LotFeature } from './lots';

/** City of Titusville GIS (gis.titusville.com): its water, sewer and reclaimed-water networks, as mapped by the city. */
const ROOT = 'https://gis.titusville.com/arcgis/rest/services';
export const TITUSVILLE_BOUNDS: [number, number, number, number] = [-80.98, 28.42, -80.68, 28.78];
export interface TitusvilleLayer { id: string; label: string; service: string; layers: number[]; on: boolean }
/** Map overlays (image exports of the city's utility layers). */
export const TITUSVILLE_LAYERS: TitusvilleLayer[] = [
  { id: 'water', label: 'Water mains and hydrants', service: 'Water_UtilityFeatures', layers: [26, 20], on: true },
  { id: 'sewer', label: 'Sewer mains', service: 'Sewer_UtilityFeatures', layers: [11, 9], on: true },
  { id: 'reclaim', label: 'Reclaimed water mains', service: 'ReclaimWater_UtilityFeatures', layers: [18, 14], on: false },
];
export const titusvilleTiles = (l: TitusvilleLayer) =>
  `${ROOT}/${l.service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${l.layers.join(',')}&f=image`;

export interface NearLine { feet: number; diameter: number | null; material: string; kind: string }
export interface TitusvilleUtilities {
  inCity: boolean;
  waterMain: NearLine | null; sewerMain: NearLine | null; reclaimMain: NearLine | null;
  hydrant: { feet: number; id: string } | null;
  waterLateral: { count: number; diameter: number | null; material: string } | null;
  sewerLateral: { count: number; diameter: number | null; material: string } | null;
}

interface Hit { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; paths?: number[][][] } }
async function query(service: string, layer: number, geometry: object, geometryType: string, outFields: string, extra: Record<string, string> = {}): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json', ...extra });
  const j = await (await fetch(`${ROOT}/${service}/MapServer/${layer}/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const FT_LAT = 364567, FT_LNG = 364567 * Math.cos(28.6 * Math.PI / 180);
const ft = (a: Position, b: Position) => Math.hypot((a[0] - b[0]) * FT_LNG, (a[1] - b[1]) * FT_LAT);
/** Feet from a point to the closest edge of a ring. */
function toRing(p: Position, ring: Position[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
    best = Math.min(best, ft(p, [ax + t * dx, ay + t * dy]));
  }
  return best;
}
const inside = (p: Position, ring: Position[]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const rings = (lot: LotFeature): Position[][] => { const g = lot.geometry; if (!g) return []; return g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : []; };
/** Closest approach, in feet, of a line to the lot outline (0 when it crosses or lies inside the lot). Lines are sampled every ~10 ft. */
function lineToLot(path: number[][], rs: Position[][]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as Position, b = path[i + 1] as Position, n = Math.max(1, Math.ceil(ft(a, b) / 10));
    for (let k = 0; k <= n; k++) {
      const p: Position = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n];
      for (const r of rs) best = Math.min(best, inside(p, r) ? 0 : toRing(p, r));
    }
  }
  return best;
}
function nearest(hits: Hit[], rs: Position[][], kind: string): NearLine | null {
  let best: NearLine | null = null;
  for (const h of hits) {
    const active = h.attributes.ACTIVEFLAG ?? h.attributes.ActiveFlag; if (active === 0) continue;
    const paths = h.geometry?.paths; if (!paths) continue;
    const feet = Math.min(...paths.map(p => lineToLot(p, rs)));
    if (!best || feet < best.feet) best = { feet, diameter: num(h.attributes.DIAMETER ?? h.attributes.Diameter), material: text(h.attributes.MATERIAL ?? h.attributes.Material), kind };
  }
  return best;
}

/** Titusville utility facts for a parcel, or null when it is outside the city's mapped area. */
export async function titusvilleUtilitiesAt(lot: LotFeature): Promise<TitusvilleUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < TITUSVILLE_BOUNDS[0] || c[0] > TITUSVILLE_BOUNDS[2] || c[1] < TITUSVILLE_BOUNDS[1] || c[1] > TITUSVILLE_BOUNDS[3]) return null;
  const rs = rings(lot); if (!rs.length) return null;
  const poly = { rings: rs }, pt = { x: c[0], y: c[1] };
  const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch { return d; } };
  const G = 'esriGeometryPolygon', near = { distance: '150', units: 'esriSRUnit_Meter', returnGeometry: 'true' };
  const [city, wm, sg, sp, rm, hy, wl, sl] = await Promise.all([
    safe(query('CommunityDevelopment', 18, pt, 'esriGeometryPoint', 'JURISDICTION'), [] as Hit[]),
    safe(query('Water_UtilityFeatures', 26, poly, G, 'DIAMETER,MATERIAL,ACTIVEFLAG,WATERTYPE', near), [] as Hit[]),
    safe(query('Sewer_UtilityFeatures', 11, poly, G, 'DIAMETER,MATERIAL,ACTIVEFLAG', near), [] as Hit[]),
    safe(query('Sewer_UtilityFeatures', 9, poly, G, 'DIAMETER,MATERIAL,ACTIVEFLAG', near), [] as Hit[]),
    safe(query('ReclaimWater_UtilityFeatures', 18, poly, G, 'Diameter,Material,Enabled', near), [] as Hit[]),
    safe(query('Water_UtilityFeatures', 20, poly, G, 'FACILITYID,ACTIVEFLAG', near), [] as Hit[]),
    safe(query('Water_UtilityFeatures', 27, poly, G, 'DIAMETER,MATERIAL'), [] as Hit[]),
    safe(query('Sewer_UtilityFeatures', 10, poly, G, 'DIAMETER,MATERIAL'), [] as Hit[]),
  ]);
  let hydrant: TitusvilleUtilities['hydrant'] = null;
  for (const h of hy) {
    if (h.attributes.ACTIVEFLAG === 0 || h.geometry?.x == null || h.geometry.y == null) continue;
    const p: Position = [h.geometry.x, h.geometry.y], feet = rs.some(r => inside(p, r)) ? 0 : Math.min(...rs.map(r => toRing(p, r)));
    if (!hydrant || feet < hydrant.feet) hydrant = { feet, id: text(h.attributes.FACILITYID) };
  }
  const lateral = (hits: Hit[]) => hits.length ? { count: hits.length, diameter: num(hits[0].attributes.DIAMETER), material: text(hits[0].attributes.MATERIAL) } : null;
  const sewerMains = [nearest(sg, rs, 'gravity main'), nearest(sp, rs, 'force main')].filter((x): x is NearLine => !!x).sort((a, b) => a.feet - b.feet);
  const out: TitusvilleUtilities = {
    inCity: city.length > 0, waterMain: nearest(wm, rs, 'water main'), sewerMain: sewerMains[0] || null, reclaimMain: nearest(rm, rs, 'reclaimed main'),
    hydrant, waterLateral: lateral(wl), sewerLateral: lateral(sl),
  };
  return out.inCity || out.waterMain || out.sewerMain || out.reclaimMain || out.hydrant || out.waterLateral || out.sewerLateral ? out : null;
}
