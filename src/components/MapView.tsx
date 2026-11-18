import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as LibreMap, type ExpressionSpecification, type FilterSpecification, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FAMILIES, type MapPosition, type Pin, type ViewState, type Zone } from '../lib/types';
import { getJSON } from '../lib/data';
import type { FeatureCollection, Polygon } from 'geojson';
import { FT_PER_M, LOT_MIN_ZOOM, bandOfSale, lotEdges, lotsInBounds, saleBandOf, streetViewUrl, type LotFeature } from '../lib/lots';
import { MY_PIN_STATUS, type MyPin } from '../lib/myPins';
import { BREVARD_UTIL_BOUNDS, BREVARD_UTIL_LAYERS, brevardUtilTiles } from '../lib/brevardUtilities';
import { MELBOURNE_BOUNDS, MELBOURNE_LAYERS, melbourneTiles } from '../lib/melbourne';
import { TITUSVILLE_BOUNDS, TITUSVILLE_LAYERS, titusvilleTiles } from '../lib/titusville';
import { COCOA_BOUNDS, COCOA_LAYERS, cocoaTiles } from '../lib/cocoa';
import { PALM_BAY_BOUNDS, PALM_BAY_LAYERS, palmBayTiles } from '../lib/palmBay';
import { countySalesForLots } from '../lib/countySalesBulk';

interface Props {
  initial: ViewState;
  selected: Zone | null;
  milieu: string;
  zoneFilter: string;
  activityTypes: string[] | null;
  addressCoordinates: [number, number] | null;
  visible: boolean;
  opacity: number;
  focus: { coordinates: [number, number]; zoom: number; serial: number } | null;
  lotsVisible: boolean;
  hideTransfers?: boolean;
  /** Palm Bay city-map layers that are switched on (ids from PALM_BAY_LAYERS). */
  palmBay?: string[];
  /** Cocoa utility-area layers that are switched on (ids from COCOA_LAYERS). */
  cocoa?: string[];
  /** Titusville utility layers that are switched on (ids from TITUSVILLE_LAYERS). */
  titusville?: string[];
  /** Melbourne utility-area layers that are switched on (ids from MELBOURNE_LAYERS). */
  melbourne?: string[];
  /** Brevard County Utility Services layers that are switched on (ids from BREVARD_UTIL_LAYERS). */
  brevardUtil?: string[];
  selectedLot: LotFeature | null;
  pins?: Pin[];
  activePin?: number | null;
  onPinClick?: (pin: Pin) => void;
  myPins?: MyPin[];
  activeMyPin?: string | null;
  placing?: boolean;
  onPlace?: (lng: number, lat: number) => void;
  onMyPinClick?: (id: string) => void;
  onMyPinMove?: (id: string, lng: number, lat: number) => void;
  placePins?: { id: string; title: string; coordinates: [number, number] }[];
  placeFit?: number;
  onPlacePinClick?: (id: string) => void;
  onLotClick: (lot: string) => void;
  onPointClick?: (coordinates: [number, number]) => void;
  onSelect: (code: string) => void;
  onMove: (position: MapPosition) => void;
}

/** Label points along each side of the given lots, rotated with the side and kept upright. */
function edgeLabels(lots: LotFeature[], label: (e: ReturnType<typeof lotEdges>[number]) => string): FeatureCollection {
  return { type: 'FeatureCollection', features: lots.flatMap(lot => lotEdges(lot).map(e => {
    const lat = (e.from[1] + e.to[1]) / 2 * Math.PI / 180;
    let angle = -Math.atan2(e.to[1] - e.from[1], (e.to[0] - e.from[0]) * Math.cos(lat)) * 180 / Math.PI;
    if (angle > 90) angle -= 180; if (angle < -90) angle += 180; // keep text upright
    return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: e.mid }, properties: { angle, label: label(e) } };
  })) };
}

