import { lotCenter, type LotFeature } from './lots';
import { esriQuery, inBounds, safe, text } from './utilGeo';

/**
 * Marion County, FL (Ocala, Marion Oaks, Silver Springs Shores): which utility serves each area, and whether the county's data says it has water
 * and sewer there, from Marion County GIS's hosted Utility Service Areas layer. The county's pipe maps are not available to this atlas.
 */
export const MN_URL = 'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services/Utility_Service_Areas/FeatureServer/0';
export const MN_BOUNDS: [number, number, number, number] = [-82.95, 28.8, -81.6, 29.55];
export const MN_COLORS: Record<string, string> = { both: '#00a884', water: '#0070ff', sewer: '#734c00', other: '#9aa39a' };
export const MN_LEGEND = [{ color: MN_COLORS.both, label: 'Water and sewer' }, { color: MN_COLORS.water, label: 'Water only' }, { color: MN_COLORS.sewer, label: 'Sewer only' }, { color: MN_COLORS.other, label: 'No data / neither' }];
export const mnCategory = (p: Record<string, unknown>) => { const w = text(p.WATER) === 'Yes', s = text(p.SEWER) === 'Yes'; return w && s ? 'both' : w ? 'water' : s ? 'sewer' : 'other'; };

export interface MarionArea { utility: string; area: string; water: string; sewer: string; electric: string }
export interface MarionUtilities { areas: MarionArea[] }

/** Marion County utility areas that cover a parcel, or null when none does. */
export async function marionUtilitiesAt(lot: LotFeature): Promise<MarionUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, MN_BOUNDS)) return null;
  const hits = await safe(esriQuery(MN_URL, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'NAME,SERVICEAREA,WATER,SEWER,ELECTRICITY'), []);
  const areas = hits.map(h => ({ utility: text(h.attributes.NAME), area: text(h.attributes.SERVICEAREA), water: text(h.attributes.WATER), sewer: text(h.attributes.SEWER), electric: text(h.attributes.ELECTRICITY) })).filter(a => a.utility);
  const seen = new Set<string>();
  const uniq = areas.filter(a => { const k = `${a.utility}|${a.area}|${a.water}|${a.sewer}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return uniq.length ? { areas: uniq } : null;
}
