import { lotCenter, type LotFeature } from './lots';

/** The Brevard County city a parcel sits in (Brevard County GIS city boundaries), e.g. "WEST MELBOURNE" or "CAPE CANAVERAL". */
const URL = 'https://gis.brevardfl.gov/gissrv/rest/services/Hosted/City_Boundary_TEST/FeatureServer/0/query';
export async function brevardCityAt(lot: LotFeature): Promise<string | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < -81.05 || c[0] > -80.4 || c[1] < 27.8 || c[1] > 28.85) return null;
  const body = new URLSearchParams({ geometry: JSON.stringify({ x: c[0], y: c[1], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'city_name', returnGeometry: 'false', f: 'json' });
  const j = await (await fetch(URL, { method: 'POST', body })).json();
  const n = j.features?.[0]?.attributes?.city_name;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}
