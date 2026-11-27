import { FL_COUNTIES, priceFromStamps, type LotFeature } from './lots';

/** One sale-bearing record from a county's open GIS: a point (the parcel, or one sale) and its sales. */
interface Rec { x: number; y: number; sales: { ms: number; price: number }[] }
export interface CountySale { ms: number; price: number }

const env = (b: [number, number, number, number]) => ({ geometry: b.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outSR: '4326', f: 'json' });
const ymdMs = (v: unknown) => { const m = String(v ?? '').trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : 0; };
const num = (v: unknown) => Number(v) || 0;

type Raw = { a: Record<string, unknown>; x: number; y: number };
/** Area centroid of the biggest ring (falls back to the average of its vertices). */
function centroid(rings: number[][][]): [number, number] {
  const ring = rings.reduce((b, r) => (r.length > b.length ? r : b), rings[0] || []);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[i + 1], c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
  if (Math.abs(a) < 1e-18) { const n = ring.length || 1; return [ring.reduce((t, p) => t + p[0], 0) / n, ring.reduce((t, p) => t + p[1], 0) / n]; }
  return [cx / (3 * a), cy / (3 * a)];
}
async function pull(url: string, b: [number, number, number, number], outFields: string, kind: 'poly' | 'point', signal?: AbortSignal): Promise<Raw[]> {
  const body = new URLSearchParams({ ...env(b), outFields, returnGeometry: 'true', resultRecordCount: '2000', ...(kind === 'poly' ? { maxAllowableOffset: '0.00005' } : {}) });
  const r = await fetch(`${url}?${body}`, { signal });
  if (!r.ok) return [];
  const d = await r.json();
  return (d.features || []).map((f: { attributes: Record<string, unknown>; geometry?: { x?: number; y?: number; rings?: number[][][] } }) => {
    const g = f.geometry; if (!g) return null;
    const [x, y] = kind === 'point' ? [g.x ?? NaN, g.y ?? NaN] : g.rings?.length ? centroid(g.rings) : [NaN, NaN];
    return Number.isFinite(x) && Number.isFinite(y) ? { a: f.attributes, x, y } : null;
  }).filter(Boolean) as Raw[];
}
const dedupe = (s: CountySale[]) => { const seen = new Set<number>(); return s.filter(x => x.ms > 0 && !seen.has(x.ms) && seen.add(x.ms)); };
/** Several rows at the same point (one row per sale) become one record. */
function merge(rows: { x: number; y: number; sale: CountySale }[]): Rec[] {
  const m = new Map<string, Rec>();
  for (const r of rows) { const k = `${r.x.toFixed(6)},${r.y.toFixed(6)}`; const e = m.get(k) || { x: r.x, y: r.y, sales: [] }; e.sales.push(r.sale); m.set(k, e); }
  return [...m.values()];
}
const BROWARD = 'https://services.arcgis.com/JMAJrTsHNLrSsWf5/arcgis/rest/services/PARCEL_POLY_BCPA_TAXROLL/FeatureServer/0/query';
const LEE = 'https://services2.arcgis.com/LvWGAAhHwbCJ2GMP/arcgis/rest/services/Lee_County_Parcels/FeatureServer/0/query';
const MDADE = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_ComparableSales/MapServer/5/query';
const PINELLAS = ['SalesCurrentYear', 'SalesYearMinusOne', 'SalesYearMinusTwo', 'SalesYearMinusThree', 'SalesYearMinusFour'].map(n => `https://egis.pinellas.gov/pcpagis/rest/services/Pcpao_gov/${n}/MapServer/0/query`);
const BAY = 'https://gis.baycountyfl.gov/arcgis/rest/services/Hosted/Parcels/FeatureServer/0/query';
const LEON = [0, 1, 2].map(i => `https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/LCPA_Last3YearsSales_D_WM/MapServer/${i}/query`);
const OKALOOSA = 'https://okgis.myokaloosa.com/arcgis/rest/services/LocalGovernment/AssessmentInformation/MapServer/327/query';
const LATEST: Record<string, string> = {
  'Walton County': 'https://gis11.cama.io/arcgis/rest/services/Walton/WaltonCounty_Thematic2/MapServer/1/query',
  'Washington County': 'https://gis11.cama.io/arcgis/rest/services/Washington/WashingtonCounty_Basemap/MapServer/0/query',
  'Jackson County': 'https://gis2.cama.io/arcgis/rest/services/Jackson/JacksonCounty_Basemap/MapServer/0/query',
  'Suwannee County': 'https://gis2.cama.io/arcgis/rest/services/Suwannee/SuwanneeCounty_Thematic_214/MapServer/1/query' };

/** Counties whose open GIS returns sales for a whole map view (not just one parcel). */
export const BULK_COUNTIES = ['Broward County', 'Lee County', 'Miami-Dade County', 'Pinellas County', 'Bay County', 'Leon County', 'Okaloosa County', ...Object.keys(LATEST)];

