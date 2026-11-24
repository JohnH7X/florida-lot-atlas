import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Hit, type Line } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';
import { countyOf } from './stJohnsClay';

/**
 * Florida Panhandle: Bay (Panama City, Panama City Beach, Lynn Haven), Escambia (Pensacola), Santa Rosa (Pace, Milton, Navarre, Gulf Breeze),
 * Okaloosa (Fort Walton Beach, Destin, Crestview) and Walton (Santa Rosa Beach, DeFuniak Springs).
 * Bay County GIS publishes the regional water mains, municipal sewer mains and hydrants (each tagged with its owner), the county-exclusive
 * utility service areas and Health Department septic permits with a sewer-availability flag. ECUA publishes Escambia's water franchise areas,
 * sewer expansion projects and hydrants. Santa Rosa County publishes sewer franchise areas, county-wide hydrants tagged with the water franchise,
 * and Pace Water System's and Gulf Breeze's sewer mains. Okaloosa's water network and service-area services were down or not started when tested,
 * and Walton County publishes no utility layers, so those two get only the EPA water system areas.
 */
const BAY = 'https://services1.arcgis.com/QB0VWfqR9MD4lF0F/arcgis/rest/services';
export const BAY_WATER = `${BAY}/wMain/FeatureServer/1`;
export const BAY_GRAV = `${BAY}/ssGravityMain/FeatureServer/0`;
export const BAY_FORCE = `${BAY}/ssPressurizedMain/FeatureServer/0`;
const BAY_HYD = `${BAY}/wHydrant/FeatureServer/0`;
export const BAY_AREAS = `${BAY}/UtilityServiceAreas_view/FeatureServer/0`;
const BAY_SEPTIC = `${BAY}/WatershedSepticTanks/FeatureServer/0`;
const ECUA = 'https://services.arcgis.com/qzztv6kfISWsKKW4/arcgis/rest/services';
export const ECUA_WATER = `${ECUA}/WaterFranchiseAreas/FeatureServer/0`;
export const ECUA_SEWER_EXP = `${ECUA}/SewerExpansion/FeatureServer/0`;
const ECUA_HYD = `${ECUA}/FireHydrantLocations/FeatureServer/0`;
const SRC = 'https://services.arcgis.com/Eg4L1xEv2R3abuQd/arcgis/rest/services';
export const SR_SEWER_FRAN = `${SRC}/SewerFranchiseAreas/FeatureServer/0`;
const SR_HYD = `${SRC}/NavarreBeachUtilityData/FeatureServer/0`;
export const SR_PACE_GRAV = `${SRC}/PWS_Sewer_Gravity_Main/FeatureServer/0`;
export const SR_PACE_FORCE = `${SRC}/PWS_Sewer_Force_Main/FeatureServer/0`;
export const SR_GB_SEWER = `${SRC}/Gulf_Breeze_Sewer_Lines/FeatureServer/0`;

type Box = [number, number, number, number];
export const PH_BOUNDS: Box = [-87.65, 29.9, -85.38, 31.0];
export const BAY_BOUNDS: Box = [-86.0, 29.9, -85.38, 30.57];
export const ESC_BOUNDS: Box = [-87.65, 30.27, -87.15, 31.0];
export const SR_BOUNDS_PH: Box = [-87.32, 30.33, -86.78, 31.0];
const REGIONS: { id: 'bay' | 'escambia' | 'santarosa' | 'okaloosa' | 'walton'; label: string; box: Box }[] = [
  { id: 'bay', label: 'Bay County', box: BAY_BOUNDS },
  { id: 'escambia', label: 'Escambia County', box: [-87.65, 30.27, -87.24, 31.0] },
  { id: 'santarosa', label: 'Santa Rosa County', box: [-87.24, 30.33, -86.78, 31.0] },
  { id: 'okaloosa', label: 'Okaloosa County', box: [-86.78, 30.37, -86.39, 31.0] },
  { id: 'walton', label: 'Walton County', box: [-86.39, 30.25, -85.84, 31.0] },
];
const BAY_OWNER: Record<string, string> = { '-1': 'Private', '-2': 'Other', 1: 'Bay County', 2: 'Callaway', 3: 'Lynn Haven', 4: 'Mexico Beach', 5: 'Panama City', 6: 'Panama City Beach', 7: 'Parker', 8: 'Springfield',
  9: 'Naval Support Activity Panama City', 10: 'Tyndall Air Force Base', 11: 'AWT', 12: 'Bay County (North Bay)', 13: 'Bay County (Northeast)', 14: 'Bay County (West Bay)', 15: 'Bay County (Cedar Grove)', 16: 'FDOT' };

