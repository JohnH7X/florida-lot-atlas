import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Line } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * Volusia County (Daytona Beach, DeLand, Port Orange, New Smyrna Beach, Edgewater, Orange City) and Martin County (Stuart).
 * Volusia County GIS publishes water and sewer service areas by provider; the City of Port Orange publishes its water and sewer mains and hydrants.
 * For Martin County only the City of Stuart's utility boundary is public: Martin County Utilities' own server does not answer outside its network,
 * and the South Florida Water Management District's service-area layers block browser requests, so neither is used.
 */
export const VO_AREAS = 'https://maps1.vcgov.org/arcgis/rest/services/Other_Information/MapServer/19';
const PO = 'https://services1.arcgis.com/EHJIZRZ77WzgIElO/arcgis/rest/services';
export const PO_WATER = `${PO}/Water_Distribution/FeatureServer/3`;
export const PO_HYDRANT = `${PO}/Water_Distribution/FeatureServer/1`;
export const PO_GRAVITY = `${PO}/Sewer_Network/FeatureServer/5`;
export const PO_FORCE = `${PO}/Sewer_Network/FeatureServer/4`;
export const STUART_AREA = 'https://services.arcgis.com/RyoFD3Lw9KSERnvQ/arcgis/rest/services/Utility_Service_Area/FeatureServer/0';
export const VO_BOUNDS: [number, number, number, number] = [-81.65, 28.6, -80.8, 29.55];
export const PORT_ORANGE_BOUNDS: [number, number, number, number] = [-81.09, 29.05, -80.93, 29.2];
export const MARTIN_BOUNDS: [number, number, number, number] = [-80.7, 26.95, -80.05, 27.3];

/** Normalizes the service-type spellings Volusia's layer uses ("Water-Sewer", "WATER/SEWER", "Water-Sewerr"). */
export const voType = (v: unknown): 'both' | 'water' | 'sewer' | 'other' => {
  const t = text(v).toLowerCase(); const w = t.includes('water'), s = t.includes('sew');
  return w && s ? 'both' : w && !t.includes('wholesale') ? 'water' : s ? 'sewer' : 'other';
};
export const VO_TYPE_LABEL = { both: 'water and sewer', water: 'water only', sewer: 'sewer only', other: 'wholesale or other' } as const;

export interface VolusiaMartinUtilities {
  region: 'volusia' | 'martin';
  /** Volusia service areas (provider, area, services) covering the lot. */
  areas: { provider: string; area: string; type: 'both' | 'water' | 'sewer' | 'other' }[];
  portOrange: { inCity: boolean; waterMain: Line | null; sewerMain: (Line & { force: boolean }) | null; hydrant: { feet: number; id: string } | null } | null;
  stuart: boolean;
  epa: EpaWater | null;
}
/** Volusia or Martin facts for a parcel, or null elsewhere. */
export async function volusiaMartinUtilitiesAt(lot: LotFeature): Promise<VolusiaMartinUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  const vo = inBounds(c, VO_BOUNDS), mt = !vo && inBounds(c, MARTIN_BOUNDS); if (!vo && !mt) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c, 500), rs = lotRings(lot), po = vo && inBounds(c, PORT_ORANGE_BOUNDS);
  const [areas, water, grav, force, hyd, stuart, epa] = await Promise.all([
    vo ? safe(esriQuery(VO_AREAS, pt, 'esriGeometryPoint', 'PROVIDER,SERVAREA,SERV_TYPE'), []) : Promise.resolve([]),
    po ? safe(esriQuery(PO_WATER, env, 'esriGeometryEnvelope', 'Diameter,Material,LifecycleStatus', true), []) : Promise.resolve([]),
    po ? safe(esriQuery(PO_GRAVITY, env, 'esriGeometryEnvelope', 'NominalDiameter,Material,LifecycleStatus', true), []) : Promise.resolve([]),
    po ? safe(esriQuery(PO_FORCE, env, 'esriGeometryEnvelope', 'Diameter,Material,LifecycleStatus', true), []) : Promise.resolve([]),
    po ? safe(esriQuery(PO_HYDRANT, env, 'esriGeometryEnvelope', 'FacilityID,LifecycleStatus', true), []) : Promise.resolve([]),
    mt ? safe(esriQuery(STUART_AREA, pt, 'esriGeometryPoint', 'OBJECTID'), []) : Promise.resolve([]),
    safe(epaWaterAt(c), null),
  ]);
  const seen = new Set<string>();
  const list = areas.map(h => ({ provider: text(h.attributes.PROVIDER), area: text(h.attributes.SERVAREA), type: voType(h.attributes.SERV_TYPE) }))
    .filter(a => { const k = `${a.provider}|${a.area}|${a.type}`; if (seen.has(k) || !a.provider) return false; seen.add(k); return true; });
  const dead = (a: Record<string, unknown>) => /abandon|retire|remov/i.test(text(a.LifecycleStatus));
  let portOrange: VolusiaMartinUtilities['portOrange'] = null;
  if (po) {
    const w = nearestLine(water, rs, { size: 'Diameter', material: 'Material', skip: dead }), g = nearestLine(grav, rs, { size: 'NominalDiameter', material: 'Material', skip: dead });
    const f = nearestLine(force, rs, { size: 'Diameter', material: 'Material', skip: dead }), h = nearestPoint(hyd, rs, 'FacilityID', dead);
    const sewerMain = g && (!f || g.feet <= f.feet) ? { ...g, force: false } : f ? { ...f, force: true } : null;
    const near = (w && w.feet <= 500) || (sewerMain && sewerMain.feet <= 500);
    if (near || list.some(a => /port orange/i.test(a.provider))) portOrange = { inCity: list.some(a => /port orange/i.test(a.provider)), waterMain: w, sewerMain, hydrant: h ? { feet: h.feet, id: h.id } : null };
  }
  return { region: vo ? 'volusia' : 'martin', areas: list, portOrange, stuart: stuart.length > 0, epa };
}
