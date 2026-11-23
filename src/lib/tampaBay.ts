import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Hit, type Line } from './utilGeo';

/**
 * Pasco and Hillsborough counties, FL (Land O'Lakes, Zephyrhills, Wesley Chapel, Tampa, Brandon). Pasco publishes water service areas and hydrants. Hillsborough publishes
 * potable water service areas and hydrants; the City of Tampa publishes water and sewer service areas, sewer mains and hydrants. County pipe maps are not reachable.
 */
const PASCO = 'https://services6.arcgis.com/Mo4MddfRHpFwT7UF/arcgis/rest/services';
export const PASCO_WATER = `${PASCO}/Water_Service_Areas/FeatureServer/1`;
const HC = 'https://services.arcgis.com/apTfC6SUmnNfnxuF/arcgis/rest/services';
export const HC_POTABLE = `${HC}/Potable_Water_Service_Area_Boundary/FeatureServer/0`;
const HC_HYD = `${HC}/FireRescue_Hydrants/FeatureServer/0`;
export const TAMPA = 'https://arcgis.tampagov.net/arcgis/rest/services/OpenData';
export const TB_BOUNDS: [number, number, number, number] = [-82.95, 27.55, -81.95, 28.5];
export interface TampaBayUtilities {
  pasco: { water: string; phone: string; hydrant: { feet: number; id: string } | null } | null;
  hillsborough: { tampaWater: string; tampaSewer: string; countyWater: string; sewerMain: Line | null; hydrant: { feet: number; id: string; owner: string } | null } | null;
}
const PASCO_BOX: [number, number, number, number] = [-82.95, 28.15, -82.0, 28.5];
const HILLS_BOX: [number, number, number, number] = [-82.7, 27.55, -81.95, 28.2];
/** Pasco / Hillsborough utility facts for a parcel, or null when it is outside both. */
export async function tampaBayUtilitiesAt(lot: LotFeature): Promise<TampaBayUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, TB_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const P = (url: string, f: string) => safe(esriQuery(url, pt, 'esriGeometryPoint', f), [] as Hit[]);
  const E = (url: string, f: string) => safe(esriQuery(url, env, 'esriGeometryEnvelope', f, true), [] as Hit[]);
  const none = Promise.resolve([] as Hit[]);
  const inPasco = inBounds(c, PASCO_BOX), inHills = inBounds(c, HILLS_BOX);
  const [pw, ph, tw, ts, hc, hh, tg, tp] = await Promise.all([
    inPasco ? P(PASCO_WATER, 'NAME,PHONE') : none, inPasco ? E(`${PASCO}/Hydrants/FeatureServer/0`, 'ASSETNUMBER,STREET_ADDR') : none,
    inHills ? P(`${TAMPA}/UtilityWater/MapServer/1`, 'SERVICEBY') : none, inHills ? P(`${TAMPA}/UtilitySewer/MapServer/7`, 'SERVICEBY') : none,
    inHills ? P(HC_POTABLE, 'AREA_NAME,Potable_Wa,PWS_ID') : none, inHills ? E(HC_HYD, 'HYDNBR,JURISDICTION,IN_OUT_SERVICE') : none,
    inHills ? E(`${TAMPA}/UtilitySewer/MapServer/6`, 'DIAMETER,MATERIAL,LIFECYCLESTATUS') : none, inHills ? E(`${TAMPA}/UtilitySewer/MapServer/5`, 'DIAMETER,MATERIAL,LIFECYCLESTATUS') : none,
  ]);
  const act = (a: Record<string, unknown>) => !!text(a.LIFECYCLESTATUS) && text(a.LIFECYCLESTATUS) !== 'Active';
  const pasco = pw.length || ph.length ? { water: text(pw[0]?.attributes.NAME), phone: text(pw[0]?.attributes.PHONE), hydrant: nearestPoint(ph, rs, 'STREET_ADDR') } : null;
  const g = nearestLine(tg, rs, { size: 'DIAMETER', material: 'MATERIAL', kind: 'gravity', skip: act }), f = nearestLine(tp, rs, { size: 'DIAMETER', material: 'MATERIAL', kind: 'force main', skip: act });
  const h = nearestPoint(hh, rs, 'HYDNBR', a => text(a.IN_OUT_SERVICE) === 'OUT');
  const owner = h ? text(hh.find(x => text(x.attributes.HYDNBR) === h.id)?.attributes.JURISDICTION) : '';
  const cw = hc[0]?.attributes;
  const hills = tw.length || ts.length || hc.length || h || g || f ? {
    tampaWater: text(tw[0]?.attributes.SERVICEBY), tampaSewer: text(ts[0]?.attributes.SERVICEBY),
    countyWater: cw ? [text(cw.Potable_Wa), text(cw.AREA_NAME) && `${text(cw.AREA_NAME)}`].filter(Boolean).join(' · ') : '',
    sewerMain: g && (!f || g.feet <= f.feet) ? g : f, hydrant: h ? { ...h, owner } : null } : null;
  if (!pasco && !hills) return null;
  return { pasco, hillsborough: hills };
}
