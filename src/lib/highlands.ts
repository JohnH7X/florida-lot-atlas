import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestPoint, safe, text } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * Highlands County, FL (Sebring, Lake Placid, Avon Park, Avon Park Lakes, Placid Lakes). Highlands publishes no water or sewer pipe maps and no water
 * service areas. Public: county wastewater service areas, special taxing districts (extra assessments), hydrants (with the utility that owns each), and the EPA water system areas.
 */
const ORG = 'https://services2.arcgis.com/xEhz4K4uxbjGXOPE/arcgis/rest/services';
export const HI_WW = `${ORG}/Wastewater_Service_Area/FeatureServer/1`;
export const HI_TAX = `${ORG}/Special_Taxing_District_(agol)/FeatureServer/1`;
const HYD = `${ORG}/Fire_Hydrants_(agol)/FeatureServer/1`;
export const HI_BOUNDS: [number, number, number, number] = [-81.65, 27.15, -81.05, 27.7];
export interface HighlandsUtilities { sewer: string | null; district: string; epa: EpaWater | null; hydrant: { feet: number; id: string; utility: string } | null }
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Highlands County utility facts for a parcel, or null when it is outside the county. */
export async function highlandsUtilitiesAt(lot: LotFeature): Promise<HighlandsUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, HI_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] };
  const [ww, tax, epa, hyd] = await Promise.all([
    safe(esriQuery(HI_WW, pt, 'esriGeometryPoint', 'Name,OpEntity'), []),
    safe(esriQuery(HI_TAX, pt, 'esriGeometryPoint', 'SPTXDTDSCRP').then(r => tidy(text(r[0]?.attributes.SPTXDTDSCRP))), ''),
    safe(epaWaterAt(c), null),
    safe(esriQuery(HYD, envAround(c), 'esriGeometryEnvelope', 'HyIdent,UtlyName', true), []),
  ]);
  const h = nearestPoint(hyd, lotRings(lot), 'HyIdent');
  const utility = h ? tidy(text(hyd.find(x => text(x.attributes.HyIdent) === h.id)?.attributes.UtlyName)) : '';
  const sewer = ww.length ? (tidy(text(ww[0].attributes.Name)) || tidy(text(ww[0].attributes.OpEntity)) || 'Unnamed sewer service area') : null;
  return { sewer, district: tax, epa, hydrant: h ? { ...h, utility } : null };
}
