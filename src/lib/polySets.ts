import { CO_BOUNDS, PUD } from './collier';
import { HI_BOUNDS, HI_TAX, HI_WW } from './highlands';
import { LK_BOUNDS, LK_WS } from './lakeCounty';
import { SR_BOUNDS, SR_FRANCHISE, SCU_FORCE, SCU_GRAV, SCU_WATER, VENICE } from './sarasota';
import { DAV_BOUNDS, DAV_FORCE, DAV_GRAV, PCU, PO_BOUNDS, POIN_BOUNDS, POIN_PROJECTS, TOHO } from './polkOsceola';
import { MN_BOUNDS, MN_BUFFER } from './marion';
import { CH_BOUNDS, CH_MSBU } from './charlotte';
import { PSL_BOUNDS } from './portStLucie';
import { HC_POTABLE, PASCO_S2S_ELIG, PASCO_WATER, TAMPA, TB_BOUNDS } from './tampaBay';
import { EPA_URL } from './epaWater';
import { HD_MSBU, HG_BOUNDS, IR_BOUNDS, IR_S2S, PU_BOUNDS, PU_MAINS, RURAL_BOUNDS, SJ_WATER, VB_STEP, VB_WATER } from './ruralFl';
import { MAN_BOUNDS, MAN_BRADEN, MAN_BRADENTON, MAN_RECLAIM, MAN_SEWER, MAN_SEWER_DISTRICTS, MAN_WATER } from './manatee';
import { MARTIN_BOUNDS, PO_FORCE, PO_GRAVITY, PO_WATER, PORT_ORANGE_BOUNDS, STUART_AREA, VO_AREAS, VO_BOUNDS, voType } from './volusiaMartin';
import { BAY_AREAS, BAY_BOUNDS, BAY_FORCE, BAY_GRAV, BAY_WATER, ECUA_SEWER_EXP, ECUA_WATER, ESC_BOUNDS, SR_BOUNDS_PH, SR_GB_SEWER, SR_PACE_FORCE, SR_PACE_GRAV, SR_SEWER_FRAN } from './panhandle';
import { SJ_BOUNDS, SJC_ZONES, STA_AREA, STA_BOUNDS, STA_FORCE, STA_GRAV } from './stJohnsClay';
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
  { id: 'manatee', label: 'Manatee County utilities (Bradenton, Parrish)', note: 'Manatee County Utilities water, sewer and reclaimed mains (zoom in), sewer districts and the Braden River service area.' },
  { id: 'volusia', label: 'Volusia County utilities (Daytona, DeLand, Port Orange)', note: 'Volusia County GIS water and sewer service areas by provider, plus the City of Port Orange’s water and sewer mains. Other cities publish areas only. Zoom in.' },
  { id: 'martin', label: 'Martin County utilities (Stuart)', note: 'Only the City of Stuart’s utility boundary is public. Martin County Utilities’ own maps are not available. Zoom in.' },
  { id: 'marionx', label: 'Marion County water infrastructure', note: 'Marion County GIS’s 500-ft buffer around mapped water utility infrastructure (central Marion only). Outside it, wells are common. Zoom in.' },
  { id: 'charlottex', label: 'Charlotte County utility assessment areas', note: 'Charlotte County Utilities water and wastewater MSBUs (expansion areas with a utility assessment, such as South Gulf Cove and Rotonda). Zoom in.' },
  { id: 'stluciex', label: 'St. Lucie County Urban Service Boundary', note: 'Where St. Lucie County plans central water and sewer. Outside it, lots are rural (wells and septic are typical). Zoom in.' },
  { id: 'bay', label: 'Bay County utilities (Panama City area)', note: 'Bay County GIS: county and city water and sewer mains (zoom in) and the county’s exclusive utility service areas. The City of Panama City’s own mains are not published.' },
  { id: 'escambia', label: 'Escambia County utilities (ECUA)', note: 'Emerald Coast Utilities Authority water franchise areas and sewer expansion projects. No pipe maps are public. Zoom in.' },
  { id: 'santarosa', label: 'Santa Rosa County utilities', note: 'Sewer franchise areas (Santa Rosa County GIS) and Pace Water System and Gulf Breeze sewer mains (zoom in).' },
  { id: 'stjohns', label: 'St. Johns County utilities', note: 'St. Johns County utility zones (which utility serves where) and the City of St. Augustine’s sewer mains and service area (zoom in). The county’s own pipe maps are not public.' },
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
  { id: 'tb-s2s', group: 'tampabay', label: 'Pasco septic-to-sewer eligible parcels', url: PASCO_S2S_ELIG, bounds: TB_BOUNDS, colors: { a: '#e8a200' }, cat: one('a'), swatch: '#e8a200' },
  { id: 'po-lx', group: 'polkosceola', label: 'Toho Poinciana line-extension projects (by status)', url: POIN_PROJECTS, bounds: POIN_BOUNDS, colors: { 'Construction Completed': '#3aa30a', 'Released for Meters': '#00a884', 'Under Construction': '#e8a200', Proposed: '#7fb3e6', other: '#9aa39a' }, cat: p => String(p.PublicStatus || 'other'), swatch: '#3aa30a' },
  { id: 'mn-buf', group: 'marionx', label: 'Within 500 ft of water infrastructure', url: MN_BUFFER, bounds: MN_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'ch-msbu', group: 'charlottex', label: 'Water / wastewater MSBUs', url: CH_MSBU, bounds: CH_BOUNDS, colors: { a: '#d62828' }, cat: one('a'), swatch: '#d62828' },
  { id: 'sl-usb', group: 'stluciex', label: 'Urban Service Boundary', url: 'https://slcgis.stlucieco.gov/hosting/rest/services/UtilityServices/UrbanServiceBoundary/FeatureServer/0', bounds: PSL_BOUNDS, colors: { a: '#00a884' }, cat: one('a'), swatch: '#00a884' },
  { id: 'bay-sa', group: 'bay', label: 'Exclusive utility service areas', url: BAY_AREAS, bounds: BAY_BOUNDS, colors: { a: '#7fb3e6' }, cat: one('a'), swatch: '#7fb3e6' },
  { id: 'esc-wf', group: 'escambia', label: 'Water franchise areas', url: ECUA_WATER, bounds: ESC_BOUNDS, colors: { none: '#9aa39a', ecua: '#0070ff', other: '#00a884' }, cat: p => /no service|not served/i.test(String(p.Served_By || '')) ? 'none' : /EMERALD COAST/i.test(String(p.Served_By || '')) ? 'ecua' : 'other', swatch: '#0070ff' },
  { id: 'esc-sx', group: 'escambia', label: 'ECUA sewer expansion projects (by status)', url: ECUA_SEWER_EXP, bounds: ESC_BOUNDS, colors: { Complete: '#3aa30a', 'Under Construction': '#e8a200', 'In Design': '#7fb3e6', Funded: '#7fb3e6', Future: '#9aa39a', 'Waiver Period': '#00a884' }, cat: p => String(p.ProjectStatus || ''), swatch: '#3aa30a' },
  { id: 'sr-sf', group: 'santarosa', label: 'Sewer franchise areas', url: SR_SEWER_FRAN, bounds: SR_BOUNDS_PH, colors: { none: '#9aa39a', a: '#c98a4b' }, cat: p => /no sewer/i.test(String(p.SewerFranName || '')) ? 'none' : 'a', swatch: '#c98a4b' },
  { id: 'sj-uz', group: 'stjohns', label: 'Utility zones', url: SJC_ZONES, bounds: SJ_BOUNDS, colors: { a: '#4aa3df' }, cat: one('a'), swatch: '#4aa3df' },
  { id: 'sj-sta', group: 'stjohns', label: 'City of St. Augustine service area', url: STA_AREA, bounds: STA_BOUNDS, colors: { a: '#8e44ad' }, cat: one('a'), swatch: '#8e44ad' },
  { id: 'tb-hc', group: 'tampabay', label: 'Hillsborough County potable water areas', url: HC_POTABLE, bounds: TB_BOUNDS, colors: { a: '#00a884' }, cat: one('a'), swatch: '#00a884' },
  { id: 'tb-tw', group: 'tampabay', label: 'Tampa / county water service areas', url: `${TAMPA}/UtilityWater/MapServer/1`, bounds: TB_BOUNDS, colors: { a: '#7fb3e6' }, cat: one('a'), swatch: '#7fb3e6' },
  { id: 'tb-ts', group: 'tampabay', label: 'Tampa / county sewer service areas', url: `${TAMPA}/UtilitySewer/MapServer/7`, bounds: TB_BOUNDS, colors: { a: '#d9b38c' }, cat: one('a'), swatch: '#d9b38c' },
  { id: 'ir-s2s', group: 'indianriver', label: 'Septic-to-sewer projects (by status)', url: IR_S2S, bounds: IR_BOUNDS, colors: { Operational: '#3aa30a', 'In Construction': '#e8a200', Planned: '#7fb3e6', 'Grant awarded': '#7fb3e6' }, cat: p => String(p.Status || ''), swatch: '#3aa30a' },
  { id: 'ir-vw', group: 'indianriver', label: 'City of Vero Beach water service area', url: VB_WATER, bounds: IR_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'hd-msbu', group: 'hendry', label: 'MSBU and special districts', url: HD_MSBU, bounds: HG_BOUNDS, colors: { a: '#d62828' }, cat: one('a'), swatch: '#d62828' },
  { id: 'rw-sj', group: 'ruralwater', label: 'SJRWMD water supply areas (Putnam, Indian River)', url: SJ_WATER, bounds: [-82.0, 27.5, -80.3, 29.95], colors: { a: '#4aa3df' }, cat: one('a'), swatch: '#4aa3df' },
  { id: 'rw-epa', group: 'ruralwater', label: 'EPA water system areas', url: EPA_URL, bounds: RURAL_BOUNDS, colors: { a: '#00a884' }, cat: one('a'), swatch: '#00a884' },
  { id: 'mt-sd', group: 'manatee', label: 'Sewer districts', url: MAN_SEWER_DISTRICTS, bounds: MAN_BOUNDS, colors: { North: '#734c00', East: '#c98a4b', Southwest: '#8e44ad', Southeast: '#d9b38c', City: '#9aa39a', 'Longboat Key': '#00a884' }, cat: p => String(p.DISTNAME || ''), swatch: '#734c00' },
  { id: 'mt-br', group: 'manatee', label: 'Braden River service area', url: MAN_BRADEN, bounds: MAN_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'mt-bw', group: 'manatee', label: 'City of Bradenton water-only area', url: MAN_BRADENTON, bounds: MAN_BOUNDS, colors: { a: '#7fb3e6' }, cat: one('a'), swatch: '#7fb3e6' },
  { id: 'vo-sa', group: 'volusia', label: 'Water / sewer service areas (by services)', url: VO_AREAS, bounds: VO_BOUNDS, colors: { both: '#00a884', water: '#4aa3df', sewer: '#c98a4b', other: '#9aa39a' }, cat: p => voType(p.SERV_TYPE), swatch: '#00a884' },
  { id: 'mr-st', group: 'martin', label: 'City of Stuart utility boundary', url: STUART_AREA, bounds: MARTIN_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'lk-ws', group: 'lake', label: 'Water service areas', url: LK_WS, bounds: LK_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
];

