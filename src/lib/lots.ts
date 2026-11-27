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

const LIGHT = 'OBJECTID,PARCEL_ID,PHY_ADDR1,CO_NO,SALE_PRC1,SALE_YR1,SALE_MO1,SALE_PRC2,SALE_YR2,SALE_MO2';
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

// ---------- Parcel outlines for the map view ----------
// The statewide layer is hosted on a shared server that can take 20–60 s (or time out) when it is busy, so the view is
// loaded as a grid of small cells: each cell asks for simplified outlines (≈20 cm tolerance, 6 decimals — about a quarter
// of the full size), is remembered once loaded so panning back costs nothing, keeps loading when the view moves on, and
// falls back to the county appraiser's own parcel server when the statewide one is slow or down.
const CELL = 0.01;                    // ≈1 km grid cell
const CELL_TIMEOUT_MS = 9000;         // then try the county's own server
const MAX_CELLS = 240;                // remembered cells (oldest dropped first)
const LIGHT_GEOMETRY = { geometryPrecision: '6', maxAllowableOffset: '0.000002' };
type Cell = { features: LotFeature[]; source: 'state' | 'county' | 'none' };
const cells = new Map<string, Cell>();
const inflight = new Map<string, Promise<Cell>>();

type CountyLayer = { co: number; name: string; url: string; box: [number, number, number, number]; id: string; addr?: string; page?: number };
/** County appraiser parcel layers that publish polygons, used when the statewide layer is slow or down. */
const COUNTY_LAYERS: CountyLayer[] = [
  { co: 16, name: 'Broward', url: BROWARD_PARCELS(), box: [-80.89, 25.95, -80.03, 26.35], id: 'FOLIO', addr: 'ADDRESS_LINE_1' },
  { co: 23, name: 'Miami-Dade', url: 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/26/query', box: [-80.89, 25.13, -80.11, 25.98], id: 'FOLIO', addr: 'TRUE_SITE_ADDR' },
  { co: 39, name: 'Hillsborough', url: 'https://gis.hcpafl.org/arcgis/rest/services/Webmaps/HillsboroughFL_WebParcels/MapServer/0/query', box: [-82.66, 27.56, -82.05, 28.18], id: 'folio', addr: 'FullAddress' },
  { co: 62, name: 'Pinellas', url: 'https://egis.pinellas.gov/gis/rest/services/PublicWebGIS/Parcels/MapServer/1/query', box: [-82.87, 27.60, -82.53, 28.18], id: 'PARCELID', addr: 'SITE_ADDRESS' },
  { co: 46, name: 'Lee', url: 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0/query', box: [-82.28, 26.31, -81.56, 26.79], id: 'STRAP', addr: 'SITEADDR' },
  { co: 66, name: 'St. Lucie', url: 'https://slcgis.stlucieco.gov/hosting/rest/services/Property/ParcelsPublicData/MapServer/0/query', box: [-80.68, 27.20, -80.28, 27.56], id: 'ParcelID' },
  { co: 68, name: 'Sarasota', url: 'https://services3.arcgis.com/icrWMv7eBkctFu1f/arcgis/rest/services/Final_2026_Parcels/FeatureServer/36/query', box: [-82.66, 26.94, -82.05, 27.40], id: 'PID' },
  { co: 60, name: 'Palm Beach', url: 'https://services1.arcgis.com/ZWOoUZbtaYePLlPw/arcgis/rest/services/Parcels_and_Property_Details_WebMercator/FeatureServer/0/query', box: [-80.89, 26.32, -80.03, 26.98], id: 'PARID', addr: 'SITE_ADDR_STR', page: 2000 },
  { co: 58, name: 'Orange', url: 'https://vgispublic.ocpafl.org/server/rest/services/DYNAMIC/Dynamic_Layers/MapServer/10/query', box: [-81.66, 28.34, -80.86, 28.79], id: 'PARCEL', addr: 'SITUS', page: 1000 },
  // Charlotte County (co 18) has no countywide parcel layer on its public ArcGIS Online account, and its own GIS
  // server (agis*.charlottecountyfl.gov) was unreachable on 2026-11-26, so it has no fallback yet.
];
function BROWARD_PARCELS() { return 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0/query'; }

const overlaps = (a: number[], b: number[]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function countyCell(box: number[]): Promise<LotFeature[] | null> {
  const layers = COUNTY_LAYERS.filter(l => overlaps(l.box, box));
  if (!layers.length) return null;
  const parts = await Promise.all(layers.map(async l => {
    const t = withTimeout(CELL_TIMEOUT_MS);
    try {
      // Dense blocks can exceed the server's per-request cap, so page through (up to 4 pages).
      const got: LotFeature[] = [];
      for (let pageNo = 0; pageNo < 4; pageNo++) {
        const body = new URLSearchParams({ geometry: box.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
          returnGeometry: 'true', outFields: [l.id, l.addr].filter(Boolean).join(','), outSR: '4326', f: 'geojson', ...LIGHT_GEOMETRY,
          ...(l.page ? { resultRecordCount: String(l.page), resultOffset: String(pageNo * l.page), orderByFields: 'OBJECTID' } : {}) });
        const r = await fetch(l.url, { method: 'POST', body, signal: t.signal });
        if (!r.ok) { if (pageNo === 0) return null; break; }
        const data = await r.json();
        if (data.error || !Array.isArray(data.features)) { if (pageNo === 0) return null; break; }
        got.push(...data.features);
        if (!l.page || data.features.length < l.page) break;
      }
      return got.filter(f => f.geometry).map(f => {
        const p = f.properties as Record<string, unknown>;
        const id = String(p[l.id] ?? '').trim();
        const props: ParcelProps = { NO_LOT: `c${l.co}-${id}`, LABEL: id, PARCEL_ID: id, CO_NO: l.co, PHY_ADDR1: l.addr ? String(p[l.addr] ?? '') : '', source: `${l.name} County Property Appraiser` };
        return { ...f, properties: props };
      });
    } catch { return null; } finally { t.done(); }
  }));
  if (parts.every(p => p === null)) return null;
  return parts.flatMap(p => p || []);
}

function loadCell(key: string, box: number[]): Promise<Cell> {
  const have = cells.get(key);
  if (have) { cells.delete(key); cells.set(key, have); return Promise.resolve(have); }   // refresh its age
  const pending = inflight.get(key); if (pending) return pending;
  const job = (async (): Promise<Cell> => {
    const t = withTimeout(CELL_TIMEOUT_MS);
    try {
      const data = await query({ geometry: box.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        returnGeometry: 'true', outFields: LIGHT, resultRecordCount: '2000', ...LIGHT_GEOMETRY }, t.signal);
      return { features: data.features.filter(f => f.geometry) as LotFeature[], source: 'state' };
    } catch {
      const county = await countyCell(box);
      return county ? { features: county, source: 'county' } : { features: [], source: 'none' };
    } finally { t.done(); }
  })().then(cell => {
    inflight.delete(key);
    if (cell.source !== 'none') {           // failures are retried on the next view change
      cells.set(key, cell);
      while (cells.size > MAX_CELLS) cells.delete(cells.keys().next().value as string);
    }
    return cell;
  });
  inflight.set(key, job);
  return job;
}

export type LotsResult = FeatureCollection<Geometry | null, ParcelProps> & { fromCounty: number; missing: number };
/** Parcel outlines covering a map view (grid-cached; cells keep loading in the background even if the view moves on). */
export async function lotsInBounds(bounds: [number, number, number, number], signal?: AbortSignal): Promise<LotsResult> {
  const [w, s, e, n] = bounds;
  const x0 = Math.floor(w / CELL), x1 = Math.floor(e / CELL), y0 = Math.floor(s / CELL), y1 = Math.floor(n / CELL);
  const keys: [string, number[]][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
    keys.push([`${x}:${y}`, [+(x * CELL).toFixed(4), +(y * CELL).toFixed(4), +((x + 1) * CELL).toFixed(4), +((y + 1) * CELL).toFixed(4)]]);
  // Load the cells nearest the centre first, a few at a time, so a busy server is not flooded.
  const cx = (w + e) / 2, cy = (s + n) / 2;
  keys.sort((a, b) => Math.hypot(a[1][0] - cx, a[1][1] - cy) - Math.hypot(b[1][0] - cx, b[1][1] - cy));
  const results: Cell[] = new Array(keys.length);
  let next = 0;
  const worker = async () => { while (next < keys.length && !signal?.aborted) { const i = next++; results[i] = await loadCell(keys[i][0], keys[i][1]); } };
  const abort = new Promise<never>((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
  await Promise.race([Promise.all(Array.from({ length: Math.min(4, keys.length) }, worker)), abort]);
  const seen = new Set<string>(); const features: LotFeature[] = [];
  for (const c of results) for (const f of c.features) { const id = String(f.properties.NO_LOT); if (!seen.has(id)) { seen.add(id); features.push(f); } }
  return { type: 'FeatureCollection', features, fromCounty: results.filter(c => c.source === 'county').length, missing: results.filter(c => c.source === 'none').length };
}

/** A parcel by its "<county no>-<parcel id>" key (as stored on pins). */
export async function lotByParcel(key: string, signal?: AbortSignal): Promise<LotFeature | null> {
  const m = key.match(/^(\d+)-(.+)$/); if (!m) return null;
  const f = (await query({ where: `CO_NO = ${Number(m[1])} AND PARCEL_ID = '${m[2].replace(/'/g, "''")}'`, returnGeometry: 'true' }, signal)).features[0];
  return f?.geometry ? f : null;
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
  'Orange County': 'Orange County Property Appraiser (every sale since 2022, with buyer and seller)',
  'Pinellas County': 'Pinellas County Property Appraiser (every sale since 2022)', 'Miami-Dade County': 'Miami-Dade Property Appraiser (last 3 transfers, with buyer and seller)',
  'Bay County': 'Bay County Property Appraiser (last 3 deeds)', 'Leon County': 'Leon County Property Appraiser (every sale since January 2024, with buyer and seller)',
  'Okaloosa County': 'Okaloosa County Property Appraiser (latest 3 sales)', 'Walton County': 'Walton County Property Appraiser (latest sale only)',
  'Washington County': 'Washington County Property Appraiser (latest sale only)', 'Jackson County': 'Jackson County Property Appraiser (latest sale only)',
  'Suwannee County': 'Suwannee County Property Appraiser (latest sale only)' };
const BROWARD = 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0/query';
const LEE = 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0/query';
const ORANGE = 'https://vgispublic.ocpafl.org/server/rest/services/DYNAMIC/Dynamic_Layers/MapServer/14/query';
const MDADE = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_ComparableSales/MapServer/5/query';
const PINELLAS_SALES = ['SalesCurrentYear', 'SalesYearMinusOne', 'SalesYearMinusTwo', 'SalesYearMinusThree', 'SalesYearMinusFour']
  .map(n => `https://egis.pinellas.gov/pcpagis/rest/services/Pcpao_gov/${n}/MapServer/0/query`);
const BAY = 'https://gis.baycountyfl.gov/arcgis/rest/services/Hosted/Parcels/FeatureServer/0/query';
const LEON_SALES = [0, 1, 2].map(i => `https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/LCPA_Last3YearsSales_D_WM/MapServer/${i}/query`);
const OKALOOSA = 'https://okgis.myokaloosa.com/arcgis/rest/services/LocalGovernment/AssessmentInformation/MapServer/327/query';
/** Counties whose open GIS carries only the latest sale (date `dos`, price `price`). */
const LATEST_ONLY: Record<string, string> = {
  'Walton County': 'https://gis11.cama.io/arcgis/rest/services/Walton/WaltonCounty_Thematic2/MapServer/1/query',
  'Washington County': 'https://gis11.cama.io/arcgis/rest/services/Washington/WashingtonCounty_Basemap/MapServer/0/query',
  'Jackson County': 'https://gis2.cama.io/arcgis/rest/services/Jackson/JacksonCounty_Basemap/MapServer/0/query',
  'Suwannee County': 'https://gis2.cama.io/arcgis/rest/services/Suwannee/SuwanneeCounty_Thematic_214/MapServer/1/query' };
/** Like arc(), but keeps each feature's point so the nearest one can be chosen (point layers hold one point per parcel or sale). */
async function arcPts(url: string, params: Record<string, string>) {
  const r = await fetch(`${url}?${new URLSearchParams({ returnGeometry: 'true', outSR: '4326', f: 'json', ...params })}`);
  const d = await r.json();
  return (d.features || []).map((f: { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number } }) => ({ a: f.attributes, x: f.geometry?.x ?? NaN, y: f.geometry?.y ?? NaN }));
}
const nearestTo = <T extends { x: number; y: number }>(rows: T[], [lng, lat]: [number, number]) =>
  rows.length ? rows.reduce((b, r) => (r.x - lng) ** 2 + (r.y - lat) ** 2 < (b.x - lng) ** 2 + (b.y - lat) ** 2 ? r : b) : null;
/** 'YYYYMMDD' / 'YYYY-MM-DD' (string or number) to epoch-ms (UTC). */
const ymdMs = (v: unknown) => { const m = String(v ?? '').trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
const text = (v: unknown) => { const x = v == null ? '' : String(v).trim(); return x && x !== '0' && x !== 'N_A' ? x : null; };
const byDateDesc = (list: Sale[]) => list.sort((a, b) => b.year - a.year || (b.month || 0) - (a.month || 0) || (b.day || 0) - (a.day || 0));
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
  if (unit.county === 'Miami-Dade County' && center) {
    const rows = await arcPts(MDADE, { ...at(center), distance: '25', units: 'esriSRUnit_Meter', outFields: '*' });
    const id = (unit.sbl || '').replace(/\D/g, '');
    const row = rows.find((r: { a: Record<string, unknown> }) => String(r.a.FOLIO) === id) || nearestTo(rows, center);
    if (!row) return null;
    const a = row.a;
    return byDateDesc([1, 2, 3].map(i => { const ms = ymdMs(a[`DOS_${i}`]); return ms === null ? null : dated(ms, n(a[`PRICE_${i}`]), { book: text(a[`OR_BK_${i}`]), page: text(a[`OR_PG_${i}`]),
      qualified: a[`QU_FLG_${i}`] === 'Q', code: text(a[`QU_FLG_${i}`]) || '', vacant: a[`VI_${i}`] === 'V', seller: text(a[`GRANTOR_${i}`]), buyer: text(a[`GRANTEE_${i}`]) }); }).filter(Boolean) as Sale[]);
  }
  if (unit.county === 'Pinellas County' && center) {
    // One point per sale, one layer per calendar year (this year and the four before). Pick the parcel (STRAP) nearest the lot, then merge its sales.
    const all = (await Promise.all(PINELLAS_SALES.map(u => arcPts(u, { ...at(center), distance: '15', units: 'esriSRUnit_Meter', outFields: 'STRAP,DOS,SALE_PRICE,QUALIFIED_FLG' }).catch(() => [])))).flat();
    const near = nearestTo(all, center);
    if (!near) return [];
    const seen = new Set<string>();
    return byDateDesc(all.filter((r: { a: Record<string, unknown> }) => r.a.STRAP === near.a.STRAP).map((r: { a: Record<string, unknown> }) => dated(r.a.DOS, n(r.a.SALE_PRICE), { qualified: String(r.a.QUALIFIED_FLG || '').toUpperCase().startsWith('Q'), code: text(r.a.QUALIFIED_FLG) || '' }))
      .filter((x: Sale | null): x is Sale => { if (!x) return false; const k = `${x.date}|${x.price}`; if (seen.has(k)) return false; seen.add(k); return true; }));
  }
  if (unit.county === 'Bay County' && center) {
    const rec = (await arc(BAY, { ...at(center), outFields: '*' }))[0];
    if (!rec) return null;
    const a: Record<string, unknown> = {}; for (const k of Object.keys(rec)) a[k.toLowerCase()] = rec[k]; // field-name case differs between Bay's services
    return byDateDesc([1, 2, 3].map(i => {
      const ms = ymdMs(a[`sale${i}date`]); if (ms === null) return null;
      const inst = String(a[`sale${i}inst`] || ''), m = inst.match(/ORB-(\d+)\s+PG-(\d+)\s*([A-Z]{2})?/), qv = String(a[`sale${i}qu_vi`] || '');
      return dated(ms, n(a[`sale${i}pradj`]), { book: m?.[1] || null, page: m?.[2] || null, deed: m?.[3] || null, qualified: qv.trim().startsWith('Q'), code: qv.trim()[0] || '', vacant: /V\s*$/.test(qv) });
    }).filter(Boolean) as Sale[]);
  }
  if (unit.county === 'Leon County' && unit.sbl) {
    // One row per sale in three yearly layers (2024 on); the sales are keyed by the same parcel id as the state roll.
    const rows = (await Promise.all(LEON_SALES.map(u => arc(u, { where: `SALES_PARID='${unit.sbl!.replace(/'/g, "''")}'`, outFields: '*' }).catch(() => [])))).flat();
    return byDateDesc(rows.map(a => dated(a.SALES_SALEDT, n(a.SALES_PRICE), { deed: text(a.SALES_INSTRTYP), book: text(a.SALES_BOOK), page: text(a.SALES_PAGE), seller: text(a.SALES_OLDOWN), buyer: text(a.SALES_OWN1),
      vacant: a.SALES_SALETYPE === 'V', qualified: true })).filter(Boolean) as Sale[]);
  }
  if (unit.county === 'Okaloosa County' && center) {
    const a = (await arc(OKALOOSA, { ...at(center), outFields: 'PATPCL_SALE1,PATPCL_SALEDT1,PATPCL_QUAL1,PATPCL_SALE2,PATPCL_SALEDT2,PATPCL_SALE3,PATPCL_SALEDT3' }))[0];
    if (!a) return null;
    return byDateDesc([1, 2, 3].map(i => { const ms = ymdMs(a[`PATPCL_SALEDT${i}`]); return ms === null ? null : dated(ms, n(a[`PATPCL_SALE${i}`]), i === 1 ? { qualified: a.PATPCL_QUAL1 === 'Q', code: text(a.PATPCL_QUAL1) || '' } : {}); }).filter(Boolean) as Sale[]);
  }
  const latest = unit.county ? LATEST_ONLY[unit.county] : undefined;
  if (latest && center) {
    const a = (await arc(latest, { ...at(center), outFields: 'dos,price' }))[0];
    const ms = a ? ymdMs(a.dos) : null;
    return ms === null ? null : [dated(ms, n(a!.price), {})!];
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

/** A point inside the parcel for a pin: the bounding-box centre when it falls inside the lot, otherwise the middle of the widest
 *  stretch of lot along a few horizontal lines (L-shaped, curved and flag lots have their box centre outside the lot). */
export function lotPinPoint(feature: LotFeature): [number, number] | null {
  const c = lotCenter(feature); if (!c) return null;
  const polys = polygons(feature);
  if (!polys.length || inLot(c, polys)) return c;
  const ys = polys.flatMap(p => p[0].map(q => q[1])), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best: { x: number; y: number; w: number } | null = null;
  for (let k = 1; k < 12; k++) {
    const y = y0 + (y1 - y0) * k / 12, xs: number[] = [];
    for (const poly of polys) for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) { const w = xs[i + 1] - xs[i]; if (!best || w > best.w) best = { x: (xs[i] + xs[i + 1]) / 2, y, w }; }
  }
  return best && inLot([best.x, best.y], polys) ? [best.x, best.y] : c;
}

/** Is the point inside the lot drawing? */
export const pointInLot = (feature: LotFeature, point: [number, number]) => inLot(point, polygons(feature));

/** The parcel a pin belongs to. Townhouse and condo lots sit on top of their community's common-area tract, so among parcels
 *  within ~4 m of the point the smallest one wins (the unit, not the master tract). Otherwise the usual parcel-at-point lookup. */
export async function pinParcelAt([lng, lat]: [number, number], signal?: AbortSignal): Promise<LotFeature | null> {
  const r = 0.00012; // ~13 m
  const near = (await query({ geometry: [lng - r, lat - r * 0.9, lng + r, lat + r * 0.9].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true' }, signal)).features.filter(f => f.geometry);
  const kx = Math.cos(lat * Math.PI / 180), M = 111320; // metres per degree of latitude
  const metres = (f: LotFeature) => {
    const polys = polygons(f);
    if (inLot([lng, lat], polys)) return 0;
    return Math.sqrt(Math.min(...polys.flatMap(poly => poly[0].slice(1).map((b, i) => {
      const a = poly[0][i], dx = (b[0] - a[0]) * kx, dy = b[1] - a[1], px = (lng - a[0]) * kx, py = lat - a[1];
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      return (px - t * dx) ** 2 + (py - t * dy) ** 2;
    })))) * M;
  };
  const close = near.map(f => ({ f, d: metres(f), a: lotArea(f) ?? Infinity })).filter(x => x.d <= 4).sort((x, y) => x.a - y.a);
  // The parcel you clicked wins; a smaller one within 4 m only when the clicked one is a big common tract (20× its size or more).
  const inside = close.filter(x => x.d === 0), smallest = close[0];
  const pick = inside[0] && !(smallest && smallest.d > 0 && inside[0].a >= smallest.a * 20) ? inside[0] : smallest;
  return pick?.f || lotAtPoint([lng, lat], signal);
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

export type SaleBand = 's2026' | 's2025' | 'sOlder' | 'none';
const priceText = (price: number) => price <= 100 ? 'Transfer' : price >= 1e6 ? `$${(price / 1e6).toFixed(price >= 1e7 ? 0 : 2).replace(/\.?0+$/, '')}M` : price >= 1000 ? `$${Math.round(price / 1000)}K` : `$${price}`;
/** Year band and short label for a sale: 2026, 2025, or 2024 and older. */
export function bandOfSale(year: number, price: number): { band: SaleBand; text: string; year: number } {
  return { band: year >= 2026 ? 's2026' : year === 2025 ? 's2025' : 'sOlder', text: `${priceText(price)} · ${year}`, year };
}
/** The lot's latest sale on the state roll (SALE_*1 / SALE_*2): its year band for the map colours and a short price label. */
export function saleBandOf(p: Record<string, unknown>, hideTransfers = false): { band: SaleBand; text: string; year: number } {
  const cand = [1, 2].map(i => ({ y: Number(p[`SALE_YR${i}`]) || 0, m: Number(p[`SALE_MO${i}`]) || 0, price: Number(p[`SALE_PRC${i}`]) || 0 }))
    .filter(c => c.y >= 1900 && !(hideTransfers && c.price <= 100)).sort((a, b) => b.y - a.y || b.m - a.m)[0];
  return cand ? bandOfSale(cand.y, cand.price) : { band: 'none', text: '', year: 0 };
}