export default function MapView(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LibreMap | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Loading Florida map…');
  const marker = useRef<maplibregl.Marker | null>(null);
  const lotRequest = useRef<AbortController | null>(null);
  const [lotStatus, setLotStatus] = useState('');
  const [satellite, setSatellite] = useState(() => { if (/(^|[#&?])map=satellite/.test(window.location.hash + window.location.search)) return true; try { return localStorage.getItem('atlas-basemap') === 'satellite'; } catch { return false; } });
  const refreshLotsRef = useRef<() => void>(() => {});
  const pinMarkers = useRef<maplibregl.Marker[]>([]);
  const [saleColors, setSaleColors] = useState(() => { try { return localStorage.getItem('atlas-sale-colors') !== '0'; } catch { return true; } });
  const [saleCounts, setSaleCounts] = useState<{ s2026: number; s2025: number; sOlder: number; none: number } | null>(null);

  // Properties sent from another app: numbered pins (pink when rated), and zoom to fit them all.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    pinMarkers.current.forEach(x => x.remove()); pinMarkers.current = [];
    const pins = props.pins || [];
    for (const p of pins) {
      // A teardrop pin pointing down; MapLibre moves the outer element, so the tilt lives on the inner shape.
      const el = document.createElement('div');
      el.className = 'dre-tear-wrap';
      const shape = document.createElement('button');
      shape.className = `dre-tear${p.stars ? ' rated' : ''}${props.activePin === p.n ? ' active' : ''}`;
      const num = document.createElement('span'); num.textContent = String(p.n); shape.appendChild(num);
      el.appendChild(shape);
      el.title = `${p.n}. ${p.addr || 'Property'}${p.stars ? ' ' + '★'.repeat(p.stars) : ''}`;
      el.addEventListener('click', ev => { ev.stopPropagation(); callbacks.current.onPinClick?.(p); });
      pinMarkers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }, [props.pins, props.activePin, ready]);
  // The user's own research pins: coloured by status, labelled, and draggable.
  const myMarkers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    myMarkers.current.forEach(x => x.remove()); myMarkers.current = [];
    for (const p of props.myPins || []) {
      const el = document.createElement('div');
      el.className = 'my-tear-wrap';
      const shape = document.createElement('div');
      shape.className = `my-tear${props.activeMyPin === p.id ? ' active' : ''}`;
      shape.style.background = MY_PIN_STATUS[p.status].color;
      const dot = document.createElement('span'); shape.appendChild(dot);
      const label = document.createElement('div'); label.className = 'my-tear-label'; label.textContent = p.label;
      el.append(shape, label);
      el.title = p.note ? `${p.label}\n${p.note}` : p.label;
      el.addEventListener('click', ev => { ev.stopPropagation(); callbacks.current.onMyPinClick?.(p.id); });
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true }).setLngLat([p.lng, p.lat]).addTo(m);
      marker.on('dragend', () => { const ll = marker.getLngLat(); callbacks.current.onMyPinMove?.(p.id, ll.lng, ll.lat); });
      myMarkers.current.push(marker);
    }
  }, [props.myPins, props.activeMyPin, ready]);
  const pinKey = (props.pins || []).map(p => `${p.lng},${p.lat}`).join('|');
  useEffect(() => {
    const m = map.current, pins = props.pins || [];
    if (!m || !ready || !pins.length) return;
    if (pins.length === 1) { m.flyTo({ center: [pins[0].lng, pins[0].lat], zoom: 17 }); return; }
    const b = new maplibregl.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat]);
    pins.forEach(p => b.extend([p.lng, p.lat]));
    m.fitBounds(b, { padding: { top: 90, bottom: 90, left: window.innerWidth > 760 ? 420 : 40, right: 50 }, maxZoom: 16, duration: 800 });
  }, [pinKey, ready]);

  useEffect(() => {
    let active = true;
    let instance: LibreMap | null = null;
    async function boot() {
      try {
        const geometry = await getJSON<FeatureCollection<Polygon>>('/data/zones.geojson');
        let style: StyleSpecification;
        try {
          const response = await fetch('https://tiles.openfreemap.org/styles/positron', { signal: AbortSignal.timeout(12000) });
          if (!response.ok) throw new Error('Basemap unavailable');
          style = await response.json();
        } catch {
          style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e8ece5' } }] };
          if (active) setMessage('Basemap unavailable. Land-use areas remain visible.');
        }
        if (!active || !host.current) return;
        instance = new maplibregl.Map({ container: host.current, style,
          center: [props.initial.lng, props.initial.lat], zoom: props.initial.zoom, minZoom: 6, maxZoom: 19,
          attributionControl: false, maxBounds: [[-88.5, 23.8], [-79.0, 31.6]],
          canvasContextAttributes: { preserveDrawingBuffer: true } });
        map.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        instance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        instance.addControl(new maplibregl.AttributionControl({ compact: true,
          customAttribution: 'Parcels: Florida Department of Revenue via <a href="https://geodata.floridagio.gov/" target="_blank">Florida GIO</a> · Geocoding: Esri' }), 'bottom-right');
        instance.on('load', () => {
          if (!instance || !active) return;
          instance.addSource('zones', { type: 'geojson', data: geometry, tolerance: 0, generateId: false });
          const colors: (string | ExpressionSpecification)[] = [];
          Object.entries(FAMILIES).forEach(([key, value]) => colors.push(key, value.color));
          const color = ['match', ['get', 'family'], ...colors, '#c8c5bb'] as unknown as ExpressionSpecification;
          // Draw beneath street/place labels when the basemap provides symbols.
          const before = instance.getStyle().layers.find(l => l.type === 'symbol')?.id;
          // Satellite imagery sits under zoning and lots; toggled from the map.
          instance.addSource('satellite', { type: 'raster', tileSize: 256, maxzoom: 19,
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
          instance.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } }, before);
          for (const l of BREVARD_UTIL_LAYERS) {
            instance.addSource(`bu-${l.id}`, { type: 'raster', tileSize: 512, bounds: BREVARD_UTIL_BOUNDS, tiles: [brevardUtilTiles(l.layer)], attribution: 'Brevard County GIS (Utility Services service areas)' });
            instance.addLayer({ id: `bu-${l.id}`, type: 'raster', source: `bu-${l.id}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } }, before);
          }
          for (const l of MELBOURNE_LAYERS) {
            instance.addSource(`mb-${l.id}`, { type: 'raster', tileSize: 512, bounds: MELBOURNE_BOUNDS, tiles: [melbourneTiles(l.layer)], attribution: 'Brevard County GIS (Melbourne utility service areas)' });
            instance.addLayer({ id: `mb-${l.id}`, type: 'raster', source: `mb-${l.id}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } }, before);
          }
          for (const l of TITUSVILLE_LAYERS) {
            instance.addSource(`tv-${l.id}`, { type: 'raster', tileSize: 512, bounds: TITUSVILLE_BOUNDS, tiles: [titusvilleTiles(l)], attribution: 'City of Titusville GIS' });
            instance.addLayer({ id: `tv-${l.id}`, type: 'raster', source: `tv-${l.id}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9 } }, before);
          }
          for (const l of COCOA_LAYERS) {
            instance.addSource(`cc-${l.id}`, { type: 'raster', tileSize: 512, bounds: COCOA_BOUNDS, tiles: [cocoaTiles(l.layer)], attribution: 'Brevard County GIS (Cocoa utility service areas)' });
            instance.addLayer({ id: `cc-${l.id}`, type: 'raster', source: `cc-${l.id}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } }, before);
          }
          // City of Palm Bay public map layers (image exports from the city's own GIS), off until switched on.
          for (const l of PALM_BAY_LAYERS) {
            instance.addSource(`pb-${l.id}`, { type: 'raster', tileSize: 512, bounds: PALM_BAY_BOUNDS, tiles: [palmBayTiles(l.service)], attribution: 'City of Palm Bay GIS' });
            instance.addLayer({ id: `pb-${l.id}`, type: 'raster', source: `pb-${l.id}`, layout: { visibility: 'none' }, paint: { 'raster-opacity': l.id === 'limits' ? 0.9 : 0.75 } }, before);
          }
          instance.addLayer({ id: 'zoning-fill', type: 'fill', source: 'zones', paint: { 'fill-color': color, 'fill-opacity': 0.5 } }, before);
          instance.addLayer({ id: 'zoning-line', type: 'line', source: 'zones', paint: { 'line-color': '#5b655c', 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.3, 14, 1] } }, before);
          instance.addLayer({ id: 'zoning-quality', type: 'line', source: 'zones', filter: ['==', ['get', 'qualityIssue'], true], paint: { 'line-color': '#b65328', 'line-width': 2.4, 'line-dasharray': [2, 2] } });
          instance.addLayer({ id: 'selected-fill', type: 'fill', source: 'zones', filter: ['==', ['get', 'code'], ''], paint: { 'fill-color': '#285444', 'fill-opacity': 0.22 } });
          instance.addLayer({ id: 'selected-line', type: 'line', source: 'zones', filter: ['==', ['get', 'code'], ''], paint: { 'line-color': '#173e30', 'line-width': 3 } });
          // Borough and city outlines with names, so areas without a coloured layer are still visible.
          instance.addSource('territories', { type: 'geojson', data: '/data/territories.geojson' });
          instance.addLayer({ id: 'territory-line', type: 'line', source: 'territories', paint: { 'line-color': '#254b3c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 2.2], 'line-dasharray': [3, 2], 'line-opacity': 0.75 } });
          // Off-island cities (North Shore, Repentigny): a solid, bold border so each city reads at a glance.
          instance.addLayer({ id: 'territory-city-halo', type: 'line', source: 'territories', filter: ['==', ['get', 'offIsland'], true],
            paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 4, 14, 7], 'line-opacity': 0.8 } });
          instance.addLayer({ id: 'territory-city-line', type: 'line', source: 'territories', filter: ['==', ['get', 'offIsland'], true],
            paint: { 'line-color': '#c2410c', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4] } });
          instance.addSource('territory-labels', { type: 'geojson', data: '/data/territory-labels.geojson' });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'territory-label', type: 'symbol', source: 'territory-labels', maxzoom: 14.5,
            layout: { 'text-field': ['get', 'name'], 'text-size': ['interpolate', ['linear'], ['zoom'], 9, 10, 13, 14], 'text-font': ['Noto Sans Regular'], 'text-max-width': 8 },
            paint: { 'text-color': '#173e30', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
          // Tax parcels: yellow outlines fetched live for the current view at street zoom.
          const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
          instance.addSource('lots', { type: 'geojson', data: empty });
          instance.addSource('lot-selected', { type: 'geojson', data: empty });
          instance.addLayer({ id: 'lot-hit', type: 'fill', source: 'lots', paint: { 'fill-color': '#000', 'fill-opacity': 0 } });
          // Each lot is filled by the year of its latest sale: 2026, 2025, 2024 and older (lots with no recorded sale stay clear).
          instance.addLayer({ id: 'lot-sale-fill', type: 'fill', source: 'lots', paint: { 'fill-opacity': 0.42,
            'fill-color': ['match', ['get', 'saleBand'], 's2026', '#d6336c', 's2025', '#14a37f', 'sOlder', '#3b6fd4', 'rgba(0,0,0,0)'] } });
          instance.addLayer({ id: 'lot-line', type: 'line', source: 'lots', paint: { 'line-color': '#f2c200', 'line-width': ['interpolate', ['linear'], ['zoom'], 15.5, 1, 18, 2.2] } });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-label', type: 'symbol', source: 'lots', minzoom: 17,
            layout: { 'text-field': ['get', 'LABEL'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 0.9] },
            paint: { 'text-color': '#5a4700', 'text-halo-color': '#fff8d6', 'text-halo-width': 1.4 } });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-sale-label', type: 'symbol', source: 'lots', minzoom: 16.6, filter: ['!=', ['get', 'saleBand'], 'none'],
            layout: { 'text-field': ['get', 'saleText'], 'text-size': ['interpolate', ['linear'], ['zoom'], 16.6, 9, 19, 12], 'text-font': ['Noto Sans Regular'], 'text-offset': [0, -0.7], 'text-allow-overlap': true },
            paint: { 'text-color': '#12263a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
          // Category results (hotels, attractions…): blue teardrops with the place name.
          {
            const px = 2, w = 28 * px, h = 40 * px, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            const g = cv.getContext('2d');
            if (g) {
              const cx = w / 2, r = 11 * px, cy = r + 3 * px;
              g.beginPath(); g.moveTo(cx, h - 2 * px);
              g.bezierCurveTo(cx - r * 0.9, cy + r * 1.35, cx - r, cy + r * 0.55, cx - r, cy);
              g.arc(cx, cy, r, Math.PI, 0, false);
              g.bezierCurveTo(cx + r, cy + r * 0.55, cx + r * 0.9, cy + r * 1.35, cx, h - 2 * px);
              g.closePath(); g.fillStyle = '#2f6fd4'; g.fill(); g.lineWidth = 1.5 * px; g.strokeStyle = '#ffffff'; g.stroke();
              g.beginPath(); g.arc(cx, cy, r * 0.38, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
              instance.addImage('place-pin', g.getImageData(0, 0, w, h), { pixelRatio: 2 });
            }
            instance.addSource('place-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            instance.addLayer({ id: 'place-pins', type: 'symbol', source: 'place-pins', layout: {
              'icon-image': 'place-pin', 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
              'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 12, 0.8, 16, 1],
              ...(instance.getStyle().glyphs ? { 'text-field': ['get', 'title'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.3], 'text-optional': true, 'text-max-width': 9 } : {}) },
              paint: { 'text-color': '#17407f', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 } });
            instance.on('mouseenter', 'place-pins', () => { if (instance) instance.getCanvas().style.cursor = 'pointer'; });
            instance.on('mouseleave', 'place-pins', () => { if (instance) instance.getCanvas().style.cursor = ''; });
            instance.on('click', 'place-pins', e => { const id = e.features?.[0]?.properties?.id; if (id) callbacks.current.onPlacePinClick?.(String(id)); });
          }
          instance.addLayer({ id: 'lot-selected-fill', type: 'fill', source: 'lot-selected', paint: { 'fill-color': '#f2c200', 'fill-opacity': 0.28 } });
          instance.addLayer({ id: 'lot-selected-line', type: 'line', source: 'lot-selected', paint: { 'line-color': '#f2c200', 'line-width': 4 } });
          // Side lengths of every lot in view (close zoom only), in small type; the selected lot's are larger.
          instance.addSource('lot-all-dims', { type: 'geojson', data: empty });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-all-dims', type: 'symbol', source: 'lot-all-dims', minzoom: 17.5,
            layout: { 'text-field': ['get', 'label'], 'text-size': ['interpolate', ['linear'], ['zoom'], 17.5, 9, 19, 11], 'text-font': ['Noto Sans Regular'], 'text-rotate': ['get', 'angle'],
              'text-rotation-alignment': 'map', 'text-padding': 1 },
            paint: { 'text-color': '#6b5600', 'text-halo-color': '#fffbe6', 'text-halo-width': 1.4 } });
          // Side lengths of the selected lot, written along each side.
          instance.addSource('lot-dims', { type: 'geojson', data: empty });
          if (instance.getStyle().glyphs) instance.addLayer({ id: 'lot-dims', type: 'symbol', source: 'lot-dims', minzoom: 15.5,
            layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-rotate': ['get', 'angle'],
              'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': [0, -0.7] },
            paint: { 'text-color': '#1d3326', 'text-halo-color': '#fff8d6', 'text-halo-width': 2 } });
          instance.addLayer({ id: 'lot-hover', type: 'fill', source: 'lots', filter: ['==', ['get', 'NO_LOT'], ''], paint: { 'fill-color': '#f2c200', 'fill-opacity': 0.28 } });

          // Hovering a parcel highlights it and names it; clicking opens owner, values and sales.
          const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'lot-tip', offset: 12 });
          // One map-wide handler, so the highlight follows the pointer and clears off-parcel, off-map, while dragging and on zoom.
          let hovered = '';
          const clearHover = () => {
            if (!instance || !hovered) return;
            hovered = ''; instance.getCanvas().style.cursor = '';
            instance.setFilter('lot-hover', ['==', ['get', 'NO_LOT'], '']); tip.remove();
          };
          instance.on('mousemove', e => {
            if (!instance || !instance.getLayer('lot-hit')) return;
            const p = instance.queryRenderedFeatures(e.point, { layers: ['lot-hit'] })[0]?.properties;
            if (!p) { clearHover(); return; }
            const id = String(p.NO_LOT);
            instance.getCanvas().style.cursor = 'pointer';
            tip.setLngLat(e.lngLat);
            const mode = document.body.dataset.lotTab || '';
            if (id + mode === hovered) return;
            hovered = id + mode;
            instance.setFilter('lot-hover', ['==', ['get', 'NO_LOT'], id]);
            tip.setHTML(hoverHtml(p)).addTo(instance);
          });
          instance.getContainer().addEventListener('mouseleave', clearHover);
          instance.on('dragstart', clearHover);
          instance.on('zoomstart', clearHover);
          // Below parcel zoom (or before parcels load), a click still opens the parcel under the pointer.
          instance.on('click', e => {
            if (callbacks.current.placing) { callbacks.current.onPlace?.(e.lngLat.lng, e.lngLat.lat); return; }
            if (!instance || instance.getZoom() < 13) return;
            clearHover();
            callbacks.current.onPointClick?.([e.lngLat.lng, e.lngLat.lat]);
          });
          instance.on('moveend', () => refreshLots());
          // Right-click copies the parcel's address (or its parcel number when it has none). The copy runs on the mouse-down,
          // which is a real user gesture; browsers refuse clipboard writes made later from the context-menu event.
          let copied: { text: string; ok: boolean; kind: string } | null = null;
          const copyText = (text: string) => {
            let ok = false;
            try {
              const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
              document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length); ok = document.execCommand('copy'); t.remove();
            } catch { ok = false; }
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => { if (copied && copied.text === text) copied.ok = true; }).catch(() => undefined);
            return ok;
          };
          instance.on('mousedown', e => {
            copied = null;
            if (!instance || e.originalEvent.button !== 2) return;
            const hit = instance.getLayer('lot-hit') ? instance.queryRenderedFeatures(e.point, { layers: ['lot-hit'] })[0]?.properties : undefined;
            if (!hit) return;
            const raw = String(hit.PHY_ADDR1 || '').trim(), addr = raw && !/^UNASSIGNED/i.test(raw) ? raw : '';
            const text = addr || String(hit.LABEL || hit.PARCEL_ID || '').trim();
            if (!text) return;
            copied = { text, ok: copyText(text), kind: addr ? 'address' : 'parcel number' };
          });
          // Right-click (long-press on touch) anywhere offers Street View at that spot.
          let svPopup: maplibregl.Popup | null = null;
          instance.on('contextmenu', e => {
            if (!instance) return;
            svPopup?.remove();
            const url = streetViewUrl([e.lngLat.lng, e.lngLat.lat]);
            const note = copied ? (copied.ok ? `<div><b>Copied ${copied.kind}:</b> ${esc(copied.text)}</div>` : `<div>${esc(copied.text)} <small>(your browser blocked the copy — select and copy it)</small></div>`) : '';
            svPopup = new maplibregl.Popup({ closeButton: true, className: 'sv-popup' }).setLngLat(e.lngLat)
              .setHTML(`${note}<a href="${url}" target="_blank" rel="noreferrer">Open Street View here ↗</a>`).addTo(instance);
          });
          instance.on('click', 'zoning-fill', e => {
            const code = e.features?.[0]?.properties?.code;
            if (typeof code === 'string') callbacks.current.onSelect(code);
          });
          instance.on('mouseenter', 'zoning-fill', () => { if (instance) instance.getCanvas().style.cursor = 'pointer'; });
          instance.on('mouseleave', 'zoning-fill', () => { if (instance) instance.getCanvas().style.cursor = ''; });
          instance.on('moveend', () => {
            if (!instance) return;
            const c = instance.getCenter(); callbacks.current.onMove({ lng: c.lng, lat: c.lat, zoom: instance.getZoom() });
          });
          // Start with the credits folded behind the (i) button so they never cover the panels.
          host.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          refreshLots();
          setReady(true);
          setMessage(current => current.startsWith('Basemap') ? current : '');
        });
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Unable to start map. Your browser needs WebGL support.');
      }
    }
    function refreshLots() {
      const m = instance;
      if (!m || !m.getSource('lots')) return;
      lotRequest.current?.abort();
      const source = m.getSource('lots') as maplibregl.GeoJSONSource;
      if (!callbacks.current.lotsVisible || m.getZoom() < LOT_MIN_ZOOM) {
        source.setData({ type: 'FeatureCollection', features: [] });
        setSaleCounts(null);
        (m.getSource('lot-all-dims') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
        setLotStatus(callbacks.current.lotsVisible ? (m.getZoom() >= 13 ? 'Click any spot to open its parcel, or zoom in to see outlines' : 'Zoom in to see tax parcels') : '');
        return;
      }
      const controller = new AbortController(); lotRequest.current = controller;
      const b = m.getBounds();
      setLotStatus('Loading tax parcels…');
      lotsInBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], controller.signal).then(data => {
        if (controller.signal.aborted) return;
        const base = data.features.filter(f => f.geometry);
        const paint = (extra?: Map<number, { ms: number; price: number }[]>) => {
          const counts = { s2026: 0, s2025: 0, sOlder: 0, none: 0 };
          const lots = base.map((f, i) => {
            const hideT = !!callbacks.current.hideTransfers;
            let sb = saleBandOf(f.properties as Record<string, unknown>, hideT);
            // County sales (older than the state roll carries) can only make a lot's latest sale newer or fill an empty one.
            for (const c of extra?.get(i) || []) { if (hideT && c.price <= 100) continue; const y = new Date(c.ms).getUTCFullYear(); if (y > sb.year) sb = bandOfSale(y, c.price); }
            counts[sb.band]++;
            return { ...f, properties: { ...f.properties, saleBand: sb.band, saleText: sb.text } };
          });
          setSaleCounts(counts);
          source.setData({ ...data, features: lots } as FeatureCollection);
        };
        paint();
        // Then add each lot's latest sale from the county's own open GIS where it publishes sales for a whole map view.
        void countySalesForLots(base as LotFeature[], [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], controller.signal)
          .then(extra => { if (!controller.signal.aborted && extra.size) paint(extra); }).catch(() => undefined);
        (m.getSource('lot-all-dims') as maplibregl.GeoJSONSource | undefined)?.setData(edgeLabels(base as LotFeature[], e => e.length >= 3 ? `${(e.length * FT_PER_M).toFixed(0)} ft` : ''));
        setLotStatus('');
      }).catch(() => { if (!controller.signal.aborted) setLotStatus('Cadastre lots unavailable'); });
    }
    refreshLotsRef.current = refreshLots;
    void boot();
    return () => { active = false; marker.current?.remove(); instance?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const parts: FilterSpecification[] = [];
    if (props.milieu) parts.push(['==', ['get', 'type'], props.milieu]);
    if (props.activityTypes !== null) parts.push(['in', ['get', 'type'], ['literal', props.activityTypes]]);
    if (props.zoneFilter) parts.push(['==', ['get', 'number'], props.zoneFilter]);
    const filter = (parts.length ? ['all', ...parts] : ['all']) as FilterSpecification;
    m.setFilter('zoning-fill', filter); m.setFilter('zoning-line', filter);
    m.setFilter('zoning-quality', ['all', ...parts, ['==', ['get', 'qualityIssue'], true]] as FilterSpecification);
    const selectedFilter = ['==', ['get', 'code'], props.selected?.code || ''] as FilterSpecification;
    m.setFilter('selected-fill', selectedFilter); m.setFilter('selected-line', selectedFilter);
    for (const id of ['zoning-fill', 'zoning-line', 'zoning-quality', 'selected-fill', 'selected-line']) m.setLayoutProperty(id, 'visibility', props.visible ? 'visible' : 'none');
    m.setPaintProperty('zoning-fill', 'fill-opacity', props.opacity);
  }, [ready, props.selected, props.milieu, props.zoneFilter, props.activityTypes, props.visible, props.opacity]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !props.focus) return;
    m.flyTo({ center: props.focus.coordinates, zoom: props.focus.zoom, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650 });

  }, [props.focus, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    for (const id of ['lot-hit', 'lot-hover', 'lot-line', 'lot-label']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', props.lotsVisible ? 'visible' : 'none');
    refreshLotsRef.current();
  }, [props.lotsVisible, ready]);
  useEffect(() => { if (ready) refreshLotsRef.current(); }, [props.hideTransfers, ready]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    for (const l of PALM_BAY_LAYERS) if (m.getLayer(`pb-${l.id}`)) m.setLayoutProperty(`pb-${l.id}`, 'visibility', props.palmBay?.includes(l.id) ? 'visible' : 'none');
  }, [props.palmBay, ready]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    for (const l of COCOA_LAYERS) if (m.getLayer(`cc-${l.id}`)) m.setLayoutProperty(`cc-${l.id}`, 'visibility', props.cocoa?.includes(l.id) ? 'visible' : 'none');
  }, [props.cocoa, ready]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    for (const l of TITUSVILLE_LAYERS) if (m.getLayer(`tv-${l.id}`)) m.setLayoutProperty(`tv-${l.id}`, 'visibility', props.titusville?.includes(l.id) ? 'visible' : 'none');
  }, [props.titusville, ready]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    for (const l of MELBOURNE_LAYERS) if (m.getLayer(`mb-${l.id}`)) m.setLayoutProperty(`mb-${l.id}`, 'visibility', props.melbourne?.includes(l.id) ? 'visible' : 'none');
  }, [props.melbourne, ready]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    for (const l of BREVARD_UTIL_LAYERS) if (m.getLayer(`bu-${l.id}`)) m.setLayoutProperty(`bu-${l.id}`, 'visibility', props.brevardUtil?.includes(l.id) ? 'visible' : 'none');
  }, [props.brevardUtil, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource('lot-selected') as maplibregl.GeoJSONSource | undefined;
    source?.setData({ type: 'FeatureCollection', features: props.selectedLot?.geometry ? [props.selectedLot as never] : [] });
    const dims = m.getSource('lot-dims') as maplibregl.GeoJSONSource | undefined;
    dims?.setData(edgeLabels(props.selectedLot ? [props.selectedLot] : [], e => `${(e.length * FT_PER_M).toFixed(1)} ft · ${e.length.toFixed(1)} m`));
  }, [props.selectedLot, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer('satellite')) return;
    m.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none');
    // Lot outlines read better a touch heavier over imagery.
    m.setPaintProperty('lot-line', 'line-width', ['interpolate', ['linear'], ['zoom'], 15.5, satellite ? 1.5 : 1, 18, satellite ? 2.8 : 2.2]);
    try { localStorage.setItem('atlas-basemap', satellite ? 'satellite' : 'map'); } catch { /* storage unavailable */ }
  }, [satellite, ready]);

  useEffect(() => {
    marker.current?.remove(); marker.current = null;
    if (ready && map.current && props.addressCoordinates) {
      marker.current = new maplibregl.Marker({ color: '#254b3c' }).setLngLat(props.addressCoordinates).addTo(map.current);
    }
  }, [props.addressCoordinates, ready]);

  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    (m.getSource('place-pins') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: (props.placePins || []).map(p => ({ type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: p.coordinates }, properties: { id: p.id, title: p.title } })) });
  }, [props.placePins, ready]);
  useEffect(() => {
    const m = map.current, pins = props.placePins || [];
    if (!m || !ready || !props.placeFit || !pins.length) return;
    const b = new maplibregl.LngLatBounds(pins[0].coordinates, pins[0].coordinates);
    pins.forEach(p => b.extend(p.coordinates));
    m.fitBounds(b, { padding: { top: 90, bottom: 90, left: window.innerWidth > 760 ? 420 : 40, right: 50 }, maxZoom: 14, duration: 800 });
  }, [props.placeFit, ready]);
  useEffect(() => {
    const m = map.current; if (!m || !ready) return;
    for (const id of ['lot-sale-fill', 'lot-sale-label']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', saleColors ? 'visible' : 'none');
    try { localStorage.setItem('atlas-sale-colors', saleColors ? '1' : '0'); } catch { /* ignore */ }
  }, [saleColors, ready]);
  return <div className={`map-wrap${props.placing ? ' placing' : ''}`}><div ref={host} className="map-canvas" aria-label="Interactive Florida parcel map" />
    {!ready && !message && <div className="map-message">Loading map…</div>}
    {message && <div className={`map-message ${message.startsWith('Basemap') ? 'subtle' : ''}`} role="status">{message}</div>}
    {ready && <div className="basemap-switch" role="group" aria-label="Basemap"><button className={satellite ? '' : 'on'} aria-pressed={!satellite} onClick={() => setSatellite(false)}>Map</button><button className={satellite ? 'on' : ''} aria-pressed={satellite} onClick={() => setSatellite(true)}>Satellite</button></div>}
    {lotStatus && <div className="lot-status" role="status">{lotStatus}</div>}
    {ready && saleCounts && <div className="sale-scale" role="group" aria-label="Latest sale colours">
      <div className="sale-scale-head"><strong>Latest sale</strong><button className={`toggle ${saleColors ? 'on' : ''}`} role="switch" aria-checked={saleColors} aria-label="Colour lots by latest sale" onClick={() => setSaleColors(v => !v)}><span/></button></div>
      {saleColors && <ul>
        <li><i style={{ background: '#d6336c' }}/>2026<b>{saleCounts.s2026}</b></li>
        <li><i style={{ background: '#14a37f' }}/>2025<b>{saleCounts.s2025}</b></li>
        <li><i style={{ background: '#3b6fd4' }}/>2024 and older<b>{saleCounts.sOlder}</b></li>
        <li><i className="none"/>No sale on the roll<b>{saleCounts.none}</b></li>
      </ul>}
      <small>Lots in view. The state roll carries only 2025–26 sales; older sales are added from the county for Broward, Lee, Miami-Dade, Pinellas, Bay, Leon and Okaloosa (latest sale only in Walton, Washington, Jackson and Suwannee).</small>
    </div>}
    <div className="map-caption"><span className="live-dot" /> MUNICIPAL OPEN DATA <span className="caption-divider">/</span> MONTRÉAL, QUÉBEC</div>
  </div>;
}

