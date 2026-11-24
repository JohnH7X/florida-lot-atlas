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
/** Toho Water Authority's Poinciana line-extension program (public view published by its consultant, Stantec): projects and the parcels each one serves. */
const POIN = 'https://services.arcgis.com/DN2fPfpggEPlLhP6/ArcGIS/rest/services/PoincianaLineExtension_Public_View_2/FeatureServer';
export const POIN_PROJECTS = `${POIN}/68`;
const POIN_PARCELS = `${POIN}/69`;
export const POIN_BOUNDS: [number, number, number, number] = [-81.6, 28.02, -81.4, 28.2];
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
  /** Hydrant from Polk County GIS's utilities map near the lot centre. Polk's server answers location queries but returns no coordinates, so this is a distance band (about 250 or 500 ft), not an exact distance. */
  polkHydrant: { within: 250 | 500 } | null;
  /** Toho Poinciana line-extension parcel record and its project. */
  lineExt: { assigned: boolean; project: string; status: string; ciac: string; metersReleased: boolean } | null;
}
const nameOf = (a: Record<string, unknown>) => text(a.Name) || text(a.NAME) || text(a.WRF) || text(a.WRF_Name) || text(a.Plant_Name) || text(Object.values(a).find(v => typeof v === 'string' && v.trim() && !/^\{/.test(v as string)));
/** Polk / Osceola utility facts for a parcel, or null when it is outside the area. */
export async function polkOsceolaUtilitiesAt(lot: LotFeature): Promise<PolkOsceolaUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, PO_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const p = (url: string, f: string) => safe(esriQuery(url, pt, 'esriGeometryPoint', f), [] as Hit[]);
  const dav = inBounds(c, DAV_BOUNDS), poin = inBounds(c, POIN_BOUNDS);
  const [svc, dist, wrf, rec, pw, ps, th, dg, df, dc, dsp, ph, lp, lj] = await Promise.all([
    p(`${TOHO}/12`, 'DESCRIPT'), p(`${TOHO}/14`, 'OPERDIST'), p(`${TOHO}/10`, '*'), p(`${TOHO}/9`, '*'), p(`${PCU}/3`, 'SERVICEAREA,SYSTEMNAME'), p(`${PCU}/2`, 'SERVICEAREA,SYSTEMNAME'),
    safe(esriQuery(TOHO_HYD, env, 'esriGeometryEnvelope', 'CLOSEST_PARCEL_ADDRESS,ASSET_STATUS', true), [] as Hit[]),
    dav ? safe(esriQuery(DAV_GRAV, env, 'esriGeometryEnvelope', 'DIAMETER', true), [] as Hit[]) : Promise.resolve([] as Hit[]),
    dav ? safe(esriQuery(DAV_FORCE, env, 'esriGeometryEnvelope', 'Diameter', true), [] as Hit[]) : Promise.resolve([] as Hit[]),
    dav ? p(`${DAV}/Davenport_Central_Septic_and_Sewer_Service_Areas/FeatureServer/22`, 'OBJECTID') : Promise.resolve([] as Hit[]),
    dav ? p(`${DAV}/Davenport_Central_Septic_and_Sewer_Service_Areas/FeatureServer/21`, 'OBJECTID') : Promise.resolve([] as Hit[]),
    safe(esriQuery(`${PCU}/1`, envAround(c, 250), 'esriGeometryEnvelope', 'OBJECTID').then(r => r.length ? 250 as const : safe(esriQuery(`${PCU}/1`, env, 'esriGeometryEnvelope', 'OBJECTID').then(r2 => r2.length ? 500 as const : null), null)), null),
    poin ? p(POIN_PARCELS, 'AssignedProject,RelatedProject,Status,CIACFeeService,ReleasedMeters') : Promise.resolve([] as Hit[]),
    poin ? p(POIN_PROJECTS, 'Project_No,PublicStatus,ProjectStatus') : Promise.resolve([] as Hit[]),
  ]);
  const plant = wrf[0]?.attributes;
  const toho = svc.length || dist.length || wrf.length ? { service: text(svc[0]?.attributes.DESCRIPT), district: text(dist[0]?.attributes.OPERDIST), sewerPlant: plant ? [text(plant.FDEP_ID), text(plant.Comments)].filter(Boolean).join(' · ') || 'Toho wastewater collection area' : '', reclaimed: rec[0] ? nameOf(rec[0].attributes) : '' } : null;
  const polk = pw.length || ps.length ? { water: pw[0] ? [text(pw[0].attributes.SYSTEMNAME), text(pw[0].attributes.SERVICEAREA) && `area ${text(pw[0].attributes.SERVICEAREA)}`].filter(Boolean).join(' · ') : '', sewer: ps[0] ? [text(ps[0].attributes.SYSTEMNAME), text(ps[0].attributes.SERVICEAREA) && `area ${text(ps[0].attributes.SERVICEAREA)}`].filter(Boolean).join(' · ') : '' } : null;
  const g = nearestLine(dg, rs, { size: 'DIAMETER', kind: 'gravity' }), f = nearestLine(df, rs, { size: 'Diameter', kind: 'force main' });
  const sewer = g && (!f || g.feet <= f.feet) ? g : f;
  const davenport = dav && (sewer || dc.length || dsp.length) ? { sewer, central: dc.length > 0, septic: dsp.length > 0 } : null;
  const hydrant = nearestPoint(th, rs, 'CLOSEST_PARCEL_ADDRESS', a => text(a.ASSET_STATUS) !== '' && !/active/i.test(text(a.ASSET_STATUS)));
  const polkHydrant = ph ? { within: ph } : null;
  const la = lp[0]?.attributes, lj0 = lj[0]?.attributes;
  const rel = text(la?.RelatedProject);
  const lineExt = la || lj0 ? {
    assigned: text(la?.AssignedProject) === 'Yes', project: text(lj0?.Project_No) || (rel && rel !== '0' ? rel : ''),
    status: text(lj0?.PublicStatus) || text(lj0?.ProjectStatus) || text(la?.Status),
    ciac: text(la?.CIACFeeService), metersReleased: text(la?.ReleasedMeters) === 'Yes',
  } : null;
  if (!toho && !polk && !davenport && !hydrant && !polkHydrant && !lineExt) return null;
  return { toho, polk, davenport, hydrant, polkHydrant, lineExt };
}
