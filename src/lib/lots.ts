import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

// Florida Statewide Parcels (Florida DOR tax roll + parcel maps, published by the Florida Geographic Information Office). Queried live.
export const LOT_SERVICE = 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0/query';
export const LOT_MIN_ZOOM = 16;

/** NO_LOT is the layer's record id; LABEL is the county parcel ID shown on the map. */
export type ParcelProps = { NO_LOT: string; LABEL: string; [field: string]: string | number | null };
export type LotFeature = Feature<Geometry | null, ParcelProps>;

export function normalizeLot(_input: string): string {
  return '';
}

const LIGHT = 'OBJECTID,PARCEL_ID';
const cache = new Map<string, LotFeature>();
async function query(params: Record<string, string>, signal?: AbortSignal): Promise<FeatureCollection<Geometry | null, ParcelProps>> {
  const body = new URLSearchParams({ outFields: '*', outSR: '4326', f: 'geojson', ...params });
  const response = await fetch(LOT_SERVICE, { method: 'POST', body, signal });
  if (!response.ok) throw new Error('Parcel service unavailable');
  const data = await response.json();
  if (data.error) throw new Error('Parcel service error');
  for (const f of data.features) {
    const p = f.properties;
    p.NO_LOT = String(p.OBJECTID ?? '');
    p.LABEL = String(p.PARCEL_ID || '');
  }
  return data;
}

export function lotsInBounds(bounds: [number, number, number, number], signal?: AbortSignal) {
  return query({ geometry: bounds.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    returnGeometry: 'true', outFields: LIGHT, resultRecordCount: '2000' }, signal);
}

export async function findLot(input: string, signal?: AbortSignal): Promise<LotFeature | null> {
  const id = Number(input);
  if (!Number.isInteger(id)) return null;
  if (cache.has(input)) return cache.get(input)!;
  const f = (await query({ where: `OBJECTID = ${id}`, returnGeometry: 'true' }, signal)).features[0] || null;
  if (f) cache.set(input, f);
  return f;
}

export function lotCenter(feature: LotFeature): [number, number] | null {
  const g = feature.geometry;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null;
  const rings: Position[] = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap(p => p[0]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function polygons(feature: LotFeature): Position[][][] {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function inRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inLot(point: Position, polys: Position[][][]): boolean {
  return polys.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(h => inRing(point, h)));
}

/** Approximate area of the lot drawing in m² (spherical excess on small polygons). */
export function lotArea(feature: LotFeature): number | null {
  const polys = polygons(feature);
  if (!polys.length) return null;
  const R = 6378137, rad = Math.PI / 180;
  const ringArea = (ring: Position[]) => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      sum += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
    }
    return Math.abs(sum * R * R / 2);
  };
  return polys.reduce((total, [outer, ...holes]) => total + ringArea(outer) - holes.reduce((h, r) => h + ringArea(r), 0), 0);
}

export const SQFT_PER_M2 = 10.7639;

/** Opens Google Street View at the nearest panorama to a point. */
export function streetViewUrl([lng, lat]: [number, number]): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export interface Sale { price: number; year: number; month: number | null; date: string; qualified: boolean; nominal: boolean; code: string; vacant: boolean; book: string | null; page: string | null;
  day?: number | null; deed?: string | null; buyer?: string | null; seller?: string | null; instrument?: string | null }

/** Full sale history from county property appraisers that publish it as open GIS data. */
export const SALES_COUNTIES: Record<string, string> = { 'Broward County': 'Broward County Property Appraiser (last 5 deeds)', 'Lee County': 'Lee County Property Appraiser (last 4 deeds)',
  'Orange County': 'Orange County Property Appraiser (every sale since 2022, with buyer and seller)' };
