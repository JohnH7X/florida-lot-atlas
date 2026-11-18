import type { Position } from 'geojson';
import { lotCenter, type LotFeature } from './lots';

/** City of Rockledge, FL (cityofrockledge.maps.arcgis.com): city boundary and residential pickup schedule by address. */
const ROCKLEDGE = 'https://services8.arcgis.com/DiqQTpGSIFghI3eM/arcgis/rest/services';
export interface RockledgeUtilities {
  inCity: boolean;
  schedule: { address: string; trash: string; recycle: string; yard: string } | null;
}
interface Hit { attributes: Record<string, unknown> }
async function query(url: string, geometry: object, geometryType: string, outFields: string): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json' });
  const j = await (await fetch(`${url}/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const rings = (lot: LotFeature): Position[][] => { const g = lot.geometry; if (!g) return []; return g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map(p => p[0]) : []; };

/** Rockledge facts for a parcel, or null when it is outside the City of Rockledge. */
export async function rockledgeUtilitiesAt(lot: LotFeature): Promise<RockledgeUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < -80.82 || c[0] > -80.65 || c[1] < 28.27 || c[1] > 28.42) return null;
  const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch { return d; } };
  const rs = rings(lot);
  const [city, sched] = await Promise.all([
    safe(query(`${ROCKLEDGE}/Rockledge_Base_Data_View/FeatureServer/5`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'CITY_NAME'), [] as Hit[]),
    // The schedule is kept per address point, so ask for the address points that sit inside this parcel.
    rs.length ? safe(query(`${ROCKLEDGE}/Residential_Pickup_Schedule_Public/FeatureServer/2`, { rings: rs }, 'esriGeometryPolygon', 'FULLADDRES,YARD_TRASH,RECYCLE,SOLID_WAST'), [] as Hit[]) : Promise.resolve([] as Hit[]),
  ]);
  const withDays = sched.find(h => text(h.attributes.SOLID_WAST) || text(h.attributes.RECYCLE) || text(h.attributes.YARD_TRASH));
  const a = withDays?.attributes;
  if (!city.length && !a) return null;
  return { inCity: city.length > 0, schedule: a ? { address: text(a.FULLADDRES), trash: text(a.SOLID_WAST), recycle: text(a.RECYCLE), yard: text(a.YARD_TRASH) } : null };
}