export interface PanhandleUtilities {
  region: { id: string; label: string };
  epa: EpaWater | null;
  waterMain: Line | null; sewerMain: Line | null;
  hydrant: { feet: number; owner: string } | null;
  /** Bay County exclusive utility service area, ECUA water franchise, or Santa Rosa sewer franchise (with phone). */
  waterProvider: string | null;
  sewerProvider: { name: string; phone: string } | null;
  /** ECUA septic-to-sewer expansion project. */
  sewerProject: { name: string; status: string; year: string } | null;
  /** Bay County: a Health Department septic permit at or next to the lot, and whether it recorded sewer as available. */
  septicPermit: { sewerAvailable: string } | null;
}
const inactive = (a: Record<string, unknown>) => a.ACTIVEFLAG === 0;
const best = (list: (Line | null)[]) => list.filter((l): l is Line => !!l).sort((a, b) => a.feet - b.feet)[0] || null;

/** Panhandle utility facts for a parcel, or null outside these five counties. */
export async function panhandleUtilitiesAt(lot: LotFeature): Promise<PanhandleUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, PH_BOUNDS)) return null;
  // The parcel's own county number decides when present; the boxes are a fallback.
  const co = countyOf(lot);
  const region = co ? REGIONS.find(r => r.label === `${co} County`) : REGIONS.find(r => inBounds(c, r.box)); if (!region) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const P = (url: string, f: string) => safe(esriQuery(url, pt, 'esriGeometryPoint', f), [] as Hit[]);
  const E = (url: string, f: string) => safe(esriQuery(url, env, 'esriGeometryEnvelope', f, true), [] as Hit[]);
  const none = Promise.resolve([] as Hit[]);
  const bay = region.id === 'bay', esc = region.id === 'escambia', sr = region.id === 'santarosa';
  const [epa, bw, bg, bf, bh, ba, bs, ew, ex, eh, sf, sh, pg, pf, gb] = await Promise.all([
    safe(epaWaterAt(c), null),
    bay ? E(BAY_WATER, 'DIAMETER,MATERIAL,OWNEDBY,ACTIVEFLAG,WATERTYPE') : none, bay ? E(BAY_GRAV, 'DIAMETER,MATERIAL,OWNEDBY,ACTIVEFLAG') : none,
    bay ? E(BAY_FORCE, 'DIAMETER,MATERIAL,OWNEDBY,ACTIVEFLAG') : none, bay ? E(BAY_HYD, 'FACILITYID,OWNEDBY,ACTIVE') : none,
    bay ? P(BAY_AREAS, 'name,legend') : none,
    bay ? safe(esriQuery(BAY_SEPTIC, envAround(c, 120), 'esriGeometryEnvelope', 'Sewer_Avai', true), [] as Hit[]) : none,
    esc ? P(ECUA_WATER, 'Served_By,Franchise') : none, esc ? P(ECUA_SEWER_EXP, 'ProjectName,ProjectStatus,CompletionYear') : none,
    esc ? E(ECUA_HYD, 'hydrid,lifecyclestatus') : none,
    sr ? P(SR_SEWER_FRAN, 'SewerFranName,ContactPhone') : none, sr ? E(SR_HYD, 'HydrantID,WaterFran,OutOfServiceDate') : none,
    sr ? E(SR_PACE_GRAV, 'diameter,material') : none, sr ? E(SR_PACE_FORCE, 'diameter,material') : none, sr ? E(SR_GB_SEWER, 'Size,Material,MainType') : none,
  ]);
  const own = (kind: string) => (l: Line | null): Line | null => (l ? { ...l, kind } : null);
  let waterMain: Line | null = null, sewerMain: Line | null = null, hydrant: PanhandleUtilities['hydrant'] = null, waterProvider: string | null = null;
  let sewerProvider: PanhandleUtilities['sewerProvider'] = null, sewerProject: PanhandleUtilities['sewerProject'] = null, septicPermit: PanhandleUtilities['septicPermit'] = null;
  if (bay) {
    // Tag each line with its owner by finding the nearest line per owner group.
    const byOwner = (hits: Hit[], kind: string) => best(Object.entries(hits.reduce<Record<string, Hit[]>>((m, h) => { const k = String(h.attributes.OWNEDBY ?? ''); (m[k] ||= []).push(h); return m; }, {}))
      .map(([k, hs]) => own(`${BAY_OWNER[k] || 'Owner not recorded'}${kind ? ` · ${kind}` : ''}`)(nearestLine(hs, rs, { size: 'DIAMETER', material: 'MATERIAL', skip: a => inactive(a) || (text(a.WATERTYPE) !== '' && text(a.WATERTYPE) !== 'Potable') }))));
    waterMain = byOwner(bw, '');
    sewerMain = best([byOwner(bg, 'gravity'), byOwner(bf, 'force main')]);
    const h = nearestPoint(bh, rs, 'FACILITYID', a => a.ACTIVE === 0);
    const ho = h ? bh.find(x => text(x.attributes.FACILITYID) === h.id)?.attributes.OWNEDBY : undefined;
    hydrant = h && h.feet <= 500 ? { feet: h.feet, owner: BAY_OWNER[String(ho ?? '')] || '' } : null;
    waterProvider = text(ba[0]?.attributes.legend) || text(ba[0]?.attributes.name) || null;
    const sp = bs.find(x => /^(Yes|No)$/.test(text(x.attributes.Sewer_Avai)));
    septicPermit = sp ? { sewerAvailable: text(sp.attributes.Sewer_Avai) } : null;
  }
  if (esc) {
    const w = ew[0]?.attributes; waterProvider = w ? text(w.Served_By) || null : null;
    const x = ex[0]?.attributes; sewerProject = x ? { name: text(x.ProjectName), status: text(x.ProjectStatus), year: text(x.CompletionYear) } : null;
    const h = nearestPoint(eh, rs, 'hydrid', a => text(a.lifecyclestatus) !== '' && text(a.lifecyclestatus) !== 'Active');
    hydrant = h && h.feet <= 500 ? { feet: h.feet, owner: 'ECUA' } : null;
  }
  if (sr) {
    const f = sf[0]?.attributes; sewerProvider = f ? { name: text(f.SewerFranName), phone: text(f.ContactPhone) } : null;
    const h = nearestPoint(sh, rs, 'HydrantID', a => !!text(a.OutOfServiceDate));
    const ha = h ? sh.find(x => text(x.attributes.HydrantID) === h.id)?.attributes : undefined;
    hydrant = h && h.feet <= 500 ? { feet: h.feet, owner: text(ha?.WaterFran) } : null;
    waterProvider = text(ha?.WaterFran) || null;
    sewerMain = best([own('Pace Water System · gravity')(nearestLine(pg, rs, { size: 'diameter', material: 'material' })), own('Pace Water System · force main')(nearestLine(pf, rs, { size: 'diameter', material: 'material' })),
      own('City of Gulf Breeze')(nearestLine(gb, rs, { size: 'Size', material: 'Material' }))]);
  }
  return { region: { id: region.id, label: region.label }, epa, waterMain: waterMain && waterMain.feet <= 500 ? waterMain : null, sewerMain: sewerMain && sewerMain.feet <= 500 ? sewerMain : null,
    hydrant, waterProvider, sewerProvider, sewerProject, septicPermit };
}
