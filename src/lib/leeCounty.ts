import type { Position } from 'geojson';
import { lotCenter, type LotFeature } from './lots';

/**
 * Lee County, FL utilities: Lee County Utilities (LCU) water, sewer and reclaimed mains, hydrants and service areas, plus the
 * city a parcel sits in, all from Lee County GIS. Cape Coral's own utility maps (CapeIMS) require a login, so they are not used.
 */
const GIS = 'https://gismapserver.leegov.com/gisserver910/rest/services';
export const LEE_BOUNDS: [number, number, number, number] = [-82.3, 26.3, -81.07, 26.85];

export interface LeeLayer { id: string; label: string; base: string; layers: string; color: string; on: boolean; source: string; opacity: number }
export const LEE_LAYERS: LeeLayer[] = [
  { id: 'lcu-water', label: 'LCU water mains', base: `${GIS}/UtilitiesLayers/Water_Existing/MapServer`, layers: '8', color: '#1f6fd1', on: true, source: 'Lee County GIS (Lee County Utilities)', opacity: 0.95 },
  { id: 'lcu-sewer', label: 'LCU sewer mains', base: `${GIS}/UtilitiesLayers/Wastewater_Existing/MapServer`, layers: '9,10', color: '#3aa30a', on: true, source: 'Lee County GIS (Lee County Utilities)', opacity: 0.95 },
  { id: 'lcu-reclaim', label: 'LCU reclaimed water mains', base: `${GIS}/UtilitiesLayers/ReclaimFacilities/MapServer`, layers: '6', color: '#8e44ad', on: false, source: 'Lee County GIS (Lee County Utilities)', opacity: 0.95 },
  { id: 'lcu-hydrants', label: 'LCU fire hydrants', base: `${GIS}/UtilitiesLayers/Water_Existing/MapServer`, layers: '1', color: '#d62828', on: false, source: 'Lee County GIS (Lee County Utilities)', opacity: 0.95 },
];
export const LEE_FRANCHISE_LAYERS: LeeLayer[] = [
  { id: 'fr-water', label: 'Water provider (franchise) areas', base: `${GIS}/Layers/Utilities/MapServer`, layers: '2', color: '#7fb3e6', on: false, source: 'Lee County GIS (water franchise areas)', opacity: 0.45 },
  { id: 'fr-sewer', label: 'Sewer provider (franchise) areas', base: `${GIS}/Layers/Utilities/MapServer`, layers: '3', color: '#d9b38c', on: false, source: 'Lee County GIS (wastewater franchise areas)', opacity: 0.45 },
];
LEE_LAYERS.push(...LEE_FRANCHISE_LAYERS);
export const leeTiles = (l: LeeLayer) =>
  `${l.base}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${l.layers}&f=image`;

export interface LeeLine { feet: number; size: number | null; material: string; status: string }
export interface LeeUtilities {
  /** The Lee County city the parcel is inside (e.g. "City of Cape Coral"), or null for unincorporated Lee County. */
  city: string | null;
  /** Who holds the water and wastewater franchise at the parcel (Lee County Utilities, a city, FGUA, a private system…), and whether it is in the Lehigh Acres improvement district. */
  franchise: { water: { name: string; phone: string } | null; sewer: { name: string; phone: string } | null; lamsid: boolean };
  lcu: {
    waterArea: boolean; sewerArea: boolean; waterMain: LeeLine | null; sewerMain: (LeeLine & { force: boolean }) | null;
    reclaimMain: LeeLine | null; hydrant: { feet: number; id: string } | null;
  } | null;
}

