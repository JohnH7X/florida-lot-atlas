import { lotCenter, type LotFeature } from './lots';

/** Brevard County Utility Services service areas (Merritt Island sewer and the county's other sewer and water areas), from Brevard County GIS. */
const SERVICE = 'https://gis.brevardfl.gov/gissrv/rest/services/Utility_Services/Service_Area_WKID2881/MapServer';
export const BREVARD_UTIL_BOUNDS: [number, number, number, number] = [-81.05, 27.8, -80.4, 28.85];
export interface BrevardUtilLayer { id: string; label: string; layer: number; kind: 'sewer' | 'water'; on: boolean }
export const BREVARD_UTIL_LAYERS: BrevardUtilLayer[] = [
  { id: 'mi', label: 'Merritt Island sewer', layer: 2, kind: 'sewer', on: true },
  { id: 'nb', label: 'North Brevard sewer', layer: 0, kind: 'sewer', on: false },
  { id: 'psj', label: 'Port St. John sewer', layer: 1, kind: 'sewer', on: false },
  { id: 'sc', label: 'South Central sewer', layer: 3, kind: 'sewer', on: false },
  { id: 'sb', label: 'South Beaches sewer', layer: 4, kind: 'sewer', on: false },
  { id: 'bfs', label: 'Barefoot Bay sewer', layer: 5, kind: 'sewer', on: false },
  { id: 'mims', label: 'Mims water', layer: 6, kind: 'water', on: false },
  { id: 'bfw', label: 'Barefoot Bay water', layer: 7, kind: 'water', on: false },
];
export const brevardUtilTiles = (layer: number) =>
  `${SERVICE}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${layer}&f=image`;

export interface BrevardUtilities { areas: { label: string; kind: 'sewer' | 'water' }[] }

/** The Brevard County Utility Services service areas that cover a parcel, or null when none does. */
export async function brevardUtilitiesAt(lot: LotFeature): Promise<BrevardUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  if (c[0] < BREVARD_UTIL_BOUNDS[0] || c[0] > BREVARD_UTIL_BOUNDS[2] || c[1] < BREVARD_UTIL_BOUNDS[1] || c[1] > BREVARD_UTIL_BOUNDS[3]) return null;
  const hit = async (l: BrevardUtilLayer) => {
    try {
      const body = new URLSearchParams({ geometry: JSON.stringify({ x: c[0], y: c[1], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', outFields: 'OBJECTID', returnGeometry: 'false', f: 'json' });
      const j = await (await fetch(`${SERVICE}/${l.layer}/query`, { method: 'POST', body })).json();
      return Array.isArray(j.features) && j.features.length > 0;
    } catch { return false; }
  };
  const found = await Promise.all(BREVARD_UTIL_LAYERS.map(async l => (await hit(l)) ? l : null));
  const areas = found.filter((l): l is BrevardUtilLayer => !!l).map(l => ({ label: l.label, kind: l.kind }));
  return areas.length ? { areas } : null;
}
