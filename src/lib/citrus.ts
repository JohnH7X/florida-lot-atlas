import { lotCenter, type LotFeature } from './lots';
import { esriQuery, inBounds, safe, text } from './utilGeo';

/** Citrus County, FL (Citrus Springs, Inverness, Crystal River area): the water and sewer operational areas, which show which utility serves where (Citrus County GIS). The county does not publish pipe maps. */
const U = 'https://maps.citrusbocc.com/server/rest/services/water-resources/Utility_Areas_SQL02/MapServer';
export const CIT_BOUNDS: [number, number, number, number] = [-82.8, 28.7, -82.2, 29.15];
export interface CitLayer { id: string; label: string; layer: number; color: string; on: boolean }
export const CIT_LAYERS: CitLayer[] = [
  { id: 'water', label: 'Water operational areas', layer: 1, color: '#4aa3df', on: true },
  { id: 'sewer', label: 'Sewer operational areas', layer: 2, color: '#c98a4b', on: true },
];
export const citTiles = (l: CitLayer) =>
  `${U}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&layers=show:${l.layer}&f=image`;

export interface CitArea { utility: string; area: string; contact: string }
export interface CitrusUtilities { water: CitArea[]; sewer: CitArea[] }
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/ _ /g, ' – ').trim();

/** The Citrus County utility areas that cover a parcel, or null when none does. */
export async function citrusUtilitiesAt(lot: LotFeature): Promise<CitrusUtilities | null> {
  const c = lotCenter(lot); if (!c || !inBounds(c, CIT_BOUNDS)) return null;
  const at = async (layer: number): Promise<CitArea[]> => (await safe(esriQuery(`${U}/${layer}`, { x: c[0], y: c[1] }, 'esriGeometryPoint', 'AREAID,AREANAME,CONTACT_PERSON'), []))
    .map(h => ({ utility: tidy(text(h.attributes.AREANAME)), area: tidy(text(h.attributes.AREAID)), contact: tidy(text(h.attributes.CONTACT_PERSON)) }));
  const [water, sewer] = await Promise.all([at(1), at(2)]);
  return water.length || sewer.length ? { water, sewer } : null;
}
