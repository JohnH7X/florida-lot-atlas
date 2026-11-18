import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { getJSON } from './data';
import { inLot } from './lots';
import type { SearchResult, Zone } from './types';

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
}

export function zoneResults(query: string, zones: Zone[]): SearchResult[] {
  const q = normalize(query);
  return zones.filter(z => normalize(z.code) === q || z.number === q || normalize(z.number) === q || (q.length >= 3 && normalize(z.code).startsWith(q)))
    .slice(0, 12).map(z => ({ id: 'zone-' + z.code, kind: 'zone', title: z.city ? `${z.number} (${z.city})` : z.code,
      subtitle: z.city ? `${z.city} zoning zone` : `${z.type} · Intensification ${z.number}`, coordinates: z.center, zoneCodes: [z.code] }));
}

// Esri World geocoder (no key for search without storing results), limited to the state.
const GEOCODER = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
export const STATE = { name: 'Florida', code: 'FL', extent: '-87.7,24.4,-79.9,31.1' };
let zoneShapes: Promise<FeatureCollection<Polygon | MultiPolygon, { code: string }>> | null = null;

/** NYC zoning district codes at a point (only NYC publishes city-wide zoning). */
async function zonesAt(point: [number, number], zones: Zone[]): Promise<string[]> {
  const near = zones.filter(z => point[0] >= z.bounds[0] && point[0] <= z.bounds[2] && point[1] >= z.bounds[1] && point[1] <= z.bounds[3]);
  if (!near.length) return [];
  zoneShapes ??= getJSON('/data/zones.geojson');
  const codes = new Set(near.map(z => z.code));
  return (await zoneShapes).features.filter(f => codes.has(f.properties.code) && inLot(point, f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
    .map(f => f.properties.code);
}

const SUGGEST = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest';
const OUT_FIELDS = 'Addr_type,Type,RegionAbbr,Subregion,City';

async function geocode(params: Record<string, string>, signal?: AbortSignal): Promise<any[]> {
  const qs = new URLSearchParams({ outSR: '4326', sourceCountry: 'USA', outFields: OUT_FIELDS, f: 'json', ...params });
  const response = await fetch(`${GEOCODER}?${qs}`, { signal });
  if (!response.ok) throw new Error('The place service did not respond. Try again.');
  return (await response.json()).candidates || [];
}

/** A city, township, borough, neighbourhood, county or ZIP candidate as a search result that frames the whole place. */
function toPlace(c: any): SearchResult {
  const point: [number, number] = [c.location.x, c.location.y];
  const at = String(c.attributes?.Addr_type || ''), type = String(c.attributes?.Type || '');
  const [name] = String(c.address).split(', '), county = String(c.attributes?.Subregion || '');
  const label = at.startsWith('Postal') ? 'ZIP code' : type === 'County' ? 'County' : /Neighborhood|District|Village|Borough|Hamlet/i.test(type) ? 'Neighborhood / district' : 'City / township';
  const e = c.extent, dx = e ? Math.max(e.xmax - e.xmin, (e.ymax - e.ymin) * 1.3) : 0;
  return { id: 'place-' + name + county, kind: 'place', title: name, coordinates: point, zoneCodes: [],
    subtitle: label + (county && type !== 'County' ? ' · ' + county : '') + ', Florida',
    zoom: dx ? Math.min(15, Math.max(8, Math.log2(360 * 1.6 / dx))) : 12.5 };
}
const isPlace = (c: any) => /Locality|Subregion|District|PostalLoc|Postal$/.test(String(c.attributes?.Addr_type || ''));

/** Prefix search for places while typing ("Strou" finds Stroudsburg and Stroud Township). */
async function placeSuggest(q: string, signal?: AbortSignal): Promise<SearchResult[]> {
  if (/\d/.test(q) || q.length < 3) return [];
  const qs = new URLSearchParams({ text: q, category: 'City,Subregion,Neighborhood,District,Populated Place', searchExtent: STATE.extent, maxSuggestions: '8', f: 'json' });
  const response = await fetch(`${SUGGEST}?${qs}`, { signal });
  if (!response.ok) return [];
  const picked = ((await response.json()).suggestions || []).filter((x: any) => /, FL, USA$/.test(x.text)).slice(0, 6);
  const found = await Promise.all(picked.map((x: any) => geocode({ SingleLine: x.text, magicKey: x.magicKey, maxLocations: '1' }, signal).then(a => a[0]).catch(() => null)));
  return found.filter((c: any) => c && isPlace(c)).map(toPlace);
}

// ---- Hotels and attractions -------------------------------------------------
export interface BrowseChip { id: string; label: string; cats: string[]; large?: boolean }
export const BROWSE_CHIPS: BrowseChip[] = [
  { id: 'hotels', label: 'Large hotels & resorts', cats: ['Hotel', 'Resort', 'Casino'], large: true },
  { id: 'attractions', label: 'Attractions', cats: ['Tourist Attraction', 'Amusement Park', 'Museum', 'Zoo'] },
  { id: 'outdoors', label: 'Ski, golf & parks', cats: ['Ski Resort', 'Golf Course', 'Park'] },
];
const POI_NAME_CATS = 'Hotel,Resort,Casino,Tourist Attraction,Amusement Park,Museum,Zoo,Ski Resort,Golf Course,Convention Center';
// The place service has no room counts, so "large" is judged from the name: resorts, casinos, conference hotels and well-known chains,
// not vacation rentals, cabins and lodges of clubs.
const SMALL_STAY = /cottage|cabin|retreat|chalet|firepit|airbnb|avantstay|vacation|rental|villa|bungalow|townhome|\bhouse\b|\bhome\b|\bmoose\b|\belks\b|\bvfw\b|community|estates|getaway|haven|hideaway|farmhouse|b&b|bed and breakfast|guest/i;
const LARGE_STAY = /resort|casino|convention|conference|hotel|marriott|hilton|hyatt|sheraton|westin|doubletree|embassy|wyndham|ramada|holiday inn|hampton|courtyard|fairfield|residence inn|springhill|best western|radisson|comfort|quality inn|days inn|la quinta|country inn|crowne|omni|kimpton|ritz|four seasons|great wolf|kalahari|suites|lodge & spa|spa resort/i;
export const isLargeStay = (name: string, type: string) => !SMALL_STAY.test(name) && (LARGE_STAY.test(name) || /Resort|Casino/.test(type));

const km = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 85, (a[1] - b[1]) * 111);
function toPoi(c: any): SearchResult {
  const city = String(c.attributes?.City || ''), type = String(c.attributes?.Type || '');
  return { id: 'poi-' + c.address + c.location.x.toFixed(4), kind: 'poi', title: String(c.address), coordinates: [c.location.x, c.location.y], zoneCodes: [],
    subtitle: [type, city].filter(Boolean).join(' · ') + ', Florida', zoom: 16.5 };
}

/** Everything of one kind (hotels, attractions, ski/golf/parks) inside the map view, nearest the map centre first. */
export async function browseCategory(chip: BrowseChip, extent: [number, number, number, number], centre: [number, number], includeSmall: boolean, signal?: AbortSignal): Promise<SearchResult[]> {
  const batches = await Promise.all(chip.cats.map(cat => geocode({ SingleLine: cat, category: cat, maxLocations: '20', searchExtent: extent.join(','), location: centre.join(',') }, signal).catch(() => [])));
  checkCancelled(signal);
  const seen = new Set<string>(), out: { r: SearchResult; d: number }[] = [];
  for (const c of batches.flat()) {
    if (c.attributes?.RegionAbbr && c.attributes.RegionAbbr !== STATE.code) continue;
    const r = toPoi(c), key = r.title.toLowerCase() + c.location.x.toFixed(2) + c.location.y.toFixed(2);
    if (seen.has(key) || (chip.large && !includeSmall && !isLargeStay(r.title, String(c.attributes?.Type || '')))) continue;
    seen.add(key); out.push({ r, d: km(r.coordinates, centre) });
  }
  return out.sort((a, b) => a.d - b.d).slice(0, 30).map(x => ({ ...x.r, subtitle: `${x.r.subtitle.replace(', Florida', '')} · ${x.d < 10 ? x.d.toFixed(1) : Math.round(x.d)} km away` }));
}

export async function searchAtlas(query: string, zones: Zone[], _shards: string[], signal?: AbortSignal): Promise<{ results: SearchResult[]; truncated: boolean }> {
  checkCancelled(signal);
  const q = query.trim();
  if (q.length < 3) return { results: [], truncated: false };
  const zr = zoneResults(q, zones);
  if (/^[A-Za-z]+\d*[-A-Za-z0-9./]*$/.test(q) && zr.length) return { results: zr, truncated: zr.length >= 12 };
  const wordy = /[A-Za-z]{3}/.test(q) && !/^\d+\s/.test(q);   // not a street address that starts with a house number
  const [main, suggested, pois] = await Promise.all([
    geocode({ SingleLine: q, maxLocations: '8', searchExtent: STATE.extent, category: 'Address,Street Address,Point Address,Subaddress,Postal,City,Neighborhood,District,Subregion' }, signal),
    placeSuggest(q, signal).catch(() => [] as SearchResult[]),
    wordy ? geocode({ SingleLine: q, maxLocations: '6', searchExtent: STATE.extent, category: POI_NAME_CATS }, signal).catch(() => []) : Promise.resolve([] as any[]),
  ]);
  checkCancelled(signal);
  const seen = new Set<string>();
  const hits: SearchResult[] = [];
  const places: SearchResult[] = [];
  const addPlace = (r: SearchResult) => { if (!places.some(h => h.id === r.id)) places.push(r); };
  for (const c of main) {
    const k = String(c.address).replace(/\s+/g, '').replace(/^(.*?),(CityOf|TownshipOf|BoroughOf)/i, '$1,');
    if (c.score < 80 || seen.has(k) || (c.attributes?.RegionAbbr && c.attributes.RegionAbbr !== STATE.code)) continue;
    seen.add(k);
    if (isPlace(c)) { addPlace(toPlace(c)); continue; }
    const point: [number, number] = [c.location.x, c.location.y];
    const codes = await zonesAt(point, zones).catch(() => []);
    const [street, ...rest] = String(c.address).split(', ');
    hits.push({ id: 'address-' + c.address, kind: 'address', title: street, subtitle: rest.join(', ') + (codes.length ? ' · ' + zones.find(z => z.code === codes[0])?.number : ''),
      coordinates: point, zoneCodes: codes });
  }
  for (const r of suggested) addPlace(r);
  const poiHits = pois.filter((c: any) => c.score >= 85 && (!c.attributes?.RegionAbbr || c.attributes.RegionAbbr === STATE.code)).map(toPoi)
    .filter((r: SearchResult, i: number, all: SearchResult[]) => all.findIndex(o => o.title === r.title) === i);
  return { results: [...places, ...poiHits, ...hits, ...zr].slice(0, 20), truncated: false };
}
