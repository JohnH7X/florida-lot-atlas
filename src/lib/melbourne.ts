import { lotCenter, type LotFeature } from './lots';

/** City of Melbourne, FL: water and sewer service areas (Brevard County GIS) and the city's solid waste zones and boundary (City of Melbourne GIS). */
const BREVARD = 'https://gis.brevardfl.gov/gissrv/rest/services/Utility_Services/Other_Service_Area_WKID2881/MapServer';
const CITY = 'https://maps.mlbfl.org/services/rest/services/AGOL';
export const MELBOURNE_BOUNDS: [number, number, number, number] = [-80.95, 27.85, -80.4, 28.35];
export interface MelbourneLayer { id: string; label: string; layer: number; on: boolean }
export const MELBOURNE_LAYERS: MelbourneLayer[] = [
  { id: 'water', label: 'Melbourne water service area', layer: 5, on: true },
  { id: 'sewer', label: 'Melbourne sewer service area', layer: 4, on: true },
];
export const melbourneTiles = (layer: number) =>
  `${BREVARD}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${layer}&f=image`;

export interface MelbourneUtilities {
  inCity: boolean; waterArea: boolean; sewerArea: boolean;
  waste: { zone: string; trash: string; recycle: string; yard: string; bulk: string } | null;
}
interface Hit { attributes: Record<string, unknown> }
async function query(url: string, pt: { x: number; y: number }, outFields: string): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...pt, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json' });
  const j = await (await fetch(`${url}/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());

/** Melbourne utility facts for a parcel, or null when it is outside Melbourne's service areas and city limits. */
export async function melbourneUtilitiesAt(lot: LotFeature): Promise<MelbourneUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < MELBOURNE_BOUNDS[0] || c[0] > MELBOURNE_BOUNDS[2] || c[1] < MELBOURNE_BOUNDS[1] || c[1] > MELBOURNE_BOUNDS[3]) return null;
  const pt = { x: c[0], y: c[1] };
  const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch { return d; } };
  const [city, water, sewer, waste] = await Promise.all([
    safe(query(`${CITY}/CityCouncil/MapServer/2`, pt, 'NAME'), [] as Hit[]),
    safe(query(`${BREVARD}/5`, pt, 'OBJECTID'), [] as Hit[]),
    safe(query(`${BREVARD}/4`, pt, 'OBJECTID'), [] as Hit[]),
    safe(query(`${CITY}/SolidWasteServices/MapServer/0`, pt, 'ZONE,PICKUP_DAY,RECYCLE_DAY,YARDWASTE_DAY,BULKPICKUP_DAY'), [] as Hit[]),
  ]);
  const w = waste[0]?.attributes, inZone = w && text(w.ZONE) !== '0' && !/^outside/i.test(text(w.PICKUP_DAY));
  const out: MelbourneUtilities = {
    inCity: city.length > 0, waterArea: water.length > 0, sewerArea: sewer.length > 0,
    waste: inZone ? { zone: text(w!.ZONE), trash: text(w!.PICKUP_DAY), recycle: text(w!.RECYCLE_DAY), yard: text(w!.YARDWASTE_DAY), bulk: text(w!.BULKPICKUP_DAY) } : null,
  };
  return out.inCity || out.waterArea || out.sewerArea || out.waste ? out : null;
}
