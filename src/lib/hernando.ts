import { lotCenter, type LotFeature } from './lots';
import { esriQuery, inBounds, safe, text } from './utilGeo';

/**
 * Hernando County, FL (Spring Hill, Brooksville): the county's utility service areas (water and sewer, water only, sewer only), the City of
 * Brooksville's first right to serve, and the electric provider, from the Hernando County Property Appraiser's hosted Utilities layers.
 * The county's own GIS servers (pipe maps) did not respond when tested, so no mains or hydrants are shown.
 */
export const HN_URL = 'https://services2.arcgis.com/x5zvhhxfUuRDntRe/arcgis/rest/services/Utilities/FeatureServer';
export const HN_BOUNDS: [number, number, number, number] = [-82.85, 28.3, -82.2, 28.8];
export const HN_AREAS = `${HN_URL}/1`;
export const HN_COLORS: Record<string, string> = { both: '#00a884', water: '#0070ff', sewer: '#734c00', other: '#9aa39a' };
export const HN_LEGEND = [{ color: HN_COLORS.both, label: 'Water and sewer' }, { color: HN_COLORS.water, label: 'Water service only' }, { color: HN_COLORS.sewer, label: 'Sewer service only' }];
export const hnCategory = (p: Record<string, unknown>) => ({ 1: 'both', 2: 'water', 3: 'sewer' } as Record<number, string>)[Number(p.SUBTYPE)] || 'other';
const SUB: Record<number, string> = { 1: 'Water and sewer service', 2: 'Water service only (no county sewer)', 3: 'Sewer service only' };

export interface HernandoUtilities { service: string | null; brooksville: boolean; electric: string }

/** Hernando County utility facts for a parcel, or null when it is outside the county. */
export async function hernandoUtilitiesAt(lot: LotFeature): Promise<HernandoUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, HN_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] };
  const [svc, cob, el] = await Promise.all([
    safe(esriQuery(`${HN_URL}/1`, pt, 'esriGeometryPoint', 'SUBTYPE'), []),
    safe(esriQuery(`${HN_URL}/6`, pt, 'esriGeometryPoint', 'OBJECTID').then(r => r.length > 0), false),
    safe(esriQuery(`${HN_URL}/3`, pt, 'esriGeometryPoint', 'NAME'), []),
  ]);
  const sub = svc.map(h => Number(h.attributes.SUBTYPE)).find(n => SUB[n]);
  const electric = text(el[0]?.attributes.NAME);
  if (sub == null && !cob && !electric) return null;
  return { service: sub != null ? SUB[sub] : null, brooksville: cob, electric };
}
