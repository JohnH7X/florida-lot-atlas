import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestPoint, safe, text } from './utilGeo';

/**
 * City of Palm Coast, FL. The city's water and sewer pipe maps are login-protected (its Utilities folders ask for a token), so this uses what
 * gis.palmcoast.gov publishes openly: the city limits and the fire hydrants (active, potable) of the city water system.
 */
const EXT = 'https://gis.palmcoast.gov/hosting/rest/services/External';
const HYD = `${EXT}/Collaboration_EOC_wHydrant1/MapServer/0`;
export const PC_BOUNDS: [number, number, number, number] = [-81.45, 29.35, -81.1, 29.7];
export interface PcLayer { id: string; label: string; color: string; on: boolean }
export const PC_LAYERS: PcLayer[] = [{ id: 'hydrants', label: 'Fire hydrants (active)', color: '#d62828', on: true }];
const DEF = encodeURIComponent(JSON.stringify({ 0: "LIFECYCLESTATUS='Active'" }));
export const pcTiles = () =>
  `${EXT}/Collaboration_EOC_wHydrant1/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:0&layerDefs=${DEF}&f=image`;

export interface PalmCoastUtilities { inCity: boolean; hydrant: { feet: number; id: string; owner: string } | null }

/** Palm Coast facts for a parcel, or null when it is outside the area. */
export async function palmCoastUtilitiesAt(lot: LotFeature): Promise<PalmCoastUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, PC_BOUNDS)) return null;
  const env = envAround(c), rs = lotRings(lot);
  const [inCity, hyd] = await Promise.all([
    safe(esriQuery(`${EXT}/Op_CityLimits/MapServer/0`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'OBJECTID').then(r => r.length > 0), false),
    safe(esriQuery(HYD, env, 'esriGeometryEnvelope', 'LEGACYID,OWNER,LIFECYCLESTATUS,WATERTYPE', true), []),
  ]);
  const ok = (a: Record<string, unknown>) => text(a.LIFECYCLESTATUS) !== 'Active' || (text(a.WATERTYPE) !== '' && text(a.WATERTYPE) !== 'Potable');
  const h = nearestPoint(hyd, rs, 'LEGACYID', ok);
  const owner = h ? text(hyd.find(x => text(x.attributes.LEGACYID) === h.id)?.attributes.OWNER) : '';
  if (!inCity && !h) return null;
  return { inCity, hydrant: h ? { ...h, owner } : null };
}
