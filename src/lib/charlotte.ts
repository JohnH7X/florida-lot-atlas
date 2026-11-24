import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Line } from './utilGeo';

/** Charlotte County, FL (Port Charlotte, Punta Gorda area): Charlotte County Utilities' water, sewer and reclaimed network and certificated service areas (Charlotte County GIS). */
const MB = 'https://agis3.charlottecountyfl.gov/arcgis/rest/services/Apps/Utilities_Mapbook_2024/MapServer';
const ESS = 'https://agis3.charlottecountyfl.gov/arcgis/rest/services/Essentials/CCGISLayers/MapServer';
/** Water and wastewater MSBUs (expansion assessment areas such as South Gulf Cove and Rotonda), published by Charlotte County Utilities. */
export const CH_MSBU = 'https://services2.arcgis.com/7XOSGW3VgfWJK7Ia/arcgis/rest/services/MyMapService/FeatureServer/0';
/** County-wide hydrant layer that names the utility owning each hydrant (Charlotte County Utilities, Englewood Water District, Punta Gorda and others). */
const CH_ALL_HYD = `${ESS}/20`;
export const CH_BOUNDS: [number, number, number, number] = [-82.4, 26.65, -81.65, 27.25];
export interface ChLayer { id: string; label: string; layers: string; color: string; on: boolean }
export const CH_LAYERS: ChLayer[] = [
  { id: 'water', label: 'Water mains', layers: '30', color: '#1f6fd1', on: true },
  { id: 'sewer', label: 'Sewer mains (gravity, force, low-pressure, vacuum)', layers: '13,16,15,23', color: '#b5651d', on: true },
  { id: 'reclaim', label: 'Reclaimed water mains', layers: '6', color: '#8e44ad', on: false },
  { id: 'hydrants', label: 'Fire hydrants', layers: '26', color: '#d62828', on: false },
  { id: 'warea', label: 'Water service area', layers: '37', color: '#7fb3e6', on: false },
  { id: 'sarea', label: 'Sewer service area', layers: '36', color: '#d9b38c', on: false },
];
export const chTiles = (l: ChLayer) =>
  `${MB}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${l.layers}&f=image`;

export interface CharlotteUtilities {
  puntaGorda: boolean; waterArea: string | null; sewerArea: string | null;
  waterMain: Line | null; sewerMain: Line | null; reclaimMain: Line | null; hydrant: { feet: number; id: string } | null;
  /** Water or wastewater MSBU (assessment area) the parcel is in. */
  msbu: string | null;
  /** Nearest hydrant of any utility, with its owner, when it is closer than the nearest Charlotte County Utilities hydrant. */
  otherHydrant: { feet: number; utility: string } | null;
}
const active = (a: Record<string, unknown>) => { const s = text(a.LifeCycle); return !!s && s !== 'In Service'; };

/** Charlotte County utility facts for a parcel, or null when it is outside Charlotte County or nothing is mapped. */
export async function charlotteUtilitiesAt(lot: LotFeature): Promise<CharlotteUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, CH_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const area = (layer: number) => safe(esriQuery(`${MB}/${layer}`, pt, 'esriGeometryPoint', 'UtilityName,System').then(r => r[0] ? `${text(r[0].attributes.UtilityName)}${text(r[0].attributes.System) ? ` (${text(r[0].attributes.System)})` : ''}` : null), null);
  const lines = (layer: number) => safe(esriQuery(`${MB}/${layer}`, env, 'esriGeometryEnvelope', '*', true), []);
  const [pg, waterArea, sewerArea, water, grav, press, lowp, vac, rec, hyd, ms, ah] = await Promise.all([
    safe(esriQuery(`${ESS}/7`, pt, 'esriGeometryPoint', 'OBJECTID').then(r => r.length > 0), false), area(37), area(36),
    lines(30), lines(13), lines(16), lines(15), lines(23), lines(6),
    safe(esriQuery(`${MB}/26`, env, 'esriGeometryEnvelope', 'FacilityID,LifeCycle', true), []),
    safe(esriQuery(CH_MSBU, pt, 'esriGeometryPoint', 'DESCRIPTIO'), []),
    safe(esriQuery(CH_ALL_HYD, env, 'esriGeometryEnvelope', 'TAG_NUMBER,UTILITY_NA', true), []),
  ]);
  const opt = (kind: string) => ({ size: 'Diameter', material: 'MainMaterial', kind, skip: active });
  const sewer = [nearestLine(grav, rs, opt('Gravity')), nearestLine(press, rs, opt('Force main')), nearestLine(lowp, rs, opt('Low-pressure')), nearestLine(vac, rs, opt('Vacuum'))]
    .filter((l): l is Line => !!l).sort((a, b) => a.feet - b.feet)[0] || null;
  const waterMain = nearestLine(water, rs, { size: 'Diameter', kind: 'Water', skip: active }), reclaimMain = nearestLine(rec, rs, { size: 'Diameter', kind: 'Reclaimed', skip: active });
  const hydrant = nearestPoint(hyd, rs, 'FacilityID', active);
  const msbu = text(ms[0]?.attributes.DESCRIPTIO) || null;
  const nonCcu = ah.filter(h => { const u = text(h.attributes.UTILITY_NA); return !!u && !/charlotte county utilities/i.test(u); });
  let otherHydrant: CharlotteUtilities['otherHydrant'] = null;
  for (const h of nonCcu) { const d = nearestPoint([h], rs, 'TAG_NUMBER'); if (d && (!otherHydrant || d.feet < otherHydrant.feet)) otherHydrant = { feet: d.feet, utility: text(h.attributes.UTILITY_NA) }; }
  if (otherHydrant && (otherHydrant.feet > 500 || (hydrant && hydrant.feet <= otherHydrant.feet))) otherHydrant = null;
  if (!pg && !waterArea && !sewerArea && !waterMain && !sewer && !reclaimMain && !hydrant && !msbu && !otherHydrant) return null;
  return { puntaGorda: pg, waterArea, sewerArea, waterMain, sewerMain: sewer, reclaimMain, hydrant, msbu, otherHydrant };
}
