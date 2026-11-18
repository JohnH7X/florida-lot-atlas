import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestPoint, safe, text } from './utilGeo';

/**
 * Port St. Lucie / St. Lucie County, FL. Neither the city nor the county publishes water or sewer pipe maps, so this uses what St. Lucie County GIS
 * does publish: the utility operational areas (which utility serves where), fire hydrants, and proposed county pipelines.
 */
const U = 'https://slcgis.stlucieco.gov/hosting/rest/services/UtilityServices';
const MUNI = 'https://slcgis.stlucieco.gov/hosting/rest/services/Municipal/MunicipalBoundaries/MapServer/0';
export const PSL_BOUNDS: [number, number, number, number] = [-80.7, 27.0, -80.1, 27.6];
export interface PslLayer { id: string; label: string; service: string; layer: number; color: string; on: boolean; opacity: number }
export const PSL_LAYERS: PslLayer[] = [
  { id: 'areas', label: 'Utility operational areas', service: 'UtilitiesOperationalAreas', layer: 0, color: '#7fb3e6', on: true, opacity: 0.4 },
  { id: 'hydrants', label: 'Fire hydrants', service: 'FireHydrants', layer: 0, color: '#d62828', on: true, opacity: 0.95 },
  { id: 'proposed', label: 'Proposed county pipelines', service: 'ProposedPipelines', layer: 0, color: '#8e44ad', on: false, opacity: 0.9 },
];
export const pslTiles = (l: PslLayer) =>
  `${U}/${l.service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${l.layer}&f=image`;

export interface PortStLucieUtilities { city: string | null; areas: string[]; hydrant: { feet: number; id: string; owner: string } | null }

/** St. Lucie County utility facts for a parcel, or null when it is outside St. Lucie County. */
export async function portStLucieUtilitiesAt(lot: LotFeature): Promise<PortStLucieUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, PSL_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const [city, areas, hyd] = await Promise.all([
    safe(esriQuery(MUNI, pt, 'esriGeometryPoint', 'City').then(r => text(r[0]?.attributes.City) || null), null),
    safe(esriQuery(`${U}/UtilitiesOperationalAreas/MapServer/0`, pt, 'esriGeometryPoint', 'AREANAME').then(r => r.map(h => text(h.attributes.AREANAME)).filter(Boolean)), [] as string[]),
    safe(esriQuery(`${U}/FireHydrants/MapServer/0`, env, 'esriGeometryEnvelope', 'HydrantID,AdministrativeArea,ENABLED', true), []),
  ]);
  const h = nearestPoint(hyd, rs, 'HydrantID', a => a.ENABLED === 0);
  const owner = h ? text(hyd.find(x => text(x.attributes.HydrantID) === h.id)?.attributes.AdministrativeArea) : '';
  if (!city && !areas.length && !h) return null;
  return { city, areas, hydrant: h ? { ...h, owner } : null };
}