/** Raster overlays from ArcGIS MapServer export. */
export interface RasterSet { id: string; group: string; label: string; tiles: string; bounds: [number, number, number, number]; attribution: string; opacity: number; swatch: string }
const exp = (base: string, layers: string) => `${base}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${layers}&f=image`;
export const RASTER_SETS: RasterSet[] = [
  { id: 'mt-w', group: 'manatee', label: 'County water mains', tiles: exp(MAN_WATER, '12'), bounds: MAN_BOUNDS, attribution: 'Manatee County Utilities', opacity: 0.95, swatch: '#1f6fd1' },
  { id: 'mt-s', group: 'manatee', label: 'County sewer mains (gravity and force)', tiles: exp(MAN_SEWER, '11,12'), bounds: MAN_BOUNDS, attribution: 'Manatee County Utilities', opacity: 0.95, swatch: '#b5651d' },
  { id: 'mt-r', group: 'manatee', label: 'County reclaimed water mains', tiles: exp(MAN_RECLAIM, '10'), bounds: MAN_BOUNDS, attribution: 'Manatee County Utilities', opacity: 0.95, swatch: '#8e44ad' },
  { id: 'mt-h', group: 'manatee', label: 'County fire hydrants', tiles: exp(MAN_WATER, '1'), bounds: MAN_BOUNDS, attribution: 'Manatee County Utilities', opacity: 0.95, swatch: '#d62828' },
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
  { id: 'vo-pow', group: 'volusia', label: 'Port Orange water mains', layer: { id: 'vo-pow', label: '', urls: [PO_WATER], kind: 'line', color: '#1f6fd1', on: true }, bounds: PORT_ORANGE_BOUNDS, minZoom: 14, swatch: '#1f6fd1' },
  { id: 'vo-pos', group: 'volusia', label: 'Port Orange sewer mains', layer: { id: 'vo-pos', label: '', urls: [PO_GRAVITY, PO_FORCE], kind: 'line', color: '#b5651d', on: true }, bounds: PORT_ORANGE_BOUNDS, minZoom: 14, swatch: '#b5651d' },
  { id: 'ir-step', group: 'indianriver', label: 'Vero Beach STEP sewer mains', layer: { id: 'ir-step', label: '', urls: [VB_STEP], kind: 'line', color: '#b5651d', on: true }, bounds: IR_BOUNDS, minZoom: 14, swatch: '#b5651d' },
  { id: 'bay-wm', group: 'bay', label: 'Water mains', layer: { id: 'bay-wm', label: '', urls: [BAY_WATER], kind: 'line', color: '#1f6fd1', on: true }, bounds: BAY_BOUNDS, minZoom: 15, swatch: '#1f6fd1' },
  { id: 'bay-sm', group: 'bay', label: 'Sewer mains', layer: { id: 'bay-sm', label: '', urls: [BAY_GRAV, BAY_FORCE], kind: 'line', color: '#b5651d', on: true }, bounds: BAY_BOUNDS, minZoom: 15, swatch: '#b5651d' },
  { id: 'sr-sm', group: 'santarosa', label: 'Pace and Gulf Breeze sewer mains', layer: { id: 'sr-sm', label: '', urls: [SR_PACE_GRAV, SR_PACE_FORCE, SR_GB_SEWER], kind: 'line', color: '#b5651d', on: true }, bounds: SR_BOUNDS_PH, minZoom: 14, swatch: '#b5651d' },
  { id: 'sj-ss', group: 'stjohns', label: 'St. Augustine sewer mains', layer: { id: 'sj-ss', label: '', urls: [STA_GRAV, STA_FORCE], kind: 'line', color: '#b5651d', on: true }, bounds: STA_BOUNDS, minZoom: 14, swatch: '#b5651d' },
  { id: 'pu-wm', group: 'putnam', label: 'Palatka-area water mains', layer: { id: 'pu-wm', label: '', urls: [PU_MAINS], kind: 'line', color: '#1f6fd1', on: true }, bounds: PU_BOUNDS, minZoom: 14, swatch: '#1f6fd1' },
);
export const ALL_SETS: { id: string; group: string; label: string; swatch: string }[] = [...POLY_SETS, ...RASTER_SETS, ...VECTOR_SETS];
