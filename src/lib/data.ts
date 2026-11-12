import type { Metadata, Pin, ViewState, Zone } from './types';

export async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load map data (${response.status}). Please reload or try again.`);
  return response.json() as Promise<T>;
}

export async function loadAtlas() {
  const [zones, metadata] = await Promise.all([
    getJSON<Zone[]>('/data/zones-index.json'),
    getJSON<Metadata>('/data/metadata.json'),
  ]);
  return { zones, metadata };
}

export const DEFAULT_VIEW: ViewState = { lng: -83.6, lat: 27.9, zoom: 6.2, zone: '', milieu: '', zoneFilter: '', activity: '', visible: true };
export function readView(hash = window.location.hash): ViewState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const bounded = (key: string, fallback: number, low: number, high: number) => {
    const raw = p.get(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= low && value <= high ? value : fallback;
  };
  return { lng: bounded('lng', DEFAULT_VIEW.lng, -88.5, -79.0),
    lat: bounded('lat', DEFAULT_VIEW.lat, 23.8, 31.6),
    zoom: bounded('z', DEFAULT_VIEW.zoom, 6, 19),
    zone: (p.get('zone') || '').slice(0, 30), milieu: (p.get('milieu') || '').slice(0, 20),
    zoneFilter: (p.get('filter') || '').slice(0, 30), activity: (p.get('use') || '').slice(0, 50), visible: p.get('layer') !== 'off' };
}

/** `#props=[[lng,lat,"address",stars],…]` puts several properties on the map as numbered pins (max 300). */
export function readProps(hash = window.location.hash): Pin[] {
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get('props');
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: Pin[] = [];
    for (const row of arr.slice(0, 300)) {
      if (!Array.isArray(row)) continue;
      const lng = Number(row[0]), lat = Number(row[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -88.5 || lng > -79 || lat < 23.8 || lat > 31.6) continue;
      const stars = Math.max(0, Math.min(5, Math.round(Number(row[3]) || 0)));
      out.push({ n: out.length + 1, lng, lat, addr: String(row[2] || '').slice(0, 160), stars });
    }
    return out;
  } catch { return []; }
}
export function encodeProps(pins: Pin[]): string {
  return pins.length ? '&props=' + encodeURIComponent(JSON.stringify(pins.map(p => [Number(p.lng.toFixed(6)), Number(p.lat.toFixed(6)), p.addr, p.stars]))) : '';
}

/** A link can ask the atlas to open the parcel at its coordinates: `#lng=…&lat=…&open=1&addr=123+Main+St`. */
export function readOpen(hash = window.location.hash): { open: boolean; addr: string } {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return { open: p.get('open') === '1', addr: (p.get('addr') || '').slice(0, 160) };
}

export function encodeView(view: ViewState): string {
  const p = new URLSearchParams({ lng: view.lng.toFixed(6), lat: view.lat.toFixed(6), z: view.zoom.toFixed(2) });
  if (view.zone) p.set('zone', view.zone);
  if (view.milieu) p.set('milieu', view.milieu);
  if (view.zoneFilter) p.set('filter', view.zoneFilter);
  if (view.activity) p.set('use', view.activity);
  if (!view.visible) p.set('layer', 'off');
  return '#' + p.toString();
}
