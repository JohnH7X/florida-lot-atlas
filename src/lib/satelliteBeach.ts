import { lotCenter, type LotFeature } from './lots';

/** City of Satellite Beach, FL: city boundary from the city's GIS (services5.arcgis.com, City of Satellite Beach Map). */
const BOUNDARY = 'https://services5.arcgis.com/6oVY31bK6DOd0VbR/arcgis/rest/services/City_of_Satellite_Beach_Map_v1_0/FeatureServer/1/query';
/** Whether the parcel is inside the City of Satellite Beach. */
export async function inSatelliteBeach(lot: LotFeature): Promise<boolean> {
  const c = lotCenter(lot); if (!c) return false;
  if (c[0] < -80.65 || c[0] > -80.55 || c[1] < 28.12 || c[1] > 28.2) return false;
  const body = new URLSearchParams({ geometry: JSON.stringify({ x: c[0], y: c[1], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'CITY_NAME', returnGeometry: 'false', f: 'json' });
  const j = await (await fetch(BOUNDARY, { method: 'POST', body })).json();
  return Array.isArray(j.features) && j.features.length > 0;
}