const esc = (v: unknown) => String(v ?? '').replace(/[<>&"]/g, '');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Hover label: parcel and address; with the Sales tab open, the parcel's recent sales from the state roll. */
function hoverHtml(p: Record<string, unknown>) {
  const head = `<b>Parcel ${esc(p.LABEL || p.NO_LOT)}</b>${p.PHY_ADDR1 && !/^UNASSIGNED/i.test(String(p.PHY_ADDR1)) ? `<br>${esc(p.PHY_ADDR1)}` : ''}`;
  if (document.body.dataset.lotTab !== 'sales') return `${head}<br><small>Click for owner, value & sales</small>`;
  const rows = [1, 2].map(i => ({ price: Number(p[`SALE_PRC${i}`]) || 0, yr: Number(p[`SALE_YR${i}`]) || 0, mo: Number(p[`SALE_MO${i}`]) || 0 })).filter(r => r.yr);
  const body = rows.length
    ? rows.map(r => `<div class="tip-sale"><span>${r.mo ? MONTHS[r.mo - 1] + ' ' : ''}${r.yr}</span><b>${r.price > 100 ? '$' + r.price.toLocaleString('en-US') : 'Nominal'}</b></div>`).join('')
    : '<small>No sale in the last two roll years</small>';
  return `${head}${body}<small>Click for full sales history</small>`;
}
