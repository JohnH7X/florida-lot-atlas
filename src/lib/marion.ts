import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestPoint, safe, text } from './utilGeo';

/**
 * Marion County, FL (Ocala, Marion Oaks, Silver Springs Shores): which utility serves each area, and whether the county's data says it has water
 * and sewer there, from Marion County GIS's hosted Utility Service Areas layer. The county's pipe maps are not available to this atlas.
 */
export const MN_URL = 'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services/Utility_Service_Areas/FeatureServer/0';
const MC = 'https://services1.arcgis.com/oMGpBoZpy1Db2sAl/arcgis/rest/services';
/** Marion County GIS: a single polygon covering everything within 500 ft of mapped water utility infrastructure. */
export const MN_BUFFER = `${MC}/Utility_Infrastructure_Buffer_500_ft/FeatureServer/0`;
/** Ocala Fire Rescue hydrants (City of Ocala area). */
const MN_HYD = `${MC}/OFR_Hydrants/FeatureServer/0`;
export const MN_BOUNDS: [number, number, number, number] = [-82.95, 28.8, -81.6, 29.55];
export const MN_COLORS: Record<string, string> = { both: '#00a884', water: '#0070ff', sewer: '#734c00', other: '#9aa39a' };
export const MN_LEGEND = [{ color: MN_COLORS.both, label: 'Water and sewer' }, { color: MN_COLORS.water, label: 'Water only' }, { color: MN_COLORS.sewer, label: 'Sewer only' }, { color: MN_COLORS.other, label: 'No data / neither' }];
export const mnCategory = (p: Record<string, unknown>) => { const w = text(p.WATER) === 'Yes', s = text(p.SEWER) === 'Yes'; return w && s ? 'both' : w ? 'water' : s ? 'sewer' : 'other'; };

export interface MarionArea { utility: string; area: string; water: string; sewer: string; electric: string }
export interface MarionUtilities {
  areas: MarionArea[];
  /** Inside Marion County's 500-ft buffer around water utility infrastructure (the buffer only covers the area it was drawn for: central Marion). */
  nearWater: boolean;
  hydrant: { feet: number; address: string } | null;
}

/** Marion County utility areas that cover a parcel, or null when none does. */
export async function marionUtilitiesAt(lot: LotFeature): Promise<MarionUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, MN_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, rs = lotRings(lot);
  const [hits, buf, hyd] = await Promise.all([
    safe(esriQuery(MN_URL, pt, 'esriGeometryPoint', 'NAME,SERVICEAREA,WATER,SEWER,ELECTRICITY'), []),
    safe(esriQuery(MN_BUFFER, pt, 'esriGeometryPoint', 'OBJECTID'), []),
    safe(esriQuery(MN_HYD, envAround(c, 600), 'esriGeometryEnvelope', 'objectid,ADDRESS,ASSETSTAT', true), []),
  ]);
  const areas = hits.map(h => ({ utility: text(h.attributes.NAME), area: text(h.attributes.SERVICEAREA), water: text(h.attributes.WATER), sewer: text(h.attributes.SEWER), electric: text(h.attributes.ELECTRICITY) })).filter(a => a.utility);
  const seen = new Set<string>();
  const uniq = areas.filter(a => { const k = `${a.utility}|${a.area}|${a.water}|${a.sewer}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const h = nearestPoint(hyd, rs, 'objectid', a => /^(Removed|AOS|UC)$/i.test(text(a.ASSETSTAT)));
  const ha = h ? hyd.find(x => text(x.attributes.objectid) === h.id)?.attributes : undefined;
  const hydrant = h && h.feet <= 500 ? { feet: h.feet, address: text(ha?.ADDRESS) } : null;
  const nearWater = buf.length > 0;
  return uniq.length || nearWater || hydrant ? { areas: uniq, nearWater, hydrant } : null;
}
