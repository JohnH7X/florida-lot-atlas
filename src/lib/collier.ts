import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, lotRings, nearestPoint, safe, text } from './utilGeo';
import { epaWaterAt, type EpaWater } from './epaWater';

/**
 * Collier County, FL (Golden Gate Estates, Naples, Marco Island, Immokalee). Collier does not publish water or sewer pipe maps. Public: the county
 * Public Utilities Division's water-sewer district and wastewater service areas, the city utility boundaries (Naples, Marco Island, Golden Gate City),
 * the Sheriff's Office hydrant layer, and the EPA community water system areas.
 */
export const PUD = 'https://services2.arcgis.com/UJQ7Q9uboSWRAzxj/arcgis/rest/services';
export const CO_BOUNDS: [number, number, number, number] = [-81.95, 25.7, -80.85, 26.55];
const HYD = 'https://services3.arcgis.com/qt8gSZkxL0InaJ9E/arcgis/rest/services/FireDepartment/FeatureServer/1';
export interface CollierUtilities {
  countyWater: boolean; wastewater: string; city: { name: string; phone: string } | null; epa: EpaWater | null; hydrant: { feet: number; id: string } | null;
}
/** Collier County utility facts for a parcel, or null when it is outside the county. */
export async function collierUtilitiesAt(lot: LotFeature): Promise<CollierUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, CO_BOUNDS)) return null;
  const pt = { x: c[0], y: c[1] };
  const [water, ww, city, epa, hyd] = await Promise.all([
    safe(esriQuery(`${PUD}/WaterServiceArea/FeatureServer/0`, pt, 'esriGeometryPoint', 'OBJECTID').then(r => r.length > 0), false),
    safe(esriQuery(`${PUD}/WastewaterServiceAreaNS/FeatureServer/0`, pt, 'esriGeometryPoint', 'AreaName').then(r => text(r[0]?.attributes.AreaName)), ''),
    safe(esriQuery(`${PUD}/CityUtilityBoundaries/FeatureServer/0`, pt, 'esriGeometryPoint', 'Name,ContactNumber').then(r => r[0] ? { name: text(r[0].attributes.Name), phone: text(r[0].attributes.ContactNumber) } : null), null),
    safe(epaWaterAt(c), null),
    safe(esriQuery(HYD, envAround(c), 'esriGeometryEnvelope', 'ID,Location_Address', true), []),
  ]);
  const h = nearestPoint(hyd, lotRings(lot), 'Location_Address');
  // A lot the state roll puts in Collier County always gets a block, even outside every service area (that is the wells-and-septic case).
  if (!water && !ww && !city && !epa && !h && Number((lot.properties as Record<string, unknown> | null)?.CO_NO) !== 21) return null;
  return { countyWater: water, wastewater: ww, city: city && city.name ? city : null, epa, hydrant: h };
}
