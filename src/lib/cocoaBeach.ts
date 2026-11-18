import type { Feature, FeatureCollection, Position } from 'geojson';
import { lotCenter, type LotFeature } from './lots';

/** City of Cocoa Beach, FL: the city's own water, sewer and reclaimed-water network layers (services5.arcgis.com, Cocoa Beach GIS). */
const ORG = 'https://services5.arcgis.com/U4PMgBw5XA2nmleg/arcgis/rest/services';
export const CB_BOUNDS: [number, number, number, number] = [-80.65, 28.29, -80.58, 28.38];
export const CB_MIN_ZOOM = 15.5;
export interface CbLayer { id: string; label: string; services: string[]; kind: 'line' | 'point'; color: string; on: boolean }
export const CB_LAYERS: CbLayer[] = [
  { id: 'water', label: 'Water mains', services: ['CB_PressurizedMain'], kind: 'line', color: '#1f6fd1', on: true },
  { id: 'sewer', label: 'Sewer mains', services: ['CB_SewerLines', 'CB_SewerForceMains'], kind: 'line', color: '#b5651d', on: true },
  { id: 'reclaim', label: 'Reclaimed water lines', services: ['CB_ReclaimedWaterLines'], kind: 'line', color: '#8e44ad', on: false },
  { id: 'hydrants', label: 'Fire hydrants', services: ['CB_Hydrants'], kind: 'point', color: '#d62828', on: true },
];
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
/** The city's features for one overlay layer inside a map view, as GeoJSON (up to 1,000 per service). */
export async function fetchCbLayer(layer: CbLayer, bbox: [number, number, number, number], signal: AbortSignal): Promise<FeatureCollection> {
  const parts = await Promise.all(layer.services.map(async s => {
    const q = new URLSearchParams({ geometry: bbox.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', f: 'geojson', resultRecordCount: '1000' });
    const j = await (await fetch(`${ORG}/${s}/FeatureServer/0/query?${q}`, { signal })).json();
    return (j.features || []) as Feature[];
  }));
  return parts.length ? { type: 'FeatureCollection', features: parts.flat() } : empty;
}

export interface CbLine { feet: number; size: number | null; material: string }
export interface CocoaBeachUtilities {
  inCity: boolean;
  waterMain: CbLine | null; sewerMain: CbLine | null; reclaimMain: CbLine | null;
  hydrant: { feet: number; id: string } | null;
  meters: { count: number; size: number | null; use: string } | null;
  reclaimZone: boolean;
}
interface Hit { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; paths?: number[][][] } }
async function query(service: string, geometry: object, geometryType: string, outFields: string, returnGeometry = false): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: returnGeometry ? 'true' : 'false', f: 'json' });
  const j = await (await fetch(`${ORG}/${service}/FeatureServer/0/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const FT_LAT = 364567, FT_LNG = 364567 * Math.cos(28.3 * Math.PI / 180);
const ft = (a: Position, b: Position) => Math.hypot((a[0] - b[0]) * FT_LNG, (a[1] - b[1]) * FT_LAT);
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
const distToLot = (p: Position, rs: Position[][]) => Math.min(...rs.map(r => inside(p, r) ? 0 : toRing(p, r)));
function lineToLot(path: number[][], rs: Position[][]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as Position, b = path[i + 1] as Position, n = Math.max(1, Math.ceil(ft(a, b) / 10));
    for (let k = 0; k <= n; k++) best = Math.min(best, distToLot([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], rs));
  }
  return best;
}
function nearest(hits: Hit[], rs: Position[][], sizeField: string, matField: string): CbLine | null {
  let best: CbLine | null = null;
  for (const h of hits) {
    const paths = h.geometry?.paths; if (!paths) continue;
    const feet = Math.min(...paths.map(p => lineToLot(p, rs)));
    if (!best || feet < best.feet) best = { feet, size: num(h.attributes[sizeField]), material: text(h.attributes[matField]) };
  }
  return best;
}

/** Cocoa Beach utility facts for a parcel, or null when it is outside the city's mapped area. */
export async function cocoaBeachUtilitiesAt(lot: LotFeature): Promise<CocoaBeachUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < CB_BOUNDS[0] || c[0] > CB_BOUNDS[2] || c[1] < CB_BOUNDS[1] || c[1] > CB_BOUNDS[3]) return null;
  const rs = rings(lot); if (!rs.length) return null;
  const xs = rs.flat().map(p => p[0]), ys = rs.flat().map(p => p[1]), pad = 0.0016;
  const env = { xmin: Math.min(...xs) - pad, ymin: Math.min(...ys) - pad, xmax: Math.max(...xs) + pad, ymax: Math.max(...ys) + pad };
  const E = 'esriGeometryEnvelope', P = 'esriGeometryPolygon';
  const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch { return d; } };
  const [city, wm, sm, sf, rm, hy, me, zone] = await Promise.all([
    safe(query('CityLimits', { x: c[0], y: c[1] }, 'esriGeometryPoint', 'CITY_NAME'), [] as Hit[]),
    safe(query('CB_PressurizedMain', env, E, 'DIAMETER,MATERIAL,WATERTYPE', true), [] as Hit[]),
    safe(query('CB_SewerLines', env, E, 'Size,Type', true), [] as Hit[]),
    safe(query('CB_SewerForceMains', env, E, 'Size,Type', true), [] as Hit[]),
    safe(query('CB_ReclaimedWaterLines', env, E, 'PipeSize,PipeType', true), [] as Hit[]),
    safe(query('CB_Hydrants', env, E, 'FH_NO,LIFECYCLES', true), [] as Hit[]),
    safe(query('Water_Meters_CocoaWater', { rings: rs }, P, 'METERSIZE,MeteredUse'), [] as Hit[]),
    safe(query('ReclaimedZone', { x: c[0], y: c[1] }, 'esriGeometryPoint', 'Phase_'), [] as Hit[]),
  ]);
  let hydrant: CocoaBeachUtilities['hydrant'] = null;
  for (const h of hy) {
    if (h.geometry?.x == null || h.geometry.y == null) continue;
    const feet = distToLot([h.geometry.x, h.geometry.y], rs);
    if (!hydrant || feet < hydrant.feet) hydrant = { feet, id: text(h.attributes.FH_NO) };
  }
  const sewer = [nearest(sm, rs, 'Size', 'Type'), nearest(sf, rs, 'Size', 'Type')].filter((x): x is CbLine => !!x).sort((a, b) => a.feet - b.feet)[0] || null;
  const out: CocoaBeachUtilities = {
    inCity: city.length > 0, waterMain: nearest(wm, rs, 'DIAMETER', 'MATERIAL'), sewerMain: sewer, reclaimMain: nearest(rm, rs, 'PipeSize', 'PipeType'), hydrant,
    meters: me.length ? { count: me.length, size: num(me[0].attributes.METERSIZE), use: text(me[0].attributes.MeteredUse) } : null, reclaimZone: zone.length > 0,
  };
  return out.inCity || out.waterMain || out.sewerMain || out.meters ? out : null;
}
