import { lotCenter, type LotFeature } from './lots';

/** City of Cocoa Utilities (Brevard County, FL): water and sewer access by parcel, service areas and collection days. */
const BREVARD = 'https://gis.brevardfl.gov/gissrv/rest/services/Utility_Services/Other_Service_Area_WKID2881/MapServer';
const COCOA = 'https://services1.arcgis.com/Tex1uhbqnOZPx6qT/arcgis/rest/services';
const LCRR = 'https://services7.arcgis.com/jt1bzC73xaIZj92j/arcgis/rest/services/LCRR_Customer_Status_Public/FeatureServer/0';

/** Map overlays: Cocoa's water and sewer service areas, from Brevard County's utility service area map. */
export const COCOA_BOUNDS: [number, number, number, number] = [-81.05, 28.15, -80.5, 28.65];
export interface CocoaLayer { id: string; label: string; layer: number; on: boolean }
export const COCOA_LAYERS: CocoaLayer[] = [
  { id: 'water', label: 'Cocoa water service area', layer: 1, on: true },
  { id: 'sewer', label: 'Cocoa sewer service area', layer: 0, on: true },
];
export const cocoaTiles = (layer: number) =>
  `${BREVARD}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${layer}&f=image`;

export interface CocoaUtilities {
  inCity: boolean;
  water: { access: boolean; where: 'inside Cocoa' | 'outside Cocoa' | null; area: boolean };
  sewer: { access: boolean; where: 'inside Cocoa' | 'outside Cocoa' | null; area: boolean };
  waste: { trash: string; recycle: string; yard: string; bulk: string; address: string } | null;
  serviceLine: { customer: string; utility: string; address: string } | null;
}

interface Hit { attributes: Record<string, unknown> }
async function query(url: string, geometry: object, geometryType: string, outFields: string, extra: Record<string, string> = {}): Promise<Hit[]> {
  const body = new URLSearchParams({ geometry: JSON.stringify({ ...geometry, spatialReference: { wkid: 4326 } }), geometryType, inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'false', f: 'json', ...extra });
  const j = await (await fetch(`${url}/query`, { method: 'POST', body })).json();
  if (j.error) throw new Error(j.error.message);
  return (j.features || []) as Hit[];
}
const text = (v: unknown) => (v == null ? '' : String(v).trim());
const title = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const day = (v: unknown) => { const t = text(v); return t ? title(t) : ''; };
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Cocoa Utilities facts for a Brevard parcel, or null when nothing in Cocoa's data covers it. */
export async function cocoaUtilitiesAt(lot: LotFeature): Promise<CocoaUtilities | null> {
  const c = lotCenter(lot); if (!c) return null;
  // Only Brevard and its neighbours can be Cocoa customers.
  if (c[0] < -81.1 || c[0] > -80.45 || c[1] < 27.8 || c[1] > 28.8) return null;
  const pt = { x: c[0], y: c[1] };
  const safe = async <T,>(p: Promise<T>, d: T) => { try { return await p; } catch { return d; } };
  const P = 'esriGeometryPoint';
  const [city, wIn, wOut, sIn, sOut, wArea, sArea, waste, lcrr] = await Promise.all([
    safe(query(`${COCOA}/Cocoa_City_Boundary/FeatureServer/1`, pt, P, 'CITY_NAME'), [] as Hit[]),
    safe(query(`${COCOA}/CocoaWaterDistributionAccess/FeatureServer/1`, pt, P, 'TaxAcct'), [] as Hit[]),
    safe(query(`${COCOA}/CocoaWaterDistributionAccess/FeatureServer/0`, pt, P, 'TaxAcct'), [] as Hit[]),
    safe(query(`${COCOA}/CocoaSanitarySewerAccess/FeatureServer/1`, pt, P, 'TaxAcct'), [] as Hit[]),
    safe(query(`${COCOA}/CocoaSanitarySewerAccess/FeatureServer/0`, pt, P, 'TaxAcct'), [] as Hit[]),
    safe(query(`${BREVARD}/1`, pt, P, 'OBJECTID'), [] as Hit[]),
    safe(query(`${BREVARD}/0`, pt, P, 'OBJECTID'), [] as Hit[]),
    safe(query(`${COCOA}/WM_All_Pickup_Types/FeatureServer/3`, pt, P, 'Trash_DOW,Recycle_DOW,ContYardWaste_DOW,YardBulkWaste,ServiceAddress'), [] as Hit[]),
    safe(query(LCRR, pt, P, 'locationaddress,current_lcr_custstatus,current_lcr_sysstatus', { distance: '60', units: 'esriSRUnit_Meter' }), [] as Hit[]),
  ]);
  const water = { access: wIn.length + wOut.length > 0, where: wIn.length ? 'inside Cocoa' as const : wOut.length ? 'outside Cocoa' as const : null, area: wArea.length > 0 };
  const sewer = { access: sIn.length + sOut.length > 0, where: sIn.length ? 'inside Cocoa' as const : sOut.length ? 'outside Cocoa' as const : null, area: sArea.length > 0 };
  const w = waste[0]?.attributes;
  // The service-line record is matched by street address, not by distance, so a neighbour's record is never shown.
  const mine = norm(text(lot.properties.PHY_ADDR1));
  const l = mine ? lcrr.find(h => norm(text(h.attributes.locationaddress)) === mine)?.attributes : undefined;
  const inCity = city.length > 0;
  if (!inCity && !water.access && !sewer.access && !water.area && !sewer.area && !w && !l) return null;
  return {
    inCity, water, sewer,
    waste: w ? { trash: text(w.Trash_DOW), recycle: day(w.Recycle_DOW), yard: day(w.ContYardWaste_DOW), bulk: day(w.YardBulkWaste), address: text(w.ServiceAddress) } : null,
    serviceLine: l ? { customer: text(l.current_lcr_custstatus), utility: text(l.current_lcr_sysstatus), address: text(l.locationaddress) } : null,
  };
}