const BROWARD = 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0/query';
const LEE = 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0/query';
const ORANGE = 'https://vgispublic.ocpafl.org/server/rest/services/DYNAMIC/Dynamic_Layers/MapServer/14/query';
async function arc(url: string, params: Record<string, string>) {
  const r = await fetch(`${url}?${new URLSearchParams({ returnGeometry: 'false', f: 'json', ...params })}`);
  const d = await r.json();
  return (d.features || []).map((f: { attributes: Record<string, unknown> }) => f.attributes) as Record<string, unknown>[];
}
function dated(ms: unknown, price: number, extra: Partial<Sale>): Sale | null {
  if (typeof ms !== 'number' || ms <= 0) return null;
  const d = new Date(ms), year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, day = d.getUTCDate();
  return { price, year, month, day, date: `${MONTHS[month - 1]} ${day}, ${year}`, qualified: false, nominal: price <= 100, code: '', vacant: false, book: null, page: null, ...extra };
}
const at = ([x, y]: [number, number]) => ({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
export async function countySales(unit: Unit, center: [number, number] | null): Promise<Sale[] | null> {
  const s = (v: unknown) => typeof v === 'string' && v.trim() && v.trim() !== '0' ? v.trim() : null;
  const n = (v: unknown) => Number(v) || 0;
  if (unit.county === 'Broward County' && center) {
    const a = (await arc(BROWARD, { ...at(center), outFields: '*' }))[0];
    if (!a) return null;
    return [1, 2, 3, 4, 5].map(i => dated(a[`SALE_DATE_${i}`], n(a[`STAMP_AMOUNT_${i}`]), {
      deed: s(a[`DEED_TYPE_${i}`])?.replace('*', '') || null, book: n(a[`BOOK_${i}`]) ? String(a[`BOOK_${i}`]) : null, page: n(a[`PAGE_${i}`]) ? String(a[`PAGE_${i}`]) : null,
      instrument: n(a[`SALE${i}_CIN`]) ? String(a[`SALE${i}_CIN`]) : null, code: s(a[`SALE${i}_QUAL_CODE`]) || '', qualified: ['01', '02'].includes(String(a[`SALE${i}_QUAL_CODE`] ?? '')) })).filter(Boolean) as Sale[];
  }
  if (unit.county === 'Lee County' && center) {
    const a = (await arc(LEE, { ...at(center), outFields: 'S_1DATE,S_1AMOUNT,S_1VI,S_1TC,S_1OR_NUM,S_2DATE,S_2AMOUNT,S_2VI,S_2TC,S_2OR_NUM,S_3DATE,S_3AMOUNT,S_3VI,S_3TC,S_3OR_NUM,S_4DATE,S_4AMOUNT,S_4VI,S_4TC,S_4OR_NUM' }))[0];
    if (!a) return null;
    return [1, 2, 3, 4].map(i => dated(a[`S_${i}DATE`], n(a[`S_${i}AMOUNT`]), { vacant: a[`S_${i}VI`] === 'V', code: s(a[`S_${i}TC`]) || '', qualified: a[`S_${i}TC`] === '01',
      instrument: s(a[`S_${i}OR_NUM`]) })).filter(Boolean) as Sale[];
  }
  if (unit.county === 'Orange County' && unit.sbl) {
    // The state roll writes Orange parcels section-township-range; the appraiser writes range-township-section.
    const id = unit.sbl.replace(/\D/g, ''), pid = id.slice(4, 6) + id.slice(2, 4) + id.slice(0, 2) + id.slice(6);
    const rows = await arc(ORANGE, { where: `PARCEL='${pid}'`, outFields: 'SALE_DATE,SALE_AMT,DEED_DESCERITION,GRANTOR,GRANTEE,BOOK,PAGE,INSTR_NUM,VAC_IMPR_CODE,SALE_TYPE', orderByFields: 'SALE_DATE DESC' });
    return rows.map(a => dated(a.SALE_DATE, n(a.SALE_AMT), { deed: s(a.DEED_DESCERITION), seller: s(a.GRANTOR), buyer: s(a.GRANTEE), book: s(a.BOOK), page: s(a.PAGE),
      instrument: s(a.INSTR_NUM), vacant: a.VAC_IMPR_CODE === 'V', qualified: true })).filter(Boolean) as Sale[];
  }
  return null;
}

/** Sewer/septic and public water/well for a parcel (Florida Department of Health, Florida Water Management Inventory). */
export interface Infra { sewer: string; water: string; sewerKind: 'sewer' | 'septic' | 'unknown' | 'na'; waterKind: 'public' | 'well' | 'unknown' | 'na'; year: string | null; source: string | null }
const FLWMI = 'https://maps.floridahealth.gov/server/rest/services/FLWMI/FLWMI_Wastewater/MapServer/0/query';
const WW: Record<string, string> = { UNK: 'Unknown, no data', NA: 'Not built', KnownSeptic: 'Known septic tank', KnownSewer: 'Known central sewer', LikelySeptic: 'Likely septic tank',
  LikelySewer: 'Likely central sewer', UNDT: 'Undetermined (conflicting data)', SWLSeptic: 'Somewhat likely septic', SWLSewer: 'Somewhat likely central sewer' };
const DW: Record<string, string> = { UNK: 'Unknown, no data', NA: 'Not built', KnownWell: 'Known private well', KnownPublic: 'Known public water', LikelyWell: 'Likely private well',
  LikelyPublic: 'Likely public water', SWLWell: 'Somewhat likely private well', SWLPublic: 'Somewhat likely public water', UNDT: 'Undetermined (conflicting data)' };
export async function infrastructureAt([x, y]: [number, number]): Promise<Infra | null> {
  const q = new URLSearchParams({ geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'WW,DW,WW_UPD,DW_UPD,WW_SRC_NAME,DW_SRC_NAME', returnGeometry: 'false', f: 'json' });
  const r = await fetch(`${FLWMI}?${q}`);
  const a = (await r.json()).features?.[0]?.attributes;
  if (!a) return null;
  const ww = String(a.WW || 'UNK'), dw = String(a.DW || 'UNK');
  return { sewer: WW[ww] || ww, water: DW[dw] || dw, sewerKind: ww === 'NA' ? 'na' : /Sewer/.test(ww) ? 'sewer' : /Septic/.test(ww) ? 'septic' : 'unknown',
    waterKind: dw === 'NA' ? 'na' : /Public/.test(dw) ? 'public' : /Well/.test(dw) ? 'well' : 'unknown',
    year: [a.WW_UPD, a.DW_UPD].filter(Boolean).sort().pop() || null, source: [a.WW_SRC_NAME, a.DW_SRC_NAME].filter(Boolean).filter((v, i, l) => l.indexOf(v) === i).join(' · ') || null };
}

/** One parcel's tax-roll record as a unit (Florida DOR NAL file fields). */
export interface Unit {
  id: string; label: string; center: [number, number]; use: string | null; category: string | null;
  floors: number | null; dwellings: number | null; builtYear: number | null; landArea: number | null; floorArea: number | null;
  marketDate: string | null; landValue: number | null; buildingValue: number | null; totalValue: number | null; previousValue: number | null;
  frontage: number | null;
  owner?: string | null; ownerMail?: string | null; marketValue?: number | null; propClass?: string | null; school?: string | null;
  county?: string | null; muni?: string | null; swis?: string | null; sbl?: string | null; bbl?: string | null; agDistrict?: string | null;
  utilities?: string | null; bedrooms?: number | null; baths?: number | null;
  zoning?: string | null; overlays?: string | null; special?: string | null; far?: string | null; landmark?: string | null; histDistrict?: string | null;
  depth?: number | null;
  taxableValue?: number | null; homestead?: boolean; legal?: string | null; sales?: Sale[];
  effYear?: number | null; buildings?: number | null; infra?: Infra | null;
}

// Florida DOR county numbers (alphabetical, 11–77).
export const FL_COUNTIES = ['Alachua', 'Baker', 'Bay', 'Bradford', 'Brevard', 'Broward', 'Calhoun', 'Charlotte', 'Citrus', 'Clay', 'Collier', 'Columbia', 'Miami-Dade',
  'DeSoto', 'Dixie', 'Duval', 'Escambia', 'Flagler', 'Franklin', 'Gadsden', 'Gilchrist', 'Glades', 'Gulf', 'Hamilton', 'Hardee', 'Hendry', 'Hernando', 'Highlands',
  'Hillsborough', 'Holmes', 'Indian River', 'Jackson', 'Jefferson', 'Lafayette', 'Lake', 'Lee', 'Leon', 'Levy', 'Liberty', 'Madison', 'Manatee', 'Marion', 'Martin',
  'Monroe', 'Nassau', 'Okaloosa', 'Okeechobee', 'Orange', 'Osceola', 'Palm Beach', 'Pasco', 'Pinellas', 'Polk', 'Putnam', 'St. Johns', 'St. Lucie', 'Santa Rosa',
  'Sarasota', 'Seminole', 'Sumter', 'Suwannee', 'Taylor', 'Union', 'Volusia', 'Wakulla', 'Walton', 'Washington'];
// Florida DOR use codes (common ones; the first digit pair gives the group).
const USE: Record<string, string> = { '000': 'Vacant residential', '001': 'Single family', '002': 'Mobile home', '003': 'Multi-family (10+ units)', '004': 'Condominium',
  '005': 'Co-operative', '006': 'Retirement home', '007': 'Misc. residential', '008': 'Multi-family (2–9 units)', '009': 'Residential common area',
  '010': 'Vacant commercial', '011': 'Store, one story', '012': 'Mixed use store/office/residential', '013': 'Department store', '014': 'Supermarket',
  '015': 'Regional shopping center', '016': 'Community shopping center', '017': 'Office, one story', '018': 'Office, multi-story', '019': 'Professional services',
  '020': 'Airport / marina / terminal', '021': 'Restaurant', '022': 'Drive-in restaurant', '023': 'Financial institution', '026': 'Service station',
  '027': 'Auto sales / repair', '028': 'Parking lot / mobile home park', '039': 'Hotel / motel', '040': 'Vacant industrial', '041': 'Light manufacturing',
  '048': 'Warehouse / distribution', '051': 'Cropland', '060': 'Grazing land', '066': 'Orchard / groves', '070': 'Vacant institutional', '071': 'Church',
  '072': 'Private school', '080': 'Vacant governmental', '082': 'Forest / park / recreation', '083': 'Public school', '086': 'County', '089': 'Municipal',
  '094': 'Right-of-way', '095': 'River / lake / submerged', '099': 'Acreage, non-agricultural' };
const GROUP = (c: string) => Number(c) < 10 ? 'Residential' : Number(c) < 40 ? 'Commercial' : Number(c) < 50 ? 'Industrial' : Number(c) < 70 ? 'Agricultural' : Number(c) < 80 ? 'Institutional' : Number(c) < 90 ? 'Governmental' : 'Miscellaneous';
const num = (v: unknown) => typeof v === 'number' && v > 0 ? v : typeof v === 'string' && Number(v) > 0 ? Number(v) : null;
const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : null;

export function useLabel(code: string | null): string | null {
  if (!code) return null;
  const c = code.padStart(3, '0');
  return `${USE[c] || GROUP(c)} (${c})`;
}

/** The parcel's tax-roll record as a unit (Florida has one roll record per parcel). */
export async function unitsInLot(feature: LotFeature): Promise<Unit[]> {
  const p = feature.properties;
  if (!p || (p.JV == null && p.OWN_NAME == null)) return [];
  const cls = str(p.DOR_UC);
  const land = num(p.LND_VAL), just = num(p.JV);
  const mail = [str(p.OWN_ADDR1), str(p.OWN_ADDR2), [str(p.OWN_CITY), str(p.OWN_STATE)].filter(Boolean).join(', '), str(p.OWN_ZIPCD)].filter(Boolean).join(' ');
  const sales: Sale[] = [1, 2].map(i => ({ price: num(p[`SALE_PRC${i}`]) || 0, year: num(p[`SALE_YR${i}`]), month: num(p[`SALE_MO${i}`]), q: String(p[`QUAL_CD${i}`] ?? '').padStart(2, '0'),
    vi: str(p[`VI_CD${i}`]), book: str(p[`OR_BOOK${i}`]), page: str(p[`OR_PAGE${i}`]) }))
    .filter(x => x.year).map(x => ({ price: x.price, year: x.year!, month: x.month, date: x.month ? `${MONTHS[x.month - 1]} ${x.year}` : String(x.year),
      qualified: x.q === '01' || x.q === '02', nominal: x.price <= 100, code: x.q, vacant: x.vi === 'V', book: x.book, page: x.page }))
    .sort((a, b) => b.year - a.year || (b.month || 0) - (a.month || 0));
  const co = Number(p.CO_NO);
  return [{
    id: `${co}-${p.PARCEL_ID}`, label: [str(p.PHY_ADDR1), str(p.PHY_CITY)].filter(Boolean).join(', ') || p.LABEL, center: lotCenter(feature) || [0, 0],
    use: useLabel(cls), category: null, floors: null, dwellings: num(p.NO_RES_UNT), builtYear: num(p.ACT_YR_BLT), effYear: num(p.EFF_YR_BLT),
    landArea: num(p.LND_SQFOOT) ? num(p.LND_SQFOOT)! / 10.7639 : null, floorArea: num(p.TOT_LVG_AR) ? num(p.TOT_LVG_AR)! / 10.7639 : null,
    marketDate: p.ASMNT_YR ? `${p.ASMNT_YR} tax roll` : null, landValue: land, totalValue: num(p.AV_NSD) || num(p.AV_SD), buildingValue: just !== null && land !== null ? just - land : null,
    previousValue: null, frontage: null, marketValue: just, taxableValue: num(p.TV_NSD) || num(p.TV_SD), homestead: (num(p.JV_HMSTD) || 0) > 0,
    owner: str(p.OWN_NAME), ownerMail: mail || null, propClass: cls, county: co >= 11 && co <= 77 ? `${FL_COUNTIES[co - 11]} County` : null, muni: str(p.PHY_CITY),
    sbl: str(p.PARCEL_ID), legal: str(p.S_LEGAL), sales, buildings: num(p.NO_BULDNG)
  }];
}

export async function unitsByLotNumber(_lot: string): Promise<Unit[] | null> {
  return null;
}

export async function lotAtPoint([lng, lat]: [number, number], signal?: AbortSignal, address = ''): Promise<LotFeature | null> {
  const box = (r: number) => query({ geometry: [lng - r, lat - r * 0.9, lng + r, lat + r * 0.9].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true' }, signal);
  const number = address.match(/^\s*(\d+)/)?.[1] || '';
  const matches = (f: LotFeature) => !!number && String(f.properties.PHY_ADDR1 || '').startsWith(number + ' ');
  const exact = (await query({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true' }, signal))
    .features.filter(f => f.geometry);
  if (exact.length && (!number || exact.some(matches))) return exact.find(matches) || exact[0];
  // Geocoded points often sit on the street: prefer the parcel with the same house number within ~40 m, else the nearest edge.
  const near = (await box(0.0004)).features.filter(f => f.geometry);
  const kx = Math.cos(lat * Math.PI / 180);
  const edge = (f: LotFeature) => Math.min(...polygons(f).flatMap(poly => poly[0].slice(1).map((b, i) => {
    const a = poly[0][i], dx = (b[0] - a[0]) * kx, dy = b[1] - a[1], px = (lng - a[0]) * kx, py = lat - a[1];
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
    return (px - t * dx) ** 2 + (py - t * dy) ** 2;
  })));
  return near.sort((x, y) => Number(matches(y)) - Number(matches(x)) || edge(x) - edge(y))[0] || exact[0] || null;
}

export interface LotEdge { from: [number, number]; to: [number, number]; mid: [number, number]; length: number }
const R_EARTH = 6371008.8;
function dist([x1, y1]: Position, [x2, y2]: Position): number {
  const rad = Math.PI / 180, lat = (y1 + y2) / 2 * rad;
  const dx = (x2 - x1) * rad * Math.cos(lat), dy = (y2 - y1) * rad;
  return Math.sqrt(dx * dx + dy * dy) * R_EARTH;
}
function bearing([x1, y1]: Position, [x2, y2]: Position): number {
  const lat = (y1 + y2) / 2 * Math.PI / 180;
  return Math.atan2(y2 - y1, (x2 - x1) * Math.cos(lat)) * 180 / Math.PI;
}

/**
 * Side lengths of the lot's outer boundary, in metres, as drawn in the cadastre.
 * Consecutive segments that run in nearly the same direction (within 8°) are merged into one side,
 * so a straight lot line drawn with extra vertices reads as a single measurement.
 */
export function lotEdges(feature: LotFeature): LotEdge[] {
  const polys = polygons(feature);
  if (!polys.length) return [];
  // Largest outer ring only (the lot itself, not detached pieces).
  const ring = polys.map(p => p[0]).sort((a, b) => b.length - a.length)[0];
  const pts = ring.slice(0, -1);
  if (pts.length < 3) return [];
  const sides: Position[][] = [];
  let current: Position[] = [pts[0]];
  for (let i = 1; i <= pts.length; i++) {
    const p = pts[i % pts.length];
    if (current.length >= 2) {
      const a = bearing(current[0], current[current.length - 1]), b = bearing(current[current.length - 1], p);
      const diff = Math.abs(((a - b + 540) % 360) - 180);
      if (diff > 8) { sides.push(current); current = [current[current.length - 1]]; }
    }
    current.push(p);
  }
  sides.push(current);
  // The last side may continue straight into the first one.
  if (sides.length > 1) {
    const first = sides[0], last = sides[sides.length - 1];
    const a = bearing(last[0], last[last.length - 1]), b = bearing(first[0], first[first.length - 1]);
    if (Math.abs(((a - b + 540) % 360) - 180) <= 8) { sides[0] = [...last, ...first.slice(1)]; sides.pop(); }
  }
  return sides.map(s => {
    let length = 0;
    for (let i = 1; i < s.length; i++) length += dist(s[i - 1], s[i]);
    const a = s[0] as [number, number], b = s[s.length - 1] as [number, number];
    return { from: a, to: b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number], length };
  }).filter(e => e.length >= 0.5);
}
export const FT_PER_M = 3.28084;
