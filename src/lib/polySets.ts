import { CO_BOUNDS, PUD } from './collier';
import { HI_BOUNDS, HI_TAX, HI_WW } from './highlands';
import { LK_BOUNDS, LK_WS } from './lakeCounty';

/** Service-area polygon overlays drawn as vectors for the map view (one per layer id). `cat` picks the colour key for each feature. */
export interface PolySet { id: string; group: string; label: string; url: string; bounds: [number, number, number, number]; colors: Record<string, string>; cat: (p: Record<string, unknown>) => string; swatch: string }
const one = (k: string) => () => k;
export const POLY_GROUPS: { id: string; label: string; note: string }[] = [
  { id: 'collier', label: 'Collier County utility areas', note: 'Collier County Public Utilities and city boundaries. Service areas only: the county publishes no pipe maps. Golden Gate Estates outside the district is on wells and septic. Zoom in.' },
  { id: 'highlands', label: 'Highlands County utility areas', note: 'Highlands County GIS. Sewer service areas and special taxing districts (extra assessments) only: no water areas or pipe maps are public. Zoom in.' },
  { id: 'lake', label: 'Lake County water areas', note: 'Lake County GIS water service areas (cities and private utilities). No pipe maps or sewer areas are public. Zoom in.' },
];
export const POLY_SETS: PolySet[] = [
  { id: 'co-ws', group: 'collier', label: 'County water-sewer district', url: `${PUD}/WaterServiceArea/FeatureServer/0`, bounds: CO_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
  { id: 'co-ww', group: 'collier', label: 'Wastewater service area (north / south)', url: `${PUD}/WastewaterServiceAreaNS/FeatureServer/0`, bounds: CO_BOUNDS, colors: { NORTH: '#734c00', SOUTH: '#c98a4b', other: '#9aa39a' }, cat: p => String(p.AreaName || 'other').toUpperCase(), swatch: '#734c00' },
  { id: 'co-city', group: 'collier', label: 'City utilities (Naples, Marco Island, Golden Gate City)', url: `${PUD}/CityUtilityBoundaries/FeatureServer/0`, bounds: CO_BOUNDS, colors: { a: '#8e44ad' }, cat: one('a'), swatch: '#8e44ad' },
  { id: 'hi-ww', group: 'highlands', label: 'Sewer service areas', url: HI_WW, bounds: HI_BOUNDS, colors: { a: '#734c00' }, cat: one('a'), swatch: '#734c00' },
  { id: 'hi-tax', group: 'highlands', label: 'Special taxing districts (assessments)', url: HI_TAX, bounds: HI_BOUNDS, colors: { a: '#d62828' }, cat: one('a'), swatch: '#d62828' },
  { id: 'lk-ws', group: 'lake', label: 'Water service areas', url: LK_WS, bounds: LK_BOUNDS, colors: { a: '#0070ff' }, cat: one('a'), swatch: '#0070ff' },
];
