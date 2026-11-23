import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * Rural and small-city Florida counties with little or no public utility mapping: Indian River (Sebastian, Vero Beach), Putnam (Palatka, Interlachen),
 * Hendry and Glades (LaBelle, Clewiston), Okeechobee, DeSoto (Arcadia), Levy (Williston, Chiefland) and Sumter (Wildwood, Bushnell, The Villages).
 * What is open: St. Johns River WMD public water supply areas (Putnam, Indian River), Indian River County's septic-to-sewer projects, the City of Vero Beach's
 * sewer-service parcels, water and STEP mains, Putnam's Palatka-area water mains, Hendry County's assessment districts, and the EPA water system areas.
 * The South Florida and Southwest Florida water management districts' servers block or do not answer browser requests, and the county servers for Sumter,
 * Okeechobee, DeSoto, Levy, Hendry and Glades publish no utility layers, so none of those are used.
 */
export const SJ_WATER = 'https://services.arcgis.com/s8wtJX9suxFen6TA/ArcGIS/rest/services/Public_Water_Supply_Area_SJRWMD/FeatureServer/0';
const IRC = 'https://services9.arcgis.com/M0DpVhTwTZ42jNsw/arcgis/rest/services';
export const IR_S2S = `${IRC}/IRC_S2S_DRAFT_20250829_v5_WFL1/FeatureServer/1`;
const IR_ADDR = `${IRC}/IRC_Septic_to_Sewer_Web_Map_WFL1/FeatureServer/0`;
const VERO = 'https://services1.arcgis.com/mK9abRqiJFkUgbPZ/arcgis/rest/services';
export const VB_WATER = `${VERO}/WaterServiceArea/FeatureServer/0`;
const VB_PARCELS = `${VERO}/ParcelsSewerService/FeatureServer/0`;
export const VB_STEP = `${VERO}/STEP_Mains_view/FeatureServer/0`;
export const PU_MAINS = 'https://services1.arcgis.com/YZc1OyqL6jbIOeOv/arcgis/rest/services/WaterMains_AGO/FeatureServer/0';
export const HD_MSBU = 'https://services7.arcgis.com/8l7Qq5t0CPLAJwJK/arcgis/rest/services/Special_Districts_Map/FeatureServer/0';

type Box = [number, number, number, number];
export const RURAL_BOUNDS: Box = [-83.1, 26.3, -80.3, 29.95];
export const IR_BOUNDS: Box = [-80.97, 27.5, -80.36, 27.87];
export const PU_BOUNDS: Box = [-82.0, 29.4, -81.3, 29.95];
export const HG_BOUNDS: Box = [-81.6, 26.3, -80.8, 27.05];
const REGIONS: { id: string; label: string; box: Box }[] = [
  { id: 'ir', label: 'Indian River County', box: IR_BOUNDS },
  { id: 'pu', label: 'Putnam County', box: PU_BOUNDS },
  { id: 'hg', label: 'Hendry and Glades counties', box: HG_BOUNDS },
  { id: 'ok', label: 'Okeechobee County', box: [-81.2, 27.05, -80.5, 27.65] },
  { id: 'ds', label: 'DeSoto County', box: [-82.05, 26.85, -81.6, 27.45] },
  { id: 'lv', label: 'Levy County', box: [-83.1, 28.95, -82.3, 29.6] },
  { id: 'sm', label: 'Sumter County', box: [-82.35, 28.55, -81.95, 29.05] },
];

export interface RuralUtilities {
  region: { id: string; label: string };
  epa: EpaWater | null;
  /** St. Johns River WMD public water supply areas covering the lot (Putnam, Indian River and part of Okeechobee). */
  sjrwmd: { name: string; category: string }[];
  /** Indian River County septic-to-sewer project the lot is in, or a nearby address listed as eligible for the sewer connection program. */
  sewerProject: { name: string; status: string; year: number | null } | null;
  sewerProgram: boolean;
  /** City of Vero Beach / Indian River Shores parcel record. */
  vero: { citySewer: string; stepEligible: boolean; stepInstalled: boolean; city: string } | null;
  veroWater: boolean;
  /** Palatka-area water main near the lot (the only Putnam County water mains that are published). */
  putnamMain: { feet: number; size: number | null; material: string } | null;
  /** Hendry County assessment district (MSBU) the lot is in. */
  msbu: string | null;
}

/** Facts for a parcel in one of these rural counties, or null elsewhere. */
export async function ruralUtilitiesAt(lot: LotFeature): Promise<RuralUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, RURAL_BOUNDS)) return null;
  const region = REGIONS.find(r => inBounds(c, r.box)); if (!region) return null;
  const pt = { x: c[0], y: c[1] }, rs = lotRings(lot), env = envAround(c, 500);
  const ir = region.id === 'ir', pu = region.id === 'pu', hg = region.id === 'hg';
  const [epa, sj, s2s, addr, vp, vw, mains, msbu] = await Promise.all([
    safe(epaWaterAt(c), null),
    safe(esriQuery(SJ_WATER, pt, 'esriGeometryPoint', 'UTILITY,UTIL_CAT'), []),
    ir ? safe(esriQuery(IR_S2S, pt, 'esriGeometryPoint', 'PROJECT,Status,Year'), []) : Promise.resolve([]),
    ir ? safe(esriQuery(IR_ADDR, envAround(c, 150), 'esriGeometryEnvelope', 'SewerAvailabilityStatus,ADDRESS', true), []) : Promise.resolve([]),
    ir ? safe(esriQuery(VB_PARCELS, pt, 'esriGeometryPoint', 'CitySewer,EligibleSTEP,InstalledSTEP,City'), []) : Promise.resolve([]),
    ir ? safe(esriQuery(VB_WATER, pt, 'esriGeometryPoint', 'OBJECTID'), []) : Promise.resolve([]),
    pu ? safe(esriQuery(PU_MAINS, env, 'esriGeometryEnvelope', 'DIAMETER,MATERIAL,WATERTYPE,ACTIVEFLAG', true), []) : Promise.resolve([]),
    hg ? safe(esriQuery(HD_MSBU, pt, 'esriGeometryPoint', 'GIS_NAME'), []) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const sjrwmd = sj.map(h => ({ name: text(h.attributes.UTILITY), category: text(h.attributes.UTIL_CAT) })).filter(w => { if (!w.name || seen.has(w.name)) return false; seen.add(w.name); return true; });
  const p = s2s[0]?.attributes;
  const sewerProject = p ? { name: text(p.PROJECT), status: text(p.Status), year: Number(p.Year) || null } : null;
  const eligible = addr.filter(h => /may be available/i.test(text(h.attributes.SewerAvailabilityStatus)));
  const near = nearestPoint(eligible, rs, 'ADDRESS');
  const v = vp[0]?.attributes;
  const vero = v ? { citySewer: text(v.CitySewer), stepEligible: text(v.EligibleSTEP) === 'Yes', stepInstalled: text(v.InstalledSTEP) === 'Yes', city: text(v.City) } : null;
  const line = nearestLine(mains, rs, { size: 'DIAMETER', material: 'MATERIAL', skip: a => a.ACTIVEFLAG === 0 || (text(a.WATERTYPE) !== '' && text(a.WATERTYPE) !== 'Potable') });
  return {
    region: { id: region.id, label: region.label }, epa, sjrwmd, sewerProject, sewerProgram: !!near && near.feet <= 150, vero, veroWater: vw.length > 0,
    putnamMain: line && line.feet <= 500 ? { feet: line.feet, size: line.size, material: line.material } : null,
    msbu: text(msbu[0]?.attributes.GIS_NAME) || null,
  };
}
