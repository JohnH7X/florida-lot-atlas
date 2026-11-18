import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Line, type VectorLayer } from './utilGeo';

/** City of North Port, FL (North Port Utilities): water and sewer mains and hydrants, plus the city's availability zones (npgis.northportfl.gov). */
const H = 'https://npgis.northportfl.gov/cnpserver/rest/services/Hosted';
export const NP_BOUNDS: [number, number, number, number] = [-82.4, 26.9, -82.0, 27.2];
export const NP_MIN_ZOOM = 15.5;
export const NP_LAYERS: VectorLayer[] = [
  { id: 'water', label: 'Water mains', urls: [`${H}/NPU_Water_Public/FeatureServer/515001`], kind: 'line', color: '#1f6fd1', on: true },
  { id: 'sewer', label: 'Sewer mains', urls: [`${H}/NPU_Sewer_Public/FeatureServer/315001`, `${H}/NPU_Sewer_Public/FeatureServer/315002`], kind: 'line', color: '#b5651d', on: true },
  { id: 'hydrants', label: 'Fire hydrants', urls: [`${H}/NPU_Water_Public/FeatureServer/501007`], kind: 'point', color: '#d62828', on: true },
];

export interface NorthPortUtilities {
  inCity: boolean; waterZone: boolean; sewerZone: boolean; serviceArea: string;
  waterMain: Line | null; sewerMain: Line | null; hydrant: { feet: number; id: string } | null;
}

/** North Port utility facts for a parcel, or null when it is outside North Port's area. */
export async function northPortUtilitiesAt(lot: LotFeature): Promise<NorthPortUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, NP_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c), rs = lotRings(lot);
  const hit = (url: string) => safe(esriQuery(url, pt, 'esriGeometryPoint', 'objectid').then(r => r.length > 0), false);
  const lines = (url: string) => safe(esriQuery(url, env, 'esriGeometryEnvelope', '*', true), []);
  const [inCity, waterZone, sewerZone, area, water, grav, force, hyd] = await Promise.all([
    hit(`${H}/North_Port_City_Limits/FeatureServer/0`), hit(`${H}/Water_Availability_view/FeatureServer/5`), hit(`${H}/Sewer_Availability_view/FeatureServer/6`),
    safe(esriQuery(`${H}/PZh_BoundaryUtilityService/FeatureServer/83`, pt, 'esriGeometryPoint', 'service').then(r => text(r[0]?.attributes.service)), ''),
    lines(`${H}/NPU_Water_Public/FeatureServer/515001`), lines(`${H}/NPU_Sewer_Public/FeatureServer/315001`), lines(`${H}/NPU_Sewer_Public/FeatureServer/315002`),
    safe(esriQuery(`${H}/NPU_Water_Public/FeatureServer/501007`, env, 'esriGeometryEnvelope', 'assetid', true), []),
  ]);
  if (!inCity && !waterZone && !sewerZone && !water.length && !grav.length && !force.length) return null;
  const g = nearestLine(grav, rs, { size: 'diameter', kind: 'Gravity main' }), f = nearestLine(force, rs, { size: 'diameter', kind: 'Force main' });
  return { inCity, waterZone, sewerZone, serviceArea: area, waterMain: nearestLine(water, rs, { size: 'diameter' }),
    sewerMain: g && (!f || g.feet <= f.feet) ? g : f, hydrant: nearestPoint(hyd, rs, 'assetid') };
}
