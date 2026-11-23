import type { Feature, FeatureCollection, Position } from 'geojson';
import type { LotFeature } from './lots';

/** Shared helpers for the utility-line libraries: ArcGIS REST queries and lot-to-line distances (feet, planar). */
export interface Hit { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; paths?: number[][][] } }

/** POST an ArcGIS REST query (WGS84 in and out). */
export async function esriQuery(url: string, geometry: object, geometryType: string, outFields: string, returnGeometry = false): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: returnGeometry ? 'true' : 'false', f: 'json' });
  const j = await (await fetch(`${url}/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
export const text = (v: unknown) => (v == null ? '' : String(v).trim());
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
export const inBounds = (c: Position, b: [number, number, number, number]) => c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3];

const FT_LAT = 364567, FT_LNG = 364567 * Math.cos(27.1 * Math.PI / 180);
export const FT = { lat: FT_LAT, lng: FT_LNG };
/** A search envelope about 500 ft around a point. */
export const envAround = (c: Position, feet = 500) => ({ xmin: c[0] - feet / FT_LNG, ymin: c[1] - feet / FT_LAT, xmax: c[0] + feet / FT_LNG, ymax: c[1] + feet / FT_LAT });
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
export const lotRings = (lot: LotFeature): Position[][] => { const g = lot.geometry; if (!g) return []; return g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : []; };
/** Distance in feet from a point to the lot (0 when inside it). */
export const distToLot = (p: Position, rs: Position[][]) => Math.min(...rs.map(r => inside(p, r) ? 0 : toRing(p, r)));
function lineToLot(path: number[][], rs: Position[][]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as Position, b = path[i + 1] as Position, n = Math.max(1, Math.ceil(ft(a, b) / 10));
    for (let k = 0; k <= n; k++) best = Math.min(best, distToLot([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], rs));
  }
  return best;
}
export interface Line { feet: number; size: number | null; material: string; kind: string }
/** The closest line to the lot among the hits; `skip` can drop retired or inactive pipes, `kind` labels the pipe type. */
export function nearestLine(hits: Hit[], rs: Position[][], opt: { size: string; material?: string; kind?: string; skip?: (a: Record<string, unknown>) => boolean }): Line | null {
  let best: Line | null = null;
  for (const h of hits) {
    const paths = h.geometry?.paths; if (!paths || opt.skip?.(h.attributes)) continue;
    const feet = Math.min(...paths.map(p => lineToLot(p, rs)));
    if (!best || feet < best.feet) best = { feet, size: num(h.attributes[opt.size]), material: opt.material ? text(h.attributes[opt.material]) : '', kind: opt.kind || '' };
  }
  return best;
}
/** The closest point feature to the lot, with a label taken from the given field. */
export function nearestPoint(hits: Hit[], rs: Position[][], idField: string, skip?: (a: Record<string, unknown>) => boolean): { feet: number; id: string } | null {
  let best: { feet: number; id: string } | null = null;
  for (const h of hits) {
    if (h.geometry?.x == null || h.geometry.y == null || skip?.(h.attributes)) continue;
    const feet = distToLot([h.geometry.x, h.geometry.y], rs);
    if (!best || feet < best.feet) best = { feet, id: text(h.attributes[idField]) };
  }
  return best;
}
export const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

/** A vector overlay drawn from hosted FeatureServer layers (lines or points) for the map view. */
export interface VectorLayer { id: string; label: string; urls: string[]; kind: 'line' | 'point'; color: string; on: boolean }
export async function fetchVectorLayer(layer: VectorLayer, bbox: [number, number, number, number], signal: AbortSignal): Promise<FeatureCollection> {
  const parts = await Promise.all(layer.urls.map(async u => {
    const q = new URLSearchParams({ geometry: bbox.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: '*', f: 'geojson', resultRecordCount: '1500' });
    const j = await (await fetch(`${u}/query?${q}`, { signal })).json();
    return (j.features || []) as Feature[];
  }));
  return { type: 'FeatureCollection', features: parts.flat() };
}

/** Service-area polygons from a hosted FeatureServer layer for the map view, each tagged with a `cat` property used to colour it. */
export async function fetchPolygons(url: string, bbox: [number, number, number, number], signal: AbortSignal, categorize: (p: Record<string, unknown>) => string): Promise<FeatureCollection> {
  const q = new URLSearchParams({ geometry: bbox.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: '*', f: 'geojson', resultRecordCount: '1000', maxAllowableOffset: '0.00005' });
  const j = await (await fetch(`${url}/query?${q}`, { signal })).json();
  return { type: 'FeatureCollection', features: ((j.features || []) as Feature[]).map(f => ({ ...f, properties: { ...(f.properties || {}), cat: categorize((f.properties || {}) as Record<string, unknown>) } })) };
}
