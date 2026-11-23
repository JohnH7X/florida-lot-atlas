import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestPoint, safe, text } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * Lake County, FL (Clermont, Groveland, Leesburg, Eustis, Mount Dora). No water or sewer pipe maps are public. Public: Lake County GIS's water service
 * areas (city and private utilities), the county's fire hydrants (with the owning utility), and the EPA community water system areas.
 * Leesburg's own service-area server does not allow browser access and its pipe maps are login-protected, so they are not used.
 */
const GIS = 'https://gis.lakecountyfl.gov/lakegis/rest/services';
export const LK_WS = `${GIS}/LocalGov/PublicServices/MapServer/11`;
const HYD = `${GIS}/OpenData/OpenData2/MapServer/10`;
export const LK_BOUNDS: [number, number, number, number] = [-82.05, 28.3, -81.3, 29.05];
export interface LakeUtilities { water: { name: string; agency: string; phone: string }[]; epa: EpaWater | null; hydrant: { feet: number; id: string; owner: string } | null }
/** Lake County utility facts for a parcel, or null when it is outside the county. */
export async function lakeUtilitiesAt(lot: LotFeature): Promise<LakeUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, LK_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] };
  const [ws, epa, hyd] = await Promise.all([
    safe(esriQuery(LK_WS, pt, 'esriGeometryPoint', 'DISTRICTID,NAME,AGENCY,PHONE'), []),
    safe(epaWaterAt(c), null),
    safe(esriQuery(HYD, envAround(c), 'esriGeometryEnvelope', 'HydrantID,UtilityOwner', true), []),
  ]);
  const seen = new Set<string>();
  const water = ws.map(h => ({ name: text(h.attributes.NAME) || text(h.attributes.DISTRICTID), agency: text(h.attributes.AGENCY), phone: text(h.attributes.PHONE) }))
    .filter(w => { const k = `${w.name}|${w.agency}`; if (seen.has(k)) return false; seen.add(k); return !!w.name; });
  const h = nearestPoint(hyd, lotRings(lot), 'HydrantID');
  const owner = h ? text(hyd.find(x => text(x.attributes.HydrantID) === h.id)?.attributes.UtilityOwner) : '';
  if (!water.length && !epa && !h) return null;
  return { water, epa, hydrant: h ? { ...h, owner } : null };
}