async function fetchCounty(county: string, b: [number, number, number, number], signal?: AbortSignal): Promise<Rec[]> {
  const idx = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  if (county === 'Broward County') {
    const rows = await pull(BROWARD, b, idx(5).map(i => `SALE_DATE_${i},STAMP_AMOUNT_${i}`).join(','), 'poly', signal);
    return rows.map(r => ({ x: r.x, y: r.y, sales: dedupe(idx(5).map(i => ({ ms: num(r.a[`SALE_DATE_${i}`]), price: priceFromStamps(r.a[`STAMP_AMOUNT_${i}`]) }))) }));
  }
  if (county === 'Lee County') {
    const rows = await pull(LEE, b, idx(4).map(i => `S_${i}DATE,S_${i}AMOUNT`).join(','), 'poly', signal);
    return rows.map(r => ({ x: r.x, y: r.y, sales: dedupe(idx(4).map(i => ({ ms: num(r.a[`S_${i}DATE`]), price: num(r.a[`S_${i}AMOUNT`]) }))) }));
  }
  if (county === 'Miami-Dade County') {
    const rows = await pull(MDADE, b, idx(3).map(i => `DOS_${i},PRICE_${i}`).join(','), 'point', signal);
    return rows.map(r => ({ x: r.x, y: r.y, sales: dedupe(idx(3).map(i => ({ ms: ymdMs(r.a[`DOS_${i}`]), price: num(r.a[`PRICE_${i}`]) }))) }));
  }
  if (county === 'Pinellas County') {
    const all = (await Promise.all(PINELLAS.map(u => pull(u, b, 'DOS,SALE_PRICE', 'point', signal).catch(() => [] as Raw[])))).flat();
    return merge(all.map(r => ({ x: r.x, y: r.y, sale: { ms: num(r.a.DOS), price: num(r.a.SALE_PRICE) } }))).map(r => ({ ...r, sales: dedupe(r.sales) }));
  }
  if (county === 'Bay County') {
    const rows = await pull(BAY, b, idx(3).map(i => `sale${i}date,sale${i}pradj`).join(','), 'poly', signal);
    return rows.map(r => { const a: Record<string, unknown> = {}; for (const k of Object.keys(r.a)) a[k.toLowerCase()] = r.a[k];
      return { x: r.x, y: r.y, sales: dedupe(idx(3).map(i => ({ ms: ymdMs(a[`sale${i}date`]), price: num(a[`sale${i}pradj`]) }))) }; });
  }
  if (county === 'Leon County') {
    const all = (await Promise.all(LEON.map(u => pull(u, b, 'SALES_SALEDT,SALES_PRICE', 'point', signal).catch(() => [] as Raw[])))).flat();
    return merge(all.map(r => ({ x: r.x, y: r.y, sale: { ms: num(r.a.SALES_SALEDT), price: num(r.a.SALES_PRICE) } }))).map(r => ({ ...r, sales: dedupe(r.sales) }));
  }
  if (county === 'Okaloosa County') {
    const rows = await pull(OKALOOSA, b, idx(3).map(i => `PATPCL_SALE${i},PATPCL_SALEDT${i}`).join(','), 'poly', signal);
    return rows.map(r => ({ x: r.x, y: r.y, sales: dedupe(idx(3).map(i => ({ ms: ymdMs(r.a[`PATPCL_SALEDT${i}`]), price: num(r.a[`PATPCL_SALE${i}`]) }))) }));
  }
  const url = LATEST[county];
  if (url) {
    const rows = await pull(url, b, 'dos,price', 'poly', signal);
    return rows.map(r => ({ x: r.x, y: r.y, sales: dedupe([{ ms: ymdMs(r.a.dos), price: num(r.a.price) }]) }));
  }
  return [];
}

type Ring = number[][];
function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polysOf(f: LotFeature): Ring[][] {
  const g = f.geometry;
  return !g ? [] : g.type === 'Polygon' ? [g.coordinates as Ring[]] : g.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : [];
}

/** Sales from the counties' own GIS for the lots in view, keyed by index into `lots`. Counties without bulk data are skipped. */
export async function countySalesForLots(lots: LotFeature[], b: [number, number, number, number], signal?: AbortSignal): Promise<Map<number, CountySale[]>> {
  const out = new Map<number, CountySale[]>();
  const counties = new Set<string>();
  for (const f of lots) { const co = Number((f.properties as Record<string, unknown>)?.CO_NO); if (co >= 11 && co <= 77) counties.add(`${FL_COUNTIES[co - 11]} County`); }
  const wanted = [...counties].filter(c => BULK_COUNTIES.includes(c));
  if (!wanted.length) return out;
  // A coarse grid over the lots' bounding boxes, so each county record is only tested against nearby lots.
  const CELL = 0.0005, grid = new Map<string, number[]>(), boxes: number[][] = [];
  lots.forEach((f, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of polysOf(f)) for (const [x, y] of poly[0] || []) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    boxes[i] = [x0, y0, x1, y1];
    if (!Number.isFinite(x0)) return;
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
      const k = `${cx},${cy}`; (grid.get(k) || grid.set(k, []).get(k)!).push(i);
    }
  });
  const locate = (x: number, y: number) => {
    for (const i of grid.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) || []) {
      const bx = boxes[i]; if (x < bx[0] || x > bx[2] || y < bx[1] || y > bx[3]) continue;
      for (const poly of polysOf(lots[i])) if (poly[0] && inRing(x, y, poly[0]) && !poly.slice(1).some(h => inRing(x, y, h))) return i;
    }
    return -1;
  };
  const results = await Promise.all(wanted.map(c => fetchCounty(c, b, signal).catch(() => [] as Rec[])));
  for (const recs of results) for (const r of recs) {
    if (!r.sales.length) continue;
    const i = locate(r.x, r.y); if (i < 0) continue;
    out.set(i, dedupe([...(out.get(i) || []), ...r.sales]));
  }
  return out;
}
