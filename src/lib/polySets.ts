import { CO_BOUNDS, PUD } from './collier';
import { HI_BOUNDS, HI_TAX, HI_WW } from './highlands';
import { LK_BOUNDS, LK_WS } from './lakeCounty';
import { SR_BOUNDS, SR_FRANCHISE, SCU_FORCE, SCU_GRAV, SCU_WATER, VENICE } from './sarasota';
import { DAV_BOUNDS, DAV_FORCE, DAV_GRAV, PCU, PO_BOUNDS, TOHO } from './polkOsceola';
import { HC_POTABLE, PASCO_WATER, TAMPA, TB_BOUNDS } from './tampaBay';
import { EPA_URL } from './epaWater';
import { HD_MSBU, HG_BOUNDS, IR_BOUNDS, IR_S2S, PU_BOUNDS, PU_MAINS, RURAL_BOUNDS, SJ_WATER, VB_STEP, VB_WATER } from './ruralFl';
import type { VectorLayer } from './utilGeo';

/** Service-area polygon overlays drawn as vectors for the map view (one per layer id). `cat` picks the colour key for each feature. */
export interface PolySet { id: string; group: string; label: string; url: string; bounds: [number, number, number, number]; colors: Record<string, string>; cat: (p: Record<string, unknown>) => string; swatch: string }
const one = (k: string) => () => k;
export const POLY_GROUPS: { id: string; label: string; note: string }[] = [
  { id: 'collier', label: 'Collier County utility areas', note: 'Collier County Public Utilities and city boundaries. Service areas only: the county publishes no pipe maps. Golden Gate Estates outside the district is on wells and septic. Zoom in.' },
  { id: 'highlands', label: 'Highlands County utility areas', note: 'Highlands County GIS. Sewer service areas and special taxing districts (extra assessments) only: no water areas or pipe maps are public. Zoom in.' },
  { id: 'sarasota', label: 'Sarasota County utilities (Venice, Englewood)', note: 'Sarasota County Utilities lines (zoom in), utility franchise areas, and the City of Venice’s water, sewer and reclaimed mains. Outside North Port.' },
  { id: 'polkosceola', label: 'Polk / Osceola utilities (Poinciana, Haines City)', note: 'Toho Water Authority areas and Polk County Utilities service areas, plus Davenport sewer mains. Neither Toho nor Polk publishes pipe maps.' },
  { id: 'tampabay', label: 'Pasco / Hillsborough utilities (Tampa area)', note: 'Pasco and Hillsborough water service areas, and the City of Tampa’s sewer mains, hydrants and service areas. Zoom in.' },
  { id: 'indianriver', label: 'Indian River County (Sebastian, Vero Beach)', note: 'Septic-to-sewer projects (Indian River County Utilities), City of Vero Beach water area and STEP sewer mains. The county publishes no water or sewer pipe maps. Zoom in.' },
  { id: 'putnam', label: 'Putnam County water mains (Palatka)', note: 'Putnam County GIS water mains cover only the Palatka area. Elsewhere in the county (Interlachen, Florida Highlands) lots rely on wells and septic. Zoom in.' },
  { id: 'hendry', label: 'Hendry County assessment districts', note: 'Hendry County MSBU and special districts (lighting, drainage, roads). Hendry, Glades, Okeechobee, DeSoto, Levy and Sumter publish no utility maps. Zoom in.' },
  { id: 'ruralwater', label: 'Public water system areas (rural counties)', note: 'EPA community water system areas (Okeechobee, Hendry, Glades, DeSoto, Levy, Sumter) and St. Johns River WMD water supply areas (Putnam, Indian River). Approximate: partly modeled. Zoom in.' },
  { id: 'lake', label: 'Lake County water areas', note: 'Lake County GIS water service areas (cities and private utilities). No pipe maps or sewer areas are public. Zoom in.' },
];
export const POLY_SETS: PolySet[] = [
  { id: 'co-ws', group: 'collier', label: 'County water-sewer district', url: `${PUD}/WaterServiceArea/FeatureServer/0`, bounds: CO_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'co-ww', group: 'collier', label: 'Wastewater service area (north / south)', url: `${PUD}/WastewaterServiceAreaNS/FeatureServer/0`, bounds: CO_BOUNDS, colors: { NORTH: '#734c00', SOUTH: '#c98a4b', other: '#9aa39a' }, cat: p => String(p.AreaName || 'other').toUpperCase(), swatch: '#734c00' },
  { id: 'co-city', group: 'collier', label: 'City utilities (Naples, Marco Island, Golden Gate City)', url: `${PUD}/CityUtilityBoundaries/FeatureServer/0`, bounds: CO_BOUNDS, colors: { a: '#8e44ad' }, cat: one('a'), swatch: '#8e44ad' },
  { id: 'hi-ww', group: 'highlands', label: 'Sewer service areas', url: HI_WW, bounds: HI_BOUNDS, colors: { a: '#734c00' }, cat: one('a'), swatch: '#734c00' },
  { id: 'hi-tax', group: 'highlands', label: 'Special taxing districts (assessments)', url: HI_TAX, bounds: HI_BOUNDS, colors: { a: '#d62828' }, cat: one('a'), swatch: '#d62828' },
  { id: 'sr-fran', group: 'sarasota', label: 'Utility franchise areas', url: SR_FRANCHISE, bounds: SR_BOUNDS, colors: { a: '#8e44ad' }, cat: one('a'), swatch: '#8e44ad' },
  { id: 'po-wrf', group: 'polkosceola', label: 'Toho wastewater collection areas', url: `${TOHO}/10`, bounds: PO_BOUNDS, colors: { a: '#734c00' }, cat: one('a'), swatch: '#734c00' },
  { id: 'po-dist', group: 'polkosceola', label: 'Toho operating districts (incl. FGUA Poinciana)', url: `${TOHO}/14`, bounds: PO_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'po-rec', group: 'polkosceola', label: 'Toho reclaimed water areas', url: `${TOHO}/9`, bounds: PO_BOUNDS, colors: { a: '#00a884' }, cat: one('a'), swatch: '#00a884' },
  { id: 'tb-pasco', group: 'tampabay', label: 'Pasco water service areas', url: PASCO_WATER, bounds: TB_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'tb-hc', group: 'tampabay', label: 'Hillsborough County potable water areas', url: HC_POTABLE, bounds: TB_BOUNDS, colors: { a: '#00a884' }, cat: one('a'), swatch: '#00a884' },
  { id: 'tb-tw', group: 'tampabay', label: 'Tampa / county water service areas', url: `${TAMPA}/UtilityWater/MapServer/1`, bounds: TB_BOUNDS, colors: { a: '#7fb3e6' }, cat: one('a'), swatch: '#7fb3e6' },
  { id: 'tb-ts', group: 'tampabay', label: 'Tampa / county sewer service areas', url: `${TAMPA}/UtilitySewer/MapServer/7`, bounds: TB_BOUNDS, colors: { a: '#d9b38c' }, cat: one('a'), swatch: '#d9b38c' },
  { id: 'ir-s2s', group: 'indianriver', label: 'Septic-to-sewer projects (by status)', url: IR_S2S, bounds: IR_BOUNDS, colors: { Operational: '#3aa30a', 'In Construction': '#e8a200', Planned: '#7fb3e6', 'Grant awarded': '#7fb3e6' }, cat: p => String(p.Status || ''), swatch: '#3aa30a' },
  { id: 'ir-vw', group: 'indianriver', label: 'City of Vero Beach water service area', url: VB_WATER, bounds: IR_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'hd-msbu', group: 'hendry', label: 'MSBU and special districts', url: HD_MSBU, bounds: HG_BOUNDS, colors: { a: '#d62828' }, cat: one('a'), swatch: '#d62828' },
  { id: 'rw-sj', group: 'ruralwater', label: 'SJRWMD water supply areas (Putnam, Indian River)', url: SJ_WATER, bounds: [-82.0, 27.5, -80.3, 29.95], colors: { a: '#4aa3df' }, cat: one('a'), swatch: '#4aa3df' },
  { id: 'rw-epa', group: 'ruralwater', label: 'EPA water system areas', url: EPA_URL, bounds: RURAL_BOUNDS, colors: { a: '#00a884' }, cat: one('a'), swatch: '#00a884' },
  { id: 'lk-ws', group: 'lake', label: 'Water service areas', url: LK_WS, bounds: LK_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
];

/** Raster overlays from ArcGIS MapServer export. */
export interface RasterSet { id: string; group: string; label: string; tiles: string; bounds: [number, number, number, number]; attribution: string; opacity: number; swatch: string }
const exp = (base: string, layers: string) => `${base}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${layers}&f=image`;
export const RASTER_SETS: RasterSet[] = [
  { id: 'sr-vw', group: 'sarasota', label: 'Venice water mains', tiles: exp(`${VENICE}/PotableWater/MapServer`, '6'), bounds: SR_BOUNDS, attribution: 'City of Venice GIS', opacity: 0.95, swatch: '#1f6fd1' },
  { id: 'sr-vs', group: 'sarasota', label: 'Venice sewer mains', tiles: exp(`${VENICE}/Sanitary_Sewer/MapServer`, '10,12'), bounds: SR_BOUNDS, attribution: 'City of Venice GIS', opacity: 0.95, swatch: '#b5651d' },
  { id: 'sr-vr', group: 'sarasota', label: 'Venice reclaimed mains', tiles: exp(`${VENICE}/Reclaimed_Water/MapServer`, '9'), bounds: SR_BOUNDS, attribution: 'City of Venice GIS', opacity: 0.95, swatch: '#8e44ad' },
  { id: 'po-pw', group: 'polkosceola', label: 'Polk County Utilities water areas', tiles: exp(PCU, '3'), bounds: PO_BOUNDS, attribution: 'Polk County GIS', opacity: 0.45, swatch: '#4aa3df' },
  { id: 'po-ps', group: 'polkosceola', label: 'Polk County Utilities wastewater areas', tiles: exp(PCU, '2'), bounds: PO_BOUNDS, attribution: 'Polk County GIS', opacity: 0.45, swatch: '#c98a4b' },
  { id: 'tb-sm', group: 'tampabay', label: 'Tampa sewer mains', tiles: exp(`${TAMPA}/UtilitySewer/MapServer`, '5,6'), bounds: TB_BOUNDS, attribution: 'City of Tampa GIS', opacity: 0.95, swatch: '#b5651d' },
  { id: 'tb-th', group: 'tampabay', label: 'Tampa hydrants', tiles: exp(`${TAMPA}/UtilityWater/MapServer`, '0'), bounds: TB_BOUNDS, attribution: 'City of Tampa GIS', opacity: 0.95, swatch: '#d62828' },
];

/** Line overlays fetched as vectors for the map view (hosted FeatureServer layers). */
export interface VectorSet { id: string; group: string; label: string; layer: VectorLayer; bounds: [number, number, number, number]; minZoom: number; swatch: string }
export const VECTOR_SETS: VectorSet[] = [
  { id: 'sr-sw', group: 'sarasota', label: 'Sarasota County water mains', layer: { id: 'sr-sw', label: '', urls: [SCU_WATER], kind: 'line', color: '#1f6fd1', on: true }, bounds: SR_BOUNDS, minZoom: 15.5, swatch: '#1f6fd1' },
  { id: 'sr-ss', group: 'sarasota', label: 'Sarasota County sewer mains', layer: { id: 'sr-ss', label: '', urls: [SCU_GRAV, SCU_FORCE], kind: 'line', color: '#b5651d', on: true }, bounds: SR_BOUNDS, minZoom: 15.5, swatch: '#b5651d' },
  { id: 'po-dav', group: 'polkosceola', label: 'Davenport sewer mains', layer: { id: 'po-dav', label: '', urls: [DAV_GRAV, DAV_FORCE], kind: 'line', color: '#b5651d', on: true }, bounds: DAV_BOUNDS, minZoom: 14, swatch: '#b5651d' },
];
VECTOR_SETS.push(
  { id: 'ir-step', group: 'indianriver', label: 'Vero Beach STEP sewer mains', layer: { id: 'ir-step', label: '', urls: [VB_STEP], kind: 'line', color: '#b5651d', on: true }, bounds: IR_BOUNDS, minZoom: 14, swatch: '#b5651d' },
  { id: 'pu-wm', group: 'putnam', label: 'Palatka-area water mains', layer: { id: 'pu-wm', label: '', urls: [PU_MAINS], kind: 'line', color: '#1f6fd1', on: true }, bounds: PU_BOUNDS, minZoom: 14, swatch: '#1f6fd1' },
);
export const ALL_SETS: { id: string; group: string; label: string; swatch: string }[] = [...POLY_SETS, ...RASTER_SETS, ...VECTOR_SETS];
