import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Hit, type Line } from './utilGeo';

/**
 * Polk and Osceola counties, FL (Poinciana, Haines City, Davenport, Kissimmee). No water or sewer pipe maps are public (Toho Water Authority's and Polk County Utilities'
 * network folders ask for a login). Public: Toho Water Authority's service, sewer-collection, reclaimed and operating-district areas and hydrants; Polk County Utilities'
 * water and wastewater service areas (flags only); and the City of Davenport's sewer mains and septic/central-sewer parcels.
 */
export const TOHO = 'https://gis.tohowater.com/server/rest/services/Energov_EPL/MapServer';
export const PCU = 'https://gis.polkfl.gov/server/rest/services/Map_Utilities_Service_Area/MapServer';
const TOHO_HYD = 'https://services3.arcgis.com/PPOHFcbrL50ceHvX/arcgis/rest/services/Public_Toho_Hydrant_Data_Osceola_County/FeatureServer/0';
const DAV = 'https://services2.arcgis.com/nY5zvXHAje4LAUxE/arcgis/rest/services';
export const DAV_GRAV = `${DAV}/Davenport%20Gravity%20Mains/FeatureServer/0`;
export const DAV_FORCE = `${DAV}/Davenport%20Force%20Mains/FeatureServer/0`;
export const PO_BOUNDS: [number, number, number, number] = [-82.2, 27.55, -80.9, 28.6];
export const DAV_BOUNDS: [number, number, number, number] = [-81.72, 28.1, -81.5, 28.22];
export interface PolkOsceolaUtilities {
  toho: { service: string; district: string; sewerPlant: string; reclaimed: string } | null;
  polk: { water: string; sewer: string } | null;
  davenport: { sewer: Line | null; central: boolean; septic: boolean } | null;
  hydrant: { feet: number; id: string } | null;
}
const nameOf = (a: Record<string, unknown>) => text(a.Name) || text(a.NAME) || text(a.WRF) || text(a.WRF_Name) || text(a.Plant_Name) || text(Object.values(a).find(v => typeof v === 'string' && v.trim() && !/^\{/.test(v as string)));
/** Polk / Osceola utility facts for a parcel, or null when it is outside the area. */
export async function polkOsceolaUtilitiesAt(lot: LotFeature): Promise<PolkOsceolaUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, PO_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const p = (url: string, f: string) => safe(esriQuery(url, pt, 'esriGeometryPoint', f), [] as Hit[]);
  const dav = inBounds(c, DAV_BOUNDS);
  const [svc, dist, wrf, rec, pw, ps, th, dg, df, dc, dsp] = await Promise.all([
    p(`${TOHO}/12`, 'DESCRIPT'), p(`${TOHO}/14`, 'OPERDIST'), p(`${TOHO}/10`, '*'), p(`${TOHO}/9`, '*'), p(`${PCU}/3`, 'SERVICEAREA,SYSTEMNAME'), p(`${PCU}/2`, 'SERVICEAREA,SYSTEMNAME'),
    safe(esriQuery(TOHO_HYD, env, 'esriGeometryEnvelope', 'CLOSEST_PARCEL_ADDRESS,ASSET_STATUS', true), [] as Hit[]),
    dav ? safe(esriQuery(DAV_GRAV, env, 'esriGeometryEnvelope', 'DIAMETER', true), [] as Hit[]) : Promise.resolve([] as Hit[]),
    dav ? safe(esriQuery(DAV_FORCE, env, 'esriGeometryEnvelope', 'Diameter', true), [] as Hit[]) : Promise.resolve([] as Hit[]),
    dav ? p(`${DAV}/Davenport_Central_Septic_and_Sewer_Service_Areas/FeatureServer/22`, 'OBJECTID') : Promise.resolve([] as Hit[]),
    dav ? p(`${DAV}/Davenport_Central_Septic_and_Sewer_Service_Areas/FeatureServer/21`, 'OBJECTID') : Promise.resolve([] as Hit[]),
  ]);
  const plant = wrf[0]?.attributes;
  const toho = svc.length || dist.length || wrf.length ? { service: text(svc[0]?.attributes.DESCRIPT), district: text(dist[0]?.attributes.OPERDIST), sewerPlant: plant ? [text(plant.FDEP_ID), text(plant.Comments)].filter(Boolean).join(' · ') || 'Toho wastewater collection area' : '', reclaimed: rec[0] ? nameOf(rec[0].attributes) : '' } : null;
  const polk = pw.length || ps.length ? { water: pw[0] ? [text(pw[0].attributes.SYSTEMNAME), text(pw[0].attributes.SERVICEAREA) && `area ${text(pw[0].attributes.SERVICEAREA)}`].filter(Boolean).join(' · ') : '', sewer: ps[0] ? [text(ps[0].attributes.SYSTEMNAME), text(ps[0].attributes.SERVICEAREA) && `area ${text(ps[0].attributes.SERVICEAREA)}`].filter(Boolean).join(' · ') : '' } : null;
  const g = nearestLine(dg, rs, { size: 'DIAMETER', kind: 'gravity' }), f = nearestLine(df, rs, { size: 'Diameter', kind: 'force main' });
  const sewer = g && (!f || g.feet <= f.feet) ? g : f;
  const davenport = dav && (sewer || dc.length || dsp.length) ? { sewer, central: dc.length > 0, septic: dsp.length > 0 } : null;
  const hydrant = nearestPoint(th, rs, 'CLOSEST_PARCEL_ADDRESS', a => text(a.ASSET_STATUS) !== '' && !/active/i.test(text(a.ASSET_STATUS)));
  if (!toho && !polk && !davenport && !hydrant) return null;
  return { toho, polk, davenport, hydrant };
}
