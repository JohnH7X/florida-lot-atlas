import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestLine, nearestPoint, safe, text, type Line } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * Manatee County, FL (Bradenton, Parrish, Palmetto, Lakewood Ranch, Longboat Key). Manatee County Utilities publishes its water, sewer (gravity and force)
 * and reclaimed mains and hydrants, plus the sewer districts, and the Braden River service area. The City of Bradenton publishes
 * its water-only area. All from the county's own ArcGIS servers.
 */
const GIS = 'https://www.mymanatee.org';
export const MAN_UI = `${GIS}/gisutil/rest/services/utilitiesinfrastructure`;
export const MAN_WATER = `${MAN_UI}/watercounty/MapServer`;
export const MAN_SEWER = `${MAN_UI}/sewercounty/MapServer`;
export const MAN_RECLAIM = `${MAN_UI}/reclaimedcounty/MapServer`;
export const MAN_PLAN = `${GIS}/gisits/rest/services/opendata/Planning/MapServer`;
export const MAN_BRADEN = `${MAN_UI}/bradenriverservicearea/MapServer/0`;
export const MAN_SEWER_DISTRICTS = `${MAN_PLAN}/20`;
export const MAN_BRADENTON = 'https://services6.arcgis.com/wl0q8tN2gn8MMx1p/arcgis/rest/services/ServiceAreas/FeatureServer/0';
export const MAN_BOUNDS: [number, number, number, number] = [-82.85, 27.3, -82.0, 27.75];

export interface ManateeUtilities {
  waterMain: Line | null; sewerMain: (Line & { force: boolean }) | null; reclaimMain: Line | null;
  hydrant: { feet: number; id: string } | null;
  sewerDistrict: string | null; bradenRiver: boolean; bradentonWaterOnly: boolean;
  epa: EpaWater | null;
}
/** Manatee County facts for a parcel, or null when it is outside the county. */
export async function manateeUtilitiesAt(lot: LotFeature): Promise<ManateeUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, MAN_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] }, env = envAround(c, 500), rs = lotRings(lot);
  const lines = (base: string, layer: number, fields: string) => safe(esriQuery(`${base}/${layer}`, env, 'esriGeometryEnvelope', fields, true), []);
  const [water, grav, force, reclaim, hyd, dist, braden, bra, epa] = await Promise.all([
    lines(MAN_WATER, 12, 'DIAMETER,MATERIAL,LIFECYCLESTATUS,WATERTYPE'), lines(MAN_SEWER, 12, 'DIAMETER,MATERIAL'), lines(MAN_SEWER, 11, 'DIAMETER,MATERIAL'),
    lines(MAN_RECLAIM, 10, 'DIAMETER,MATERIAL,LIFECYCLESTATUS'), lines(MAN_WATER, 1, 'OBJECTID,ASSET_ID'),
    safe(esriQuery(MAN_SEWER_DISTRICTS, pt, 'esriGeometryPoint', 'DISTNAME'), []), safe(esriQuery(MAN_BRADEN, pt, 'esriGeometryPoint', 'OBJECTID'), []),
    safe(esriQuery(MAN_BRADENTON, pt, 'esriGeometryPoint', 'Service'), []),
    safe(epaWaterAt(c), null),
  ]);
  const live = (a: Record<string, unknown>) => { const s = text(a.LIFECYCLESTATUS); return !!s && s !== 'Active'; };
  const g = nearestLine(grav, rs, { size: 'DIAMETER', material: 'MATERIAL' }), f = nearestLine(force, rs, { size: 'DIAMETER', material: 'MATERIAL' });
  const sewerMain = g && (!f || g.feet <= f.feet) ? { ...g, force: false } : f ? { ...f, force: true } : null;
  const h = nearestPoint(hyd, rs, 'ASSET_ID');
  return {
    waterMain: nearestLine(water, rs, { size: 'DIAMETER', material: 'MATERIAL', skip: live }), sewerMain,
    reclaimMain: nearestLine(reclaim, rs, { size: 'DIAMETER', material: 'MATERIAL', skip: live }),
    hydrant: h ? { feet: h.feet, id: h.id } : null,
    sewerDistrict: text(dist[0]?.attributes.DISTNAME) || null, bradenRiver: braden.length > 0, bradentonWaterOnly: bra.length > 0, epa,
  };
}