interface Hit { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; paths?: number[][][] } }
async function query(url: string, geometry: object, geometryType: string, outFields: string, returnGeometry = false): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: returnGeometry ? 'true' : 'false', f: 'json' });
  const j = await (await fetch(`${url}/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

const FT_LAT = 364567, FT_LNG = 364567 * Math.cos(26.6 * Math.PI / 180);
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
function nearest(hits: Hit[], rs: Position[][]): LeeLine | null {
  let best: LeeLine | null = null;
  for (const h of hits) {
    const a = h.attributes, paths = h.geometry?.paths; if (!paths || a.Retired === 1) continue;
    const status = text(a.CurrentStatus); if (status && status !== 'Active') continue;
    const feet = Math.min(...paths.map(p => lineToLot(p, rs)));
    if (!best || feet < best.feet) best = { feet, size: num(a.Diameter), material: text(a.Material), status };
  }
  return best;
}

async function cityAt(c: Position): Promise<string | null> {
  try { return text((await query(`${GIS}/Layers/Boundaries/MapServer/15`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'CityName'))[0]?.attributes.CityName) || null; } catch { return null; }
}

async function lcu(lot: LotFeature, c: Position): Promise<LeeUtilities['lcu']> {
  const rs = rings(lot);
  const dLat = 500 / FT_LAT, dLng = 500 / FT_LNG;
  const env = { xmin: c[0] - dLng, ymin: c[1] - dLat, xmax: c[0] + dLng, ymax: c[1] + dLat };
  const inArea = async (layer: number) => { try { return (await query(`${GIS}/Layers/Utilities/MapServer/${layer}`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'OBJECTID')).length > 0; } catch { return false; } };
  const lines = async (svc: string, layer: number) => { try { return await query(`${GIS}/UtilitiesLayers/${svc}/MapServer/${layer}`, env, 'esriGeometryEnvelope', '*', true); } catch { return [] as Hit[]; } };
  const [waterArea, sewerArea, water, grav, force, reclaim, hyd] = await Promise.all([
    inArea(1), inArea(4), lines('Water_Existing', 8), lines('Wastewater_Existing', 10), lines('Wastewater_Existing', 9), lines('ReclaimFacilities', 6),
    (async () => { try { return await query(`${GIS}/UtilitiesLayers/Water_Existing/MapServer/1`, env, 'esriGeometryEnvelope', 'HydrantID,CurrentStatus,Retired', true); } catch { return [] as Hit[]; } })(),
  ]);
  const potable = water.filter(h => { const t = text(h.attributes.WaterType); return !t || t === 'Potable'; });
  const g = nearest(grav, rs), f = nearest(force, rs);
  const sewerMain = g && (!f || g.feet <= f.feet) ? { ...g, force: false } : f ? { ...f, force: true } : null;
  let hydrant: { feet: number; id: string } | null = null;
  for (const h of hyd) {
    if (h.attributes.Retired === 1 || h.geometry?.x == null || h.geometry.y == null) continue;
    const feet = distToLot([h.geometry.x, h.geometry.y], rs);
    if (!hydrant || feet < hydrant.feet) hydrant = { feet, id: text(h.attributes.HydrantID) };
  }
  const waterMain = nearest(potable, rs), reclaimMain = nearest(reclaim, rs);
  if (!waterArea && !sewerArea && !waterMain && !sewerMain && !reclaimMain && !hydrant) return null;
  return { waterArea, sewerArea, waterMain, sewerMain, reclaimMain, hydrant };
}

/** Lee County Utilities facts and the city for a parcel, or null when it is outside Lee County or nothing is mapped for it. */
export async function leeUtilitiesAt(lot: LotFeature): Promise<LeeUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < LEE_BOUNDS[0] || c[0] > LEE_BOUNDS[2] || c[1] < LEE_BOUNDS[1] || c[1] > LEE_BOUNDS[3]) return null;
  const fr = async (layer: number) => { try { const a = (await query(`${GIS}/Layers/Utilities/MapServer/${layer}`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'FranchiseName,Phone'))[0]?.attributes; return a ? { name: text(a.FranchiseName), phone: text(a.Phone) } : null; } catch { return null; } };
  const lamsid = async () => { try { return (await query(`${GIS}/Layers/Boundaries/MapServer/6`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'OBJECTID')).length > 0; } catch { return false; } };
  const [city, l, water, sewer, lam] = await Promise.all([cityAt(c), lcu(lot, c).catch(() => null), fr(2), fr(3), lamsid()]);
  return city || l || water || sewer ? { city, lcu: l, franchise: { water, sewer, lamsid: lam } } : null;
}
