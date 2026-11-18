import type { Position } from 'geojson';
import { lotCenter, type LotFeature } from './lots';

/** City of Palm Bay public map (gis.palmbayflorida.org), the "City Map" web app: the facts it shows about utilities at a spot. */
const ROOT = 'https://gis.palmbayflorida.org/arcgis/rest/services';
const YES: Record<string, string> = { YES: 'Yes', NO: 'No', CAUTION: 'Not readily available' };
export interface PalmBayLotLine { feet: number; water: number | null; sewer: number | null; note: string }
export interface PalmBayUtilities {
  area: string | null;
  water: string | null; sewer: string | null; reclaimed: string | null; availNote: string | null;
  unit: { name: string; description: string; water: string | null; sewer: string | null; reclaimed: string | null; gated: string | null } | null;
  hydrant: { feet: number; status: string; owner: string; address: string } | null;
  trash: { trash: string; recycle: string; yard: string; bulk: string } | null;
  lines: PalmBayLotLine[];
}

type Attrs = Record<string, unknown>;
interface Hit { attributes: Attrs; geometry?: { x?: number; y?: number; paths?: number[][][] } }
async function query(service: string, geometry: object, geometryType: string, outFields: string, extra: Record<string, string> = {}): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: extra.returnGeometry || 'false', f: 'json', ...extra });
  const r = await fetch(`${ROOT}/${service}/MapServer/0/query`, { method: 'POST', body });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const feetBetween = (a: Position, b: Position) => {
  const lat = ((a[1] + b[1]) / 2) * Math.PI / 180, dx = (a[0] - b[0]) * 364567 * Math.cos(lat) / Math.cos(28 * Math.PI / 180), dy = (a[1] - b[1]) * 364567;
  return Math.hypot(dx, dy);
};
/** Feet from a point to the nearest edge of the parcel's outline. */
function distanceToRing(p: Position, ring: Position[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1], dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
    best = Math.min(best, feetBetween(p, [ax + t * dx, ay + t * dy]));
  }
  return best;
}
const rings = (lot: LotFeature): Position[][] => {
  const g = lot.geometry; if (!g) return [];
  return g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : [];
};

/** Utilities facts for a parcel, or null when it is outside the City of Palm Bay's map. */
export async function palmBayUtilitiesAt(lot: LotFeature): Promise<PalmBayUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  const pt = { x: c[0], y: c[1] };
  const city = await query('CommonServices/CityLimits', pt, 'esriGeometryPoint', 'City_Name');
  if (!city.length) return null;
  const ring = rings(lot);
  const poly = ring.length ? { rings: ring } : null;
  const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch { return d; } };
  const [avail, unit, trash, hydr, lines] = await Promise.all([
    safe(query('CommonServices/WaterSewerAvail', pt, 'esriGeometryPoint', 'TOWNSHIP,WATER,SEWER,Reclaim,Comments'), [] as Hit[]),
    safe(query('CommonServices/Units', pt, 'esriGeometryPoint', 'Sub_Name,Description,Water_Type,Sewer_Type,Reclaim_Type,Gated'), [] as Hit[]),
    safe(query('RepublicTrashBND', pt, 'esriGeometryPoint', 'Trash,Recycle,YardTrash,Bulk_'), [] as Hit[]),
    safe(query('UT/FireHydrants', pt, 'esriGeometryPoint', 'OWNED_BY,Status,Address', { distance: '250', units: 'esriSRUnit_Meter', returnGeometry: 'true' }), [] as Hit[]),
    poly ? safe(query('CommonServices/Lotlines', poly, 'esriGeometryPolygon', 'LOT_Footage,WaterCost,SewerCost,Exception', { returnGeometry: 'true' }), [] as Hit[]) : Promise.resolve([] as Hit[]),
  ]);
  const a = avail[0]?.attributes, u = unit[0]?.attributes, t = trash[0]?.attributes;
  let nearest: PalmBayUtilities['hydrant'] = null;
  for (const h of hydr) {
    if (h.geometry?.x == null || h.geometry.y == null) continue;
    const feet = feetBetween(c, [h.geometry.x, h.geometry.y]);
    if (!nearest || feet < nearest.feet) nearest = { feet, status: text(h.attributes.Status), owner: text(h.attributes.OWNED_BY), address: text(h.attributes.Address) };
  }
  // Lot lines that run along this parcel's own boundary (a line shared with a neighbour is listed too).
  const seen = new Set<string>(), found: PalmBayLotLine[] = [];
  for (const l of lines) {
    const path = l.geometry?.paths?.[0]; if (!path || path.length < 2) continue;
    const mid = path[Math.floor(path.length / 2)] as Position;
    if (!ring.some(r => distanceToRing(path[0] as Position, r) < 8 && distanceToRing(path[path.length - 1] as Position, r) < 8 && distanceToRing(mid, r) < 8)) continue;
    const feet = Number(l.attributes.LOT_Footage) || 0; if (!feet) continue;
    const key = `${feet}|${l.attributes.WaterCost}|${l.attributes.SewerCost}`; if (seen.has(key)) continue; seen.add(key);
    found.push({ feet, water: Number(l.attributes.WaterCost) || null, sewer: Number(l.attributes.SewerCost) || null, note: text(l.attributes.Exception) });
  }
  return {
    area: text(a?.TOWNSHIP) || null,
    water: a ? YES[text(a.WATER)] || text(a.WATER) || null : null, sewer: a ? YES[text(a.SEWER)] || text(a.SEWER) || null : null,
    reclaimed: a ? YES[text(a.Reclaim)] || text(a.Reclaim) || null : null, availNote: text(a?.Comments) || null,
    unit: u ? { name: text(u.Sub_Name), description: text(u.Description), water: text(u.Water_Type) || null, sewer: text(u.Sewer_Type) || null, reclaimed: text(u.Reclaim_Type) || null, gated: text(u.Gated) || null } : null,
    hydrant: nearest,
    trash: t ? { trash: text(t.Trash), recycle: text(t.Recycle), yard: text(t.YardTrash), bulk: text(t.Bulk_) } : null,
    lines: found.sort((x, y) => y.feet - x.feet),
  };
}
