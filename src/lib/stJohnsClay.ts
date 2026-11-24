import { FL_COUNTIES, lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Hit, type Line } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * St. Johns County (St. Augustine, Ponte Vedra, World Golf Village, Hastings) and Clay County (Orange Park, Middleburg, Green Cove Springs), FL.
 * St. Johns County GIS publishes the utility zones (which water/wastewater utility serves where, with phone numbers) and fire hydrants. The City of
 * St. Augustine publishes its utility service area, gravity and force sewer mains and hydrants. St. Johns County Utility Department's own pipe network
 * and Clay County Utility Authority's maps are not public, so Clay gets only the EPA water system areas.
 */
const SJC = 'https://www.gis.sjcfl.us/portal_sjcgis/rest/services';
export const SJC_ZONES = `${SJC}/Utility_Zones/MapServer/1`;
const SJC_HYD = `${SJC}/Fire_Hydrants/MapServer/0`;
const STA = 'https://services.arcgis.com/2HXAtOKdBRSMj8is/arcgis/rest/services';
export const STA_AREA = `${STA}/Infrastructure_Service_Areas/FeatureServer/0`;
export const STA_GRAV = `${STA}/Buffered_Gravity_Sewer_Main_WFL1/FeatureServer/1`;
export const STA_FORCE = `${STA}/Buffered_Force_Sewer_Main_WFL1/FeatureServer/6`;
const STA_HYD = `${STA}/ISO_Hydrants_2023_WFL1/FeatureServer/2`;

type Box = [number, number, number, number];
export const SJ_BOUNDS: Box = [-81.69, 29.62, -81.2, 30.26];
export const CLAY_BOUNDS: Box = [-82.05, 29.82, -81.6, 30.2];
export const STA_BOUNDS: Box = [-81.4, 29.82, -81.25, 29.97];

/** County name from the parcel's Florida DOR county number (CO_NO 11–77), or null. */
export const countyOf = (lot: LotFeature): string | null => { const co = Number((lot.properties as Record<string, unknown> | null)?.CO_NO); return co >= 11 && co <= 77 ? FL_COUNTIES[co - 11] : null; };

export interface StJohnsClayUtilities {
  county: 'stjohns' | 'clay';
  epa: EpaWater | null;
  zone: { name: string; phone: string } | null;
  staugustine: { inArea: boolean; sewerMain: Line | null } | null;
  hydrant: { feet: number; owner: string } | null;
}

/** St. Johns / Clay utility facts for a parcel, or null elsewhere. */
export async function stJohnsClayUtilitiesAt(lot: LotFeature): Promise<StJohnsClayUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  // The parcel's own county number (Florida DOR roll) decides; the bounding boxes only skip far-away lots quickly.
  const co = countyOf(lot);
  const county = co ? (co === 'St. Johns' && inBounds(c, SJ_BOUNDS) ? 'stjohns' : co === 'Clay' && inBounds(c, CLAY_BOUNDS) ? 'clay' : null)
    : c[0] > -81.6 && inBounds(c, SJ_BOUNDS) ? 'stjohns' : inBounds(c, CLAY_BOUNDS) ? 'clay' : null;
  if (!county) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const none = Promise.resolve([] as Hit[]);
  const sj = county === 'stjohns', sta = sj && inBounds(c, STA_BOUNDS);
  const [epa, zn, hy, sa, sg, sf, sh] = await Promise.all([
    safe(epaWaterAt(c), null),
    sj ? safe(esriQuery(SJC_ZONES, pt, 'esriGeometryPoint', 'NAME,Phone'), [] as Hit[]) : none,
    sj ? safe(esriQuery(SJC_HYD, env, 'esriGeometryEnvelope', 'HYDR_ID', true), [] as Hit[]) : none,
    sta ? safe(esriQuery(STA_AREA, pt, 'esriGeometryPoint', 'NAME'), [] as Hit[]) : none,
    sta ? safe(esriQuery(STA_GRAV, env, 'esriGeometryEnvelope', 'DIAMETER,MATERIAL,ENABLED', true), [] as Hit[]) : none,
    sta ? safe(esriQuery(STA_FORCE, env, 'esriGeometryEnvelope', 'DIAMETER,MATERIAL,ENABLED', true), [] as Hit[]) : none,
    sta ? safe(esriQuery(STA_HYD, env, 'esriGeometryEnvelope', 'FACILITYID', true), [] as Hit[]) : none,
  ]);
  if (county === 'clay') return { county, epa, zone: null, staugustine: null, hydrant: null };
  const z = zn[0]?.attributes;
  const zone = z ? { name: text(z.NAME), phone: text(z.Phone) } : null;
  const off = (a: Record<string, unknown>) => a.ENABLED === 0;
  const g = nearestLine(sg, rs, { size: 'DIAMETER', material: 'MATERIAL', kind: 'gravity', skip: off }), f = nearestLine(sf, rs, { size: 'DIAMETER', material: 'MATERIAL', kind: 'force main', skip: off });
  const sm = g && (!f || g.feet <= f.feet) ? g : f;
  const staugustine = sta && (sa.length || sm) ? { inArea: sa.length > 0, sewerMain: sm && sm.feet <= 500 ? sm : null } : null;
  const hc = nearestPoint(hy, rs, 'HYDR_ID'), hs = nearestPoint(sh, rs, 'FACILITYID');
  const h = [hc && { ...hc, owner: '' }, hs && { ...hs, owner: 'City of St. Augustine' }].filter((x): x is { feet: number; id: string; owner: string } => !!x).sort((a, b) => a.feet - b.feet)[0];
  return { county, epa, zone, staugustine, hydrant: h && h.feet <= 500 ? { feet: h.feet, owner: h.owner } : null };
}
