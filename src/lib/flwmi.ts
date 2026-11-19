import { lotCenter, type LotFeature } from './lots';
import { envAround, esriQuery, inBounds, safe, text } from './utilGeo';

/**
 * Florida Water Management Inventory (Florida Department of Health): for every built parcel in the state, whether it is on central sewer or
 * an onsite septic system, and whether it drinks public water or a private well, with a confidence qualifier (Known, Likely, Somewhat likely).
 * Estimates come from utility, local-government and health-department records. Vacant ("not built") parcels carry no value.
 */
const BASE = 'https://maps.floridahealth.gov/server/rest/services/FLWMI';
const LAYER = `${BASE}/FLWMI_Wastewater/MapServer/0`;
export const FL_BOUNDS: [number, number, number, number] = [-87.7, 24.4, -79.8, 31.1];
export interface FlwmiLayer { id: string; label: string; service: string; on: boolean }
export const FLWMI_LAYERS: FlwmiLayer[] = [
  { id: 'ww', label: 'Sewer or septic', service: 'FLWMI_Wastewater', on: true },
  { id: 'dw', label: 'Public water or well', service: 'FLWMI_DrinkingWater', on: false },
];
export const flwmiTiles = (l: FlwmiLayer) =>
  `${BASE}/${l.service}/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:0&f=image`;
/** Legend colours match the Health Department's own map symbols. */
export const FLWMI_LEGEND: Record<string, { color: string; label: string }[]> = {
  ww: [{ color: '#734c00', label: 'Known sewer' }, { color: '#ffaa00', label: 'Likely sewer' }, { color: '#4c7300', label: 'Known septic' }, { color: '#abcd66', label: 'Likely septic' }, { color: '#cd6666', label: 'Conflicting data' }],
  dw: [{ color: '#004da8', label: 'Known public water' }, { color: '#73dfff', label: 'Likely public water' }, { color: '#6400a8', label: 'Known private well' }, { color: '#df73ff', label: 'Likely private well' }],
};

const WW_TEXT: Record<string, string> = { KnownSewer: 'Central sewer (known)', LikelySewer: 'Central sewer (likely)', SWLSewer: 'Central sewer (somewhat likely)',
  KnownSeptic: 'Onsite septic (known)', LikelySeptic: 'Onsite septic (likely)', SWLSeptic: 'Onsite septic (somewhat likely)', UNDT: 'Conflicting data', UNK: 'Unknown, no data', NA: 'Not built' };
const DW_TEXT: Record<string, string> = { KnownPublic: 'Public water (known)', LikelyPublic: 'Public water (likely)', SWLPublic: 'Public water (somewhat likely)',
  KnownWell: 'Private well (known)', LikelyWell: 'Private well (likely)', SWLWell: 'Private well (somewhat likely)', UNDT: 'Conflicting data', UNK: 'Unknown, no data', NA: 'Not built' };

export interface FlwmiOwn { sewer: string; water: string; built: boolean; sewerSource: string; waterSource: string }
export interface FlwmiNearby { built: number; sewer: number; septic: number; publicWater: number; well: number }
export interface Flwmi { own: FlwmiOwn | null; nearby: FlwmiNearby; city: string }
/** Keep the source only when it names a utility or government record, not a permit number. */
const clean = (s: string) => {
  const t = s.replace(/\s+/g, ' ').replace(/AppDt:.*$/i, '').trim();
  return !t || /^(not built|no data|unknown)$/i.test(t) || /EHDConst|OSTDS|PointAddress|^\d{2}-[A-Z]{2}-/.test(t) || !/utilit|county|city|palm coast|wwtf|pws|water|sewer|study/i.test(t) ? '' : t;
};

/** Sewer/septic and water/well facts for a parcel and the built parcels around it, or null outside Florida. */
export async function flwmiAt(lot: LotFeature): Promise<Flwmi | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, FL_BOUNDS)) return null;
  const fields = 'PARCELNO,PHY_CITY,WW,DW,BLT_STATUS,WW_SRC_NAME,DW_SRC_NAME';
  const [own, around] = await Promise.all([
    safe(esriQuery(LAYER, { x: c[0], y: c[1] }, 'esriGeometryPoint', fields), []),
    safe(esriQuery(LAYER, envAround(c, 450), 'esriGeometryEnvelope', fields), []),
  ]);
  const o = own[0]?.attributes;
  const ownNo = o ? text(o.PARCELNO) : '';
  const nearby: FlwmiNearby = { built: 0, sewer: 0, septic: 0, publicWater: 0, well: 0 };
  const cities = new Map<string, number>();
  for (const h of around) {
    const a = h.attributes; if (ownNo && text(a.PARCELNO) === ownNo) continue;
    const city = text(a.PHY_CITY); if (city) cities.set(city, (cities.get(city) || 0) + 1);
    if (text(a.BLT_STATUS) !== 'BLT') continue;
    nearby.built++;
    const ww = text(a.WW), dw = text(a.DW);
    if (/Sewer$/.test(ww)) nearby.sewer++; else if (/Septic$/.test(ww)) nearby.septic++;
    if (/Public$/.test(dw)) nearby.publicWater++; else if (/Well$/.test(dw)) nearby.well++;
  }
  const city = (o && text(o.PHY_CITY)) || [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  if (!o && !nearby.built) return null;
  return { own: o ? { sewer: WW_TEXT[text(o.WW)] || text(o.WW), water: DW_TEXT[text(o.DW)] || text(o.DW), built: text(o.BLT_STATUS) === 'BLT',
    sewerSource: clean(text(o.WW_SRC_NAME)), waterSource: clean(text(o.DW_SRC_NAME)) } : null, nearby, city };
}
