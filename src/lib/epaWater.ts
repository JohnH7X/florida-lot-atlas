import type { Position } from 'geojson';
import { esriQuery, num, safe, text } from './utilGeo';

/** EPA "Community Water System Service Area Boundaries" (statewide): the public water system whose area covers a point. Partly modeled, so indicative only. */
export const EPA_URL = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/Water_System_Boundaries/FeatureServer/0';
export interface EpaWater { name: string; pwsid: string; population: number | null }
export async function epaWaterAt(c: Position): Promise<EpaWater | null> {
  const r = await safe(esriQuery(EPA_URL, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'PWS_Name,PWSID,Population_Served_Count'), []);
  const a = r[0]?.attributes; if (!a) return null;
  return { name: text(a.PWS_Name), pwsid: text(a.PWSID), population: num(a.Population_Served_Count) };
}
