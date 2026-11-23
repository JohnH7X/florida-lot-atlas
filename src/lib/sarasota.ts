import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Hit, type Line } from './utilGeo';

/**
 * Sarasota County, FL outside North Port (Venice, Englewood, South Gate, Sarasota, Osprey): Sarasota County Utilities' water and sewer network (public Utility
 * Network layers), the utility franchise areas, the City of Venice's own water/sewer maps, the City of Sarasota's sewer, hydrants, and Englewood Water District's parcel flags.
 */
const NET = 'https://services3.arcgis.com/icrWMv7eBkctFu1f/arcgis/rest/services';
export const SR_FRANCHISE = 'https://ags3.scgov.net/server/rest/services/Hosted/UtilityFranchiseArea/FeatureServer/0';
export const SCU_WATER = `${NET}/WaterDistributionLineCollection/FeatureServer/510022`;
export const SCU_GRAV = `${NET}/SewerNetworkLineCollection/FeatureServer/315001`;
export const SCU_FORCE = `${NET}/SewerNetworkLineCollection/FeatureServer/315002`;
const SCU_HYD = `${NET}/WaterDistributionDeviceCollection/FeatureServer/501007`;
export const VENICE = 'https://gis.venicefl.gov/server/rest/services/util';
const CITY_S = 'https://services3.arcgis.com/AWDwYUpli8WqpWxQ/arcgis/rest/services';
const EWD = 'https://services6.arcgis.com/PyQXVJ3wiDmV8alx/arcgis/rest/services/Englewood_Water_District_Public_Web_Data/FeatureServer/4';
export const SR_BOUNDS: [number, number, number, number] = [-82.75, 26.9, -82.05, 27.5];
export interface SarasotaUtilities {
  franchise: { name: string; water: string; sanitary: string; reuse: string; phone: string } | null;
  waterMain: Line | null; sewerMain: Line | null; hydrant: { feet: number; id: string; owner: string } | null;
  ewd: { water: string; sewer: string; phase: string } | null;
}
const inService = (a: Record<string, unknown>) => a.lifecyclestatus != null && Number(a.lifecyclestatus) !== 8;
const best = (list: (Line | null)[]) => list.filter((l): l is Line => !!l).sort((a, b) => a.feet - b.feet)[0] || null;
const tag = (l: Line | null, kind: string): Line | null => (l ? { ...l, kind } : null);

/** Sarasota County utility facts for a parcel, or null when it is outside the area. */
export async function sarasotaUtilitiesAt(lot: LotFeature): Promise<SarasotaUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, SR_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const frH = await safe(esriQuery(SR_FRANCHISE, pt, 'esriGeometryPoint', 'fran_name,water,sanitary,reuse,phone'), []);
  const a = frH[0]?.attributes;
  const franchise = a ? { name: text(a.fran_name), water: text(a.water), sanitary: text(a.sanitary), reuse: text(a.reuse), phone: text(a.phone) } : null;
  const fn = (franchise?.name || '').toUpperCase();
  const venice = fn.includes('VENICE'), city = fn.includes('CITY OF SARASOTA'), ewd = fn.includes('ENGLEWOOD');
  const q = (url: string, fields: string) => safe(esriQuery(url, env, 'esriGeometryEnvelope', fields, true), [] as Hit[]);
  const [sw, sg, sf, sh, vw, vg, vf, vh, cg, cp, ch, ewdH] = await Promise.all([
    q(SCU_WATER, 'diameter,lifecyclestatus'), q(SCU_GRAV, 'diameter,lifecyclestatus'), q(SCU_FORCE, 'diameter,lifecyclestatus'), q(SCU_HYD, 'assetid,lifecyclestatus'),
    venice ? q(`${VENICE}/PotableWater/MapServer/6`, 'PipeDiameter,WaterType') : Promise.resolve([] as Hit[]),
    venice ? q(`${VENICE}/Sanitary_Sewer/MapServer/10`, 'PipeDiameter') : Promise.resolve([] as Hit[]),
    venice ? q(`${VENICE}/Sanitary_Sewer/MapServer/12`, 'PipeDiameter') : Promise.resolve([] as Hit[]),
    venice ? q(`${VENICE}/PotableWater/MapServer/4`, 'FacilityID') : Promise.resolve([] as Hit[]),
    city ? q(`${CITY_S}/Sanitary_Public/FeatureServer/47`, 'DIAMETER') : Promise.resolve([] as Hit[]),
    city ? q(`${CITY_S}/Sanitary_Public/FeatureServer/48`, 'DIAMETER') : Promise.resolve([] as Hit[]),
    city ? q(`${CITY_S}/wFireHydrants/FeatureServer/0`, 'FACILITY_ID') : Promise.resolve([] as Hit[]),
    ewd ? safe(esriQuery(EWD, pt, 'esriGeometryPoint', 'aWater,aWaste,WWPhase'), [] as Hit[]) : Promise.resolve([] as Hit[]),
  ]);
  const scu = (kind: string) => ({ size: 'diameter', kind, skip: inService });
  const waterMain = best([tag(nearestLine(sw, rs, scu('Sarasota County Utilities')), 'Sarasota County Utilities'), tag(nearestLine(vw.filter(h => !text(h.attributes.WaterType) || text(h.attributes.WaterType) === 'POT'), rs, { size: 'PipeDiameter' }), 'City of Venice')]);
  const sewerMain = best([tag(nearestLine(sg, rs, scu('')), 'Sarasota County Utilities · gravity'), tag(nearestLine(sf, rs, scu('')), 'Sarasota County Utilities · force main'),
    tag(nearestLine(vg, rs, { size: 'PipeDiameter' }), 'City of Venice · gravity'), tag(nearestLine(vf, rs, { size: 'PipeDiameter' }), 'City of Venice · force main'),
    tag(nearestLine(cg, rs, { size: 'DIAMETER' }), 'City of Sarasota · gravity'), tag(nearestLine(cp, rs, { size: 'DIAMETER' }), 'City of Sarasota · force main')]);
  const hs = [
    { p: nearestPoint(sh, rs, 'assetid', inService), o: 'Sarasota County Utilities' }, { p: nearestPoint(vh, rs, 'FacilityID'), o: 'City of Venice' }, { p: nearestPoint(ch, rs, 'FACILITY_ID'), o: 'City of Sarasota' },
  ].filter(x => x.p).sort((x, y) => x.p!.feet - y.p!.feet)[0];
  const e = ewdH[0]?.attributes;
  if (!franchise && !waterMain && !sewerMain && !hs && !e) return null;
  return { franchise, waterMain, sewerMain, hydrant: hs ? { ...hs.p!, owner: hs.o } : null, ewd: e ? { water: text(e.aWater), sewer: text(e.aWaste), phase: text(e.WWPhase) } : null };
}
