import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, FolderOpen, Info, Layers, MapPin, RotateCcw, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import MapView from './components/MapView';
import LotPanel from './components/LotPanel';
import Reports from './components/Reports';
import type { LotSnapshot } from './lib/files';
import { changeMilieu, selectDropdownZone, zonesForType } from './lib/zoning';
import { DEFAULT_VIEW, readOpen, readProps, encodeProps, encodeView, loadAtlas, readView } from './lib/data';
import { PALM_BAY_LAYERS } from './lib/palmBay';
import { COCOA_LAYERS } from './lib/cocoa';
import { TITUSVILLE_LAYERS } from './lib/titusville';
import { MELBOURNE_LAYERS } from './lib/melbourne';
import { BREVARD_UTIL_LAYERS } from './lib/brevardUtilities';
import { CB_LAYERS } from './lib/cocoaBeach';
import { LEE_LAYERS } from './lib/leeCounty';
import { NP_LAYERS } from './lib/northPort';
import { CH_LAYERS } from './lib/charlotte';
import { PSL_LAYERS } from './lib/portStLucie';
import { CIT_LAYERS } from './lib/citrus';
import { PC_LAYERS } from './lib/palmCoast';
import { HN_LEGEND } from './lib/hernando';
import { MN_LEGEND } from './lib/marion';
import { ALL_SETS, POLY_GROUPS } from './lib/polySets';
import { FLWMI_LAYERS, FLWMI_LEGEND } from './lib/flwmi';
import MyPinsPanel from './components/MyPinsPanel';
import { useMyPins } from './lib/myPins';
import { BROWSE_CHIPS, browseCategory, searchAtlas, type BrowseChip } from './lib/search';
import { territoryAt } from './lib/territory';
import { useDrag } from './lib/useDrag';
import { findLot, lotAtPoint, lotCenter, normalizeLot, streetViewUrl, type LotFeature } from './lib/lots';
import { FAMILIES, type Metadata, type Pin, type SearchResult, type ViewState, type Zone } from './lib/types';

const numberFormat = new Intl.NumberFormat('en-US');
const ZONING_GUIDE = 'https://www.nyc.gov/site/planning/zoning/districts-tools.page';

export default function App() {
  const [initial] = useState(readView);
  const [view, setView] = useState<ViewState>(initial);
  const [pins, setPins] = useState<Pin[]>(() => readProps());
  const [activePin, setActivePin] = useState<number | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const [browse, setBrowse] = useState<BrowseChip | null>(null);
  const [includeSmall, setIncludeSmall] = useState(false);
  const [browseList, setBrowseList] = useState<SearchResult[]>([]);
  const [browseState, setBrowseState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [placeFit, setPlaceFit] = useState(0);
  const mine = useMyPins('atlas-my-pins-fl');
  const [placing, setPlacing] = useState(false);
  const [cbOn, setCbOn] = useState(() => { try { return localStorage.getItem('atlas-cocoabeach') === '1'; } catch { return false; } });
  const [cbLayers, setCbLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-cocoabeach-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return CB_LAYERS.filter(l => l.on).map(l => l.id); });
  const [leeOn, setLeeOn] = useState(() => { try { return localStorage.getItem('atlas-lee') === '1'; } catch { return false; } });
  const [leeLayers, setLeeLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-lee-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return LEE_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-lee', leeOn ? '1' : '0'); localStorage.setItem('atlas-lee-layers', JSON.stringify(leeLayers)); } catch { /* ignore */ } }, [leeOn, leeLayers]);
  const [npOn, setNpOn] = useState(() => { try { return localStorage.getItem('atlas-northport') === '1'; } catch { return false; } });
  const [npLayers, setNpLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-northport-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return NP_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-northport', npOn ? '1' : '0'); localStorage.setItem('atlas-northport-layers', JSON.stringify(npLayers)); } catch { /* ignore */ } }, [npOn, npLayers]);
  const [chOn, setChOn] = useState(() => { try { return localStorage.getItem('atlas-charlotte') === '1'; } catch { return false; } });
  const [chLayers, setChLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-charlotte-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return CH_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-charlotte', chOn ? '1' : '0'); localStorage.setItem('atlas-charlotte-layers', JSON.stringify(chLayers)); } catch { /* ignore */ } }, [chOn, chLayers]);
  const [pslOn, setPslOn] = useState(() => { try { return localStorage.getItem('atlas-stlucie') === '1'; } catch { return false; } });
  const [pslLayers, setPslLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-stlucie-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return PSL_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-stlucie', pslOn ? '1' : '0'); localStorage.setItem('atlas-stlucie-layers', JSON.stringify(pslLayers)); } catch { /* ignore */ } }, [pslOn, pslLayers]);
  const [citOn, setCitOn] = useState(() => { try { return localStorage.getItem('atlas-citrus') === '1'; } catch { return false; } });
  const [citLayers, setCitLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-citrus-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return CIT_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-citrus', citOn ? '1' : '0'); localStorage.setItem('atlas-citrus-layers', JSON.stringify(citLayers)); } catch { /* ignore */ } }, [citOn, citLayers]);
  const [fwOn, setFwOn] = useState(() => { try { return localStorage.getItem('atlas-flwmi') === '1'; } catch { return false; } });
  const [fwLayers, setFwLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-flwmi-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return FLWMI_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-flwmi', fwOn ? '1' : '0'); localStorage.setItem('atlas-flwmi-layers', JSON.stringify(fwLayers)); } catch { /* ignore */ } }, [fwOn, fwLayers]);
  const [pcOn, setPcOn] = useState(() => { try { return localStorage.getItem('atlas-palmcoast') === '1'; } catch { return false; } });
  const [pcLayers, setPcLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-palmcoast-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return PC_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-palmcoast', pcOn ? '1' : '0'); localStorage.setItem('atlas-palmcoast-layers', JSON.stringify(pcLayers)); } catch { /* ignore */ } }, [pcOn, pcLayers]);
  const [hnOn, setHnOn] = useState(() => { try { return localStorage.getItem('atlas-hernando') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('atlas-hernando', hnOn ? '1' : '0'); } catch { /* ignore */ } }, [hnOn]);
  const [mnOn, setMnOn] = useState(() => { try { return localStorage.getItem('atlas-marion') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('atlas-marion', mnOn ? '1' : '0'); } catch { /* ignore */ } }, [mnOn]);
  const [polyGroups, setPolyGroups] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-polygroups'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return []; });
  const [polyIds, setPolyIds] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-polyids'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return ALL_SETS.filter(s => !/^(sr-vr|po-ps|tb-th|mt-h)$/.test(s.id)).map(s => s.id); });
  useEffect(() => { try { localStorage.setItem('atlas-polygroups', JSON.stringify(polyGroups)); localStorage.setItem('atlas-polyids', JSON.stringify(polyIds)); } catch { /* ignore */ } }, [polyGroups, polyIds]);
  const polysOn = ALL_SETS.filter(s => polyGroups.includes(s.group) && polyIds.includes(s.id)).map(s => s.id);
  useEffect(() => { try { localStorage.setItem('atlas-cocoabeach', cbOn ? '1' : '0'); localStorage.setItem('atlas-cocoabeach-layers', JSON.stringify(cbLayers)); } catch { /* ignore */ } }, [cbOn, cbLayers]);
  const [buOn, setBuOn] = useState(() => { try { return localStorage.getItem('atlas-brevardutil') === '1'; } catch { return false; } });
  const [buLayers, setBuLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-brevardutil-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return BREVARD_UTIL_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-brevardutil', buOn ? '1' : '0'); localStorage.setItem('atlas-brevardutil-layers', JSON.stringify(buLayers)); } catch { /* ignore */ } }, [buOn, buLayers]);
  const [mbOn, setMbOn] = useState(() => { try { return localStorage.getItem('atlas-melbourne') === '1'; } catch { return false; } });
  const [mbLayers, setMbLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-melbourne-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return MELBOURNE_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-melbourne', mbOn ? '1' : '0'); localStorage.setItem('atlas-melbourne-layers', JSON.stringify(mbLayers)); } catch { /* ignore */ } }, [mbOn, mbLayers]);
  const [tvOn, setTvOn] = useState(() => { try { return localStorage.getItem('atlas-titusville') === '1'; } catch { return false; } });
  const [tvLayers, setTvLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-titusville-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return TITUSVILLE_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-titusville', tvOn ? '1' : '0'); localStorage.setItem('atlas-titusville-layers', JSON.stringify(tvLayers)); } catch { /* ignore */ } }, [tvOn, tvLayers]);
  const [cocoaOn, setCocoaOn] = useState(() => { try { return localStorage.getItem('atlas-cocoa') === '1'; } catch { return false; } });
  const [cocoaLayers, setCocoaLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-cocoa-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return COCOA_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-cocoa', cocoaOn ? '1' : '0'); localStorage.setItem('atlas-cocoa-layers', JSON.stringify(cocoaLayers)); } catch { /* ignore */ } }, [cocoaOn, cocoaLayers]);
  const [palmBayOn, setPalmBayOn] = useState(() => { try { return localStorage.getItem('atlas-palmbay') === '1'; } catch { return false; } });
  const [palmBayLayers, setPalmBayLayers] = useState<string[]>(() => { try { const s = localStorage.getItem('atlas-palmbay-layers'); if (s) return JSON.parse(s) as string[]; } catch { /* ignore */ } return PALM_BAY_LAYERS.filter(l => l.on).map(l => l.id); });
  useEffect(() => { try { localStorage.setItem('atlas-palmbay', palmBayOn ? '1' : '0'); localStorage.setItem('atlas-palmbay-layers', JSON.stringify(palmBayLayers)); } catch { /* ignore */ } }, [palmBayOn, palmBayLayers]);
  const [hideTransfers, setHideTransfers] = useState(() => { try { return localStorage.getItem('atlas-hide-transfers') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('atlas-hide-transfers', hideTransfers ? '1' : '0'); } catch { /* ignore */ } }, [hideTransfers]);
  const [activeMine, setActiveMine] = useState<string | null>(null);
  // Pins are stuck to parcels: a dropped or dragged pin moves to the centre of the parcel under it and remembers that parcel.
  const parcelOf = (lot: LotFeature) => { const pr = lot.properties as Record<string, unknown>; return { parcel: `${pr.CO_NO ?? ''}-${pr.PARCEL_ID ?? ''}`, address: String(pr.PHY_ADDR1 || pr.LABEL || '').trim() }; };
  async function dropPin(lng: number, lat: number) {
    let at: [number, number] = [lng, lat], on: { parcel: string; address: string } | undefined;
    try { const lot = await lotAtPoint([lng, lat]); const c = lot && lotCenter(lot); if (lot && c) { at = c; on = parcelOf(lot); } } catch { /* no parcel here: keep the clicked spot */ }
    setActiveMine(mine.add(at[0], at[1], on?.address || '', on)); setRailOpen(true);
  }
  async function movePin(id: string, lng: number, lat: number) {
    const old = mine.pins.find(p => p.id === id); if (!old) return;
    try {
      const lot = await lotAtPoint([lng, lat]); const c = lot && lotCenter(lot);
      if (lot && c) {
        const on = parcelOf(lot);
        // Keep a name you typed; replace one that was just the old parcel's address or "Pin N".
        const auto = !old.label || /^Pin \d+$/.test(old.label) || old.label === old.address;
        mine.update(id, { lng: c[0], lat: c[1], ...on, ...(auto && on.address ? { label: on.address } : {}) });
        return;
      }
    } catch { /* lookup failed: put it back */ }
    mine.update(id, { lng: old.lng, lat: old.lat }); // no parcel where it was dropped: back to its parcel
  }
  useEffect(() => {
    if (!placing) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlacing(false); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [placing]);
  const [truncated, setTruncated] = useState(false);
  const [focus, setFocus] = useState<{ coordinates: [number, number]; zoom: number; serial: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [addressCoordinates, setAddressCoordinates] = useState<[number, number] | null>(null);
  const [opacity, setOpacity] = useState(0.45);
  const [about, setAbout] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [shareMessage, setShareMessage] = useState('');
  const [lotsVisible, setLotsVisible] = useState(true);
  const [lastLot, setLastLot] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportLot, setReportLot] = useState<LotSnapshot | null>(null);
  const [selectedLot, setSelectedLot] = useState<LotFeature | null>(null);
  const [lotState, setLotState] = useState<'idle' | 'loading' | 'notfound' | 'nogeometry' | 'error' | 'invalid'>('idle');
  const [cityLinks, setCityLinks] = useState<Record<string, { zoning: string }>>({});
  const detailDrag = useDrag('detail');
  const railDrag = useDrag('rail');
  const lotSearchId = useRef(0);
  const linkedOpen = useRef(readOpen()); // read before the view effect rewrites the hash
  const linkedDone = useRef(false);
  const searchId = useRef(0);
  const [scope, setScope] = useState('');
  const zoneCity = (z: Zone) => z.city || 'New York City';
  const zonedCities = new Set(zones.map(zoneCity));
  const scopes = [...new Set([...zonedCities, ...(scope ? [scope] : [])])].sort((a, b) => a.localeCompare(b));
  const scopeHasZoning = !scope || zonedCities.has(scope);
  const cityScope = !!scope;
  const scopedZones = scope ? zones.filter(z => zoneCity(z) === scope) : zones;
  const selected = zones.find(z => z.code === view.zone) || null;
  const types = [...new Set(scopedZones.map(z => z.type))].sort((a, b) => a.localeCompare(b));
  const scopeTypes = scope ? (scopeHasZoning ? types : []) : null;
  const dropdownZones = zonesForType(scopedZones, view.milieu);
  const dropdownValue = dropdownZones.some(z => z.code === view.zone) ? view.zone : '';
  const visibleCount = scopedZones.filter(z => (!view.milieu || z.type === view.milieu) && (!view.zoneFilter || z.number === view.zoneFilter)).length;

  useEffect(() => {
    void loadAtlas().then(data => { setZones(data.zones); setMetadata(data.metadata); }).catch(e => setError(e.message));
    void fetch('/data/territory-links.json', { cache: 'no-cache' }).then(r => r.json()).then((links: Record<string, { zoning: string }>) => fetch('/data/territories.geojson').then(r => r.json()).then(t => {
      const byName: Record<string, { zoning: string }> = {};
      for (const f of t.features) if (links[f.properties.code]) byName[f.properties.name] = links[f.properties.code];
      setCityLinks(byName);
    })).catch(() => undefined);
    const onHash = () => {
      const next = readView();
      // A link that only carries properties (no lng/lat) must not reset the view: the map fits to those properties instead.
      if (/(^|[#&])lng=/.test(window.location.hash) || !readProps().length) { setView(next); setFocus({ coordinates: [next.lng, next.lat], zoom: next.zoom, serial: Date.now() }); }
      const o = readOpen(); if (o.open) void openLinked(o.addr, [next.lng, next.lat]);
      const np = readProps(); if (np.length) { setPins(np); setActivePin(null); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A link with open=1 (e.g. from the DRE app) opens the parcel card at those coordinates, like clicking the parcel.
  useEffect(() => {
    if (!metadata || linkedDone.current || !linkedOpen.current.open) return;
    linkedDone.current = true;
    const v = readView();
    void openLinked(linkedOpen.current.addr, [v.lng, v.lat]);
  }, [metadata]);

  useEffect(() => {
    if (!metadata) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search + encodeView(view) + encodeProps(pins));
  }, [view, metadata, pins]);

  useEffect(() => {
    const current = ++searchId.current;
    if (!metadata || query.trim().length < 2) { setResults([]); setSearchState('idle'); return; }
    const controller = new AbortController();
    setSearchState('loading');
    const timer = window.setTimeout(() => {
      void searchAtlas(query, zones, metadata.addressShards, controller.signal).then(found => {
        if (current !== searchId.current) return;
        setResults(found.results); setTruncated(found.truncated); setSearchState('done');
      }).catch(e => { if (!controller.signal.aborted && current === searchId.current) { setSearchError(e.message); setSearchState('error'); } });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, metadata, zones]);

  // Hotels, attractions, ski/golf/parks: everything of that kind in the map view, nearest the centre first.
  useEffect(() => {
    if (!browse) { setBrowseList([]); setBrowseState('idle'); return; }
    const controller = new AbortController();
    setBrowseState('loading');
    const wide = view.zoom <= 7.5, half = Math.max(0.12, Math.min(2.5, 360 / 2 ** view.zoom * 1.2));
    const extent: [number, number, number, number] = wide ? [-87.7, 24.4, -79.9, 31.1] : [view.lng - half, view.lat - half * 0.75, view.lng + half, view.lat + half * 0.75];
    void browseCategory(browse, extent, [view.lng, view.lat], includeSmall, controller.signal)
      .then(list => { setBrowseList(list); setBrowseState('done'); if (list.length) setPlaceFit(n => n + 1); })
      .catch(e => { if (!controller.signal.aborted) { setSearchError(e.message); setBrowseState('error'); } });
    return () => controller.abort();
    // re-run when the chip or the size filter changes, not on every pan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browse, includeSmall]);

  async function scopeAt(point: [number, number], clearZone = false) {
    const t = await territoryAt(point).catch(() => null);
    setScope(!t ? '' : t.type === 'borough' ? 'New York City' : t.name);
    if (clearZone) setView(current => ({ ...current, milieu: '', zoneFilter: '', zone: '' }));
  }
  function clearLot() { setSelectedLot(null); setLotState('idle'); }

  async function choose(result: SearchResult) {
    setView(current => ({ ...current, zone: result.zoneCodes.length === 1 ? result.zoneCodes[0] : '', milieu: '', zoneFilter: '', visible: true }));
    void scopeAt(result.coordinates);
    setSelectedAddress(result.kind === 'address' || result.kind === 'poi' ? result.title : '');
    setAddressCoordinates(result.kind === 'address' || result.kind === 'poi' ? result.coordinates : null);
    setFocus({ coordinates: result.coordinates, zoom: result.zoom ?? (result.kind === 'address' ? 17.5 : 14), serial: Date.now() });
    setQuery(''); setResults([]); setSearchState('idle'); setBrowse(null);
    if (window.innerWidth < 760) setRailOpen(false);
    if (result.kind !== 'address' && result.kind !== 'poi') return;
    // An address opens the tax parcel it sits on, with its assessment record.
    const id = ++lotSearchId.current;
    setLotState('loading'); setLotsVisible(true);
    try {
      const lot = await lotAtPoint(result.coordinates, undefined, result.kind === 'poi' ? '' : result.title);
      if (id !== lotSearchId.current) return;
      setSelectedLot(lot); setLastLot(''); setLotState(lot ? 'idle' : 'notfound');
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  function choosePin(p: Pin) {
    setActivePin(p.n);
    if (window.innerWidth < 760) setRailOpen(false);
    void openLinked(p.addr, [p.lng, p.lat]);
  }
  async function openLinked(addr: string, coordinates: [number, number]) {
    const id = ++lotSearchId.current;
    setLotState('loading'); setLotsVisible(true);
    setSelectedAddress(addr); setAddressCoordinates(addr ? coordinates : null);
    try {
      const lot = await lotAtPoint(coordinates, undefined, addr);
      if (id !== lotSearchId.current) return;
      if (!lot) { setLotState('notfound'); return; }
      setSelectedLot(lot); setLastLot(''); setLotState('idle');
      const center = lotCenter(lot);
      if (center) { void scopeAt(center, true); setFocus({ coordinates: center, zoom: 18, serial: Date.now() }); }
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  async function lotAt(coordinates: [number, number]) {
    const id = ++lotSearchId.current;
    setLotState('loading'); setLotsVisible(true);
    try {
      const lot = await lotAtPoint(coordinates);
      if (id !== lotSearchId.current) return;
      if (!lot) { setLotState('notfound'); return; }
      setSelectedLot(lot); setSelectedAddress(''); setAddressCoordinates(null); setLastLot(''); setLotState('idle');
      const center = lotCenter(lot);
      if (center) { void scopeAt(center, true); setFocus({ coordinates: center, zoom: 18, serial: Date.now() }); }
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  async function searchLot(input: string) {
    const id = ++lotSearchId.current;
    if (!normalizeLot(input)) { setLotState('invalid'); return; }
    setLastLot(normalizeLot(input));
    setLotState('loading');
    try {
      const lot = await findLot(input);
      if (id !== lotSearchId.current) return;
      if (!lot) { setSelectedLot(null); setLotState('notfound'); return; }
      setSelectedLot(lot); setSelectedAddress(''); setAddressCoordinates(null);
      const center = lotCenter(lot);
      if (center) void scopeAt(center, true);
      if (!center) { setLotState('nogeometry'); return; }
      setLotState('idle'); setLotsVisible(true); setQuery(''); setResults([]);
      setFocus({ coordinates: center, zoom: 18.6, serial: Date.now() });
      if (window.innerWidth < 760) setRailOpen(false);
    } catch { if (id === lotSearchId.current) setLotState('error'); }
  }
  function reset() {
    setView({ ...DEFAULT_VIEW }); setScope(''); setSelectedAddress(''); setQuery(''); setAddressCoordinates(null); clearLot();
    setFocus({ coordinates: [DEFAULT_VIEW.lng, DEFAULT_VIEW.lat], zoom: DEFAULT_VIEW.zoom, serial: Date.now() });
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setShareMessage('Link copied'); }
    catch { setShareMessage('Copy the URL from your browser address bar'); }
    window.setTimeout(() => setShareMessage(''), 3500);
  }
  function chooseMilieu(milieu: string) { setView(current => changeMilieu(current, milieu, zones)); }
  function chooseZone(code: string) {
    setView(current => selectDropdownZone(current, code, zones));
    const match = dropdownZones.find(zone => zone.code === code);
    if (match) {
      setFocus({ coordinates: match.center, zoom: 13.5, serial: Date.now() });
      if (window.innerWidth < 760) setRailOpen(false);
    }
  }
  const lotLike = /^[\d\s]+$/.test(query.trim()) && !!normalizeLot(query);
  function zoneSummary(z: Zone) {
    return <span className="zone-summary"><i style={{ background: FAMILIES[z.family]?.color }}/>{z.city ? `District ${z.number} · ${z.type.split(' · ')[1] || FAMILIES[z.family]?.label.replace('Zoning · ', '')}` : z.code}</span>;
  }
  function zoneText(z: Zone) {
    return z.city ? `District ${z.number} · ${z.type.split(' · ')[1] || FAMILIES[z.family]?.label.replace('Zoning · ', '')} (${z.city})` : z.code;
  }
  function zoneBody(z: Zone) {
    return z.city ? <>
      <p className="zone-note">NYC base zoning district. R = residential, C = commercial, M = manufacturing; the number sets bulk (FAR, height). Overlays and special districts are on the parcel card.</p>
      <a className="primary-link" href="https://zola.planning.nyc.gov/" target="_blank" rel="noreferrer">Open ZoLa (NYC zoning map) <ArrowUpRight size={15}/></a>
      <a className="secondary-link" href={ZONING_GUIDE} target="_blank" rel="noreferrer">What {z.number} allows <ArrowUpRight size={14}/></a>
      {z.grid && <a className="secondary-link" href={z.grid} target="_blank" rel="noreferrer">NYC Zoning Resolution <ArrowUpRight size={14}/></a>}
    </> : null;
  }
  const lotPoint = addressCoordinates;

  return <div className="atlas-app">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); reset(); }} aria-label="Florida Lot Atlas home">
        <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 29 15 7l12 3 8 17-14 8L5 29Z" stroke="currentColor" strokeWidth="1.5"/><path d="m11 26 7-13 7 2 5 10-9 5-10-4Z" stroke="currentColor" strokeWidth="1.5"/><path d="m17 24 4-6 4 5-4 3-4-2Z" fill="currentColor"/></svg>
        <span className="wordmark">FLORIDA <span>LOT ATLAS</span></span>
      </a>
      <div className="topbar-middle"><span className="edition">INDEPENDENT MAP EXPLORER</span><span className="pill">Florida, USA</span></div>
      <nav className="header-actions"><button className="quiet-button" onClick={() => { setReportLot(null); setReportsOpen(true); }}><FolderOpen size={16}/> Property files</button><button className="quiet-button about-button" onClick={() => setAbout(true)}><Info size={16}/> About the data</button><button className="share-button" onClick={share}>{shareMessage === 'Link copied' ? <Check size={16}/> : <Copy size={16}/>}<span>{shareMessage || 'Share view'}</span></button></nav>
    </header>
    <main className="workspace">
      {metadata && <MapView polys={polysOn} hernando={hnOn ? ['areas'] : []} marion={mnOn ? ['areas'] : []} palmCoast={pcOn ? pcLayers : []} citrus={citOn ? citLayers : []} flwmi={fwOn ? fwLayers : []} northPort={npOn ? npLayers : []} charlotte={chOn ? chLayers : []} stLucie={pslOn ? pslLayers : []} lee={leeOn ? leeLayers : []} cocoaBeach={cbOn ? cbLayers : []} brevardUtil={buOn ? buLayers : []} melbourne={mbOn ? mbLayers : []} titusville={tvOn ? tvLayers : []} cocoa={cocoaOn ? cocoaLayers : []} palmBay={palmBayOn ? palmBayLayers : []} hideTransfers={hideTransfers} initial={initial} selected={selected} milieu={view.milieu} zoneFilter={view.zoneFilter} activityTypes={scopeTypes} visible={view.visible} opacity={opacity} focus={focus} addressCoordinates={addressCoordinates}
        lotsVisible={lotsVisible} selectedLot={selectedLot} myPins={mine.pins} activeMyPin={activeMine} placing={placing} onPlace={(lng, lat) => void dropPin(lng, lat)} onMyPinClick={id => { setActiveMine(id); setRailOpen(true); }} onMyPinMove={(id, lng, lat) => void movePin(id, lng, lat)} pins={pins} activePin={activePin} onPinClick={choosePin} placePins={!query && browse ? browseList.map(r => ({ id: r.id, title: r.title, coordinates: r.coordinates })) : undefined} placeFit={placeFit} onPlacePinClick={id => { const r = browseList.find(x => x.id === id); if (r) void choose(r); }} onLotClick={lot => void searchLot(lot)} onPointClick={c => void lotAt(c)}
        onSelect={code => { setView(current => ({ ...current, zone: code })); const z = zones.find(x => x.code === code); if (z && scope && zoneCity(z) !== scope) setScope(zoneCity(z)); }}
        onMove={position => setView(current => ({ ...current, ...position }))}/>}
      {error && <div className="fatal-error" role="alert">{error}<button onClick={() => window.location.reload()}>Reload map</button></div>}
      <button className="rail-toggle" onClick={() => setRailOpen(!railOpen)} aria-label={railOpen ? 'Close explorer' : 'Open explorer'}>{railOpen ? <ChevronLeft size={18}/> : <SlidersHorizontal size={18}/>}</button>
      <aside className={`explorer-rail compact ${railOpen ? '' : 'collapsed'}`} aria-label="Map explorer" style={railOpen ? railDrag.style : undefined}>
        <div className="rail-heading drag-handle" {...railDrag.handle}><span className="grip" aria-hidden="true"/><div className="eyebrow">FLORIDA · PARCELS, OWNERS, VALUES & SALES</div></div>
        <section className="search-section">
          <form className="search-input" onSubmit={e => { e.preventDefault(); if (lotLike) void searchLot(query); else if (results[0]) void choose(results[0]); }}><Search size={18}/><input id="atlas-search" value={query} onChange={e => { setQuery(e.target.value); setLotState('idle'); if (e.target.value) setBrowse(null); }} placeholder="Address, city, ZIP, hotel or attraction" autoComplete="off" aria-label="Search a Florida address"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={15}/></button>}</form>
          {!query && <div className="browse-chips" role="group" aria-label="Browse places">{BROWSE_CHIPS.map(c => <button key={c.id} className={`chip ${browse?.id === c.id ? 'on' : ''}`} onClick={() => setBrowse(b => b?.id === c.id ? null : c)}>{c.label}</button>)}</div>}
          {!query && browse && <div className="search-results">
            <div className="result-heading"><span>{browse.label} {view.zoom <= 7.5 ? 'across Florida' : 'in the map view'} · nearest first</span></div>
            {browse.large && <label className="browse-filter"><input type="checkbox" checked={includeSmall} onChange={e => setIncludeSmall(e.target.checked)}/> Include small stays and rentals</label>}
            {browse.large && !includeSmall && <p className="search-hint">No room counts are published, so "large" is judged by name: resorts, casinos, conference hotels and major chains.</p>}
            {browseState === 'loading' && <div className="search-feedback" role="status"><span className="spinner"/> Looking around the map…</div>}
            {browseState === 'error' && <div className="search-feedback error" role="alert">{searchError}</div>}
            {browseState === 'done' && browseList.length === 0 && <div className="search-feedback">Nothing found in this view. Zoom out or pan, then pick the category again.</div>}
            {browseList.map(r => <button key={r.id} className="result" onClick={() => void choose(r)}><MapPin size={16}/><span><strong>{r.title}</strong><small>{r.subtitle}</small></span><ChevronRight size={14}/></button>)}
          </div>}
          {lotLike && <button className="result lot-result" onClick={() => void searchLot(query)}><span className="lot-dot"/><span><strong>Parcel {normalizeLot(query)}</strong><small>Open this parcel (SWIS + SBL key)</small></span><ChevronRight size={14}/></button>}
          {searchState === 'loading' && !lotLike && <div className="search-feedback" role="status"><span className="spinner"/> Searching addresses…</div>}
          {searchState === 'error' && <div className="search-feedback error" role="alert">{searchError}</div>}
          {searchState === 'done' && results.length === 0 && !lotLike && <div className="search-feedback">No matching Florida address. Try number, street and city, e.g. 400 S Monroe St Tallahassee.</div>}
          {searchState === 'done' && results.length > 0 && <div className="search-results">{results.map(r => <button key={r.id} className="result" onClick={() => void choose(r)}><MapPin size={16}/><span><strong>{r.title}</strong><small>{r.subtitle}</small></span><ChevronRight size={14}/></button>)}{truncated && <div className="result-heading"><span>Refine your search</span></div>}</div>}
          {lotState === 'loading' && <div className="search-feedback" role="status"><span className="spinner"/> Opening parcel…</div>}
          {lotState === 'notfound' && <div className="search-feedback">{lastLot ? `No parcel ${lastLot}.` : 'No tax parcel found at this point.'}</div>}
          {lotState === 'nogeometry' && <div className="search-feedback">Parcel {selectedLot?.properties.LABEL} has no outline.</div>}
          {lotState === 'error' && <div className="search-feedback error" role="alert">The Florida parcel service did not respond. Try again.</div>}
          {!query && !selectedLot && <p className="search-hint">Search an address, city, hotel or attraction, or zoom in and click any yellow parcel.</p>}
          {pins.length > 0 && <div className="pin-list">
            <div className="pin-list-head"><strong>Properties sent from DRE ({pins.length})</strong><button className="text-button" onClick={() => { setPins([]); setActivePin(null); }}><X size={12}/> Clear</button></div>
            {pins.map(p => <button key={p.n} className={`pin-row ${activePin === p.n ? 'on' : ''}`} onClick={() => choosePin(p)}><i className={`dre-pin small${p.stars ? ' rated' : ''}`}>{p.n}</i><span>{p.addr || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>{p.stars > 0 && <em>{'★'.repeat(p.stars)}</em>}</button>)}
          </div>}
        </section>
        <MyPinsPanel pins={mine.pins} placing={placing} activeId={activeMine} fileName="my-florida-pins.csv" canPinParcel={!!selectedLot && !!lotCenter(selectedLot)} hideTransfers={hideTransfers} onToggleTransfers={() => setHideTransfers(v => !v)}
          onTogglePlacing={() => setPlacing(v => !v)}
          onPinParcel={() => { const c = selectedLot && lotCenter(selectedLot); if (!c || !selectedLot) return; const on = parcelOf(selectedLot); setActiveMine(mine.add(c[0], c[1], on.address || 'Parcel', on)); }}
          onSelect={setActiveMine} onUpdate={mine.update} onRemove={mine.remove} onClear={() => { mine.clear(); setActiveMine(null); }}
          cloud={mine.cloud} onConnect={mine.connect} onDisconnect={mine.disconnect} onFly={pin => setFocus({ coordinates: [pin.lng, pin.lat], zoom: Math.max(view.zoom, 16.5), serial: Date.now() })}
          onOpenParcel={pin => void lotAt([pin.lng, pin.lat])}/>
        <details className="filters" open={filtersOpen} onToggle={e => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
          <summary><Layers size={16}/> Layers & filters<span className="filters-state">{scope}{view.milieu ? ' · filtered' : ''}</span><ChevronDown size={14}/></summary>
          <div className="filters-body">
            <div className="toggle-row"><span>Tax parcels (yellow)</span><button className={`toggle ${lotsVisible ? 'on' : ''}`} role="switch" aria-checked={lotsVisible} aria-label="Show tax parcels" onClick={() => setLotsVisible(v => !v)}><span/></button></div>
            <div className="toggle-row"><span>Palm Bay city map</span><button className={`toggle ${palmBayOn ? 'on' : ''}`} role="switch" aria-checked={palmBayOn} aria-label="Show City of Palm Bay map layers" onClick={() => setPalmBayOn(v => !v)}><span/></button></div>
            {palmBayOn && <div className="pb-layers">
              {PALM_BAY_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={palmBayLayers.includes(l.id)} onChange={e => setPalmBayLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> {l.label}</label>)}
              <small>City of Palm Bay GIS (Palm Bay only). <a href="https://gis.palmbayflorida.org/portal/apps/webappviewer/index.html?id=71ec29150c0b469ea3e70abeb332944c" target="_blank" rel="noreferrer">Open the city's map ↗</a></small>
            </div>}
            <div className="toggle-row"><span>Cocoa utilities</span><button className={`toggle ${cocoaOn ? 'on' : ''}`} role="switch" aria-checked={cocoaOn} aria-label="Show City of Cocoa utility service areas" onClick={() => setCocoaOn(v => !v)}><span/></button></div>
            {cocoaOn && <div className="pb-layers">
              {COCOA_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={cocoaLayers.includes(l.id)} onChange={e => setCocoaLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> {l.label}</label>)}
              <small>Brevard County GIS, utility service areas. Open a parcel in the area for its Cocoa water and sewer status.</small>
            </div>}
            <div className="toggle-row"><span>Titusville utilities</span><button className={`toggle ${tvOn ? 'on' : ''}`} role="switch" aria-checked={tvOn} aria-label="Show City of Titusville utility lines" onClick={() => setTvOn(v => !v)}><span/></button></div>
            {tvOn && <div className="pb-layers">
              {TITUSVILLE_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={tvLayers.includes(l.id)} onChange={e => setTvLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> {l.label}</label>)}
              <small>City of Titusville GIS. Zoom in to see the lines. Open a parcel for the nearest mains.</small>
            </div>}
            <div className="toggle-row"><span>Melbourne utilities</span><button className={`toggle ${mbOn ? 'on' : ''}`} role="switch" aria-checked={mbOn} aria-label="Show City of Melbourne utility service areas" onClick={() => setMbOn(v => !v)}><span/></button></div>
            {mbOn && <div className="pb-layers">
              {MELBOURNE_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={mbLayers.includes(l.id)} onChange={e => setMbLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> {l.label}</label>)}
              <small>Brevard County GIS, utility service areas. Open a parcel in the area for its Melbourne status.</small>
            </div>}
            <div className="toggle-row"><span>Merritt Island / Brevard County utilities</span><button className={`toggle ${buOn ? 'on' : ''}`} role="switch" aria-checked={buOn} aria-label="Show Brevard County Utility Services service areas" onClick={() => setBuOn(v => !v)}><span/></button></div>
            {buOn && <div className="pb-layers">
              {BREVARD_UTIL_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={buLayers.includes(l.id)} onChange={e => setBuLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> {l.label}</label>)}
              <small>Brevard County Utility Services service areas (Brevard County GIS). Most of Merritt Island's water comes from Cocoa Utilities: turn on “Cocoa utilities” too.</small>
            </div>}
            <div className="toggle-row"><span>Cocoa Beach utilities</span><button className={`toggle ${cbOn ? 'on' : ''}`} role="switch" aria-checked={cbOn} aria-label="Show City of Cocoa Beach utility lines" onClick={() => setCbOn(v => !v)}><span/></button></div>
            {cbOn && <div className="pb-layers">
              {CB_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={cbLayers.includes(l.id)} onChange={e => setCbLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> <i className="pb-dot" style={{ background: l.color }}/>{l.label}</label>)}
              <small>City of Cocoa Beach GIS. Zoom in to see the lines.</small>
            </div>}
            <div className="toggle-row"><span>Sewer or septic (FL Dept of Health)</span><button className={`toggle ${fwOn ? 'on' : ''}`} role="switch" aria-checked={fwOn} aria-label="Show sewer or septic and public water or well by parcel" onClick={() => setFwOn(v => !v)}><span/></button></div>
            {fwOn && <div className="pb-layers">
              {FLWMI_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={fwLayers.includes(l.id)} onChange={e => setFwLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> {l.label}</label>)}
              {fwLayers.map(id => <div key={id} className="fw-legend">{FLWMI_LEGEND[id].map(s => <span key={s.label}><i className="pb-dot" style={{ background: s.color }}/>{s.label}</span>)}</div>)}
              <small>Florida Department of Health estimates for built parcels, statewide. Vacant lots are left clear. Zoom in to see parcels.</small>
            </div>}
            {POLY_GROUPS.map(g => <div key={g.id}>
              <div className="toggle-row"><span>{g.label}</span><button className={`toggle ${polyGroups.includes(g.id) ? 'on' : ''}`} role="switch" aria-checked={polyGroups.includes(g.id)} aria-label={`Show ${g.label}`} onClick={() => setPolyGroups(cur => cur.includes(g.id) ? cur.filter(x => x !== g.id) : [...cur, g.id])}><span/></button></div>
              {polyGroups.includes(g.id) && <div className="pb-layers">
                {ALL_SETS.filter(s => s.group === g.id).map(s => <label key={s.id}><input type="checkbox" checked={polyIds.includes(s.id)} onChange={e => setPolyIds(cur => e.target.checked ? [...cur, s.id] : cur.filter(x => x !== s.id))}/> <i className="pb-dot" style={{ background: s.swatch }}/>{s.label}</label>)}
                <small>{g.note}</small>
              </div>}
            </div>)}
            <div className="toggle-row"><span>Hernando County utility areas</span><button className={`toggle ${hnOn ? 'on' : ''}`} role="switch" aria-checked={hnOn} aria-label="Show Hernando County water and sewer service areas" onClick={() => setHnOn(v => !v)}><span/></button></div>
            {hnOn && <div className="pb-layers">
              <div className="fw-legend">{HN_LEGEND.map(s => <span key={s.label}><i className="pb-dot" style={{ background: s.color }}/>{s.label}</span>)}</div>
              <small>Hernando County (Spring Hill, Brooksville). Shows service areas, not pipes: the county’s pipe maps are not available. Zoom in to see the areas.</small>
            </div>}
            <div className="toggle-row"><span>Marion County utility areas</span><button className={`toggle ${mnOn ? 'on' : ''}`} role="switch" aria-checked={mnOn} aria-label="Show Marion County water and sewer service areas" onClick={() => setMnOn(v => !v)}><span/></button></div>
            {mnOn && <div className="pb-layers">
              <div className="fw-legend">{MN_LEGEND.map(s => <span key={s.label}><i className="pb-dot" style={{ background: s.color }}/>{s.label}</span>)}</div>
              <small>Marion County GIS (Ocala, Marion Oaks). Shows who serves each area and whether the county lists water and sewer there, not pipes. Zoom in to see the areas.</small>
            </div>}
            <div className="toggle-row"><span>Palm Coast hydrants</span><button className={`toggle ${pcOn ? 'on' : ''}`} role="switch" aria-checked={pcOn} aria-label="Show Palm Coast fire hydrants" onClick={() => setPcOn(v => !v)}><span/></button></div>
            {pcOn && <div className="pb-layers"><small>City of Palm Coast GIS. The city’s water and sewer pipe maps are not public, so only hydrants are shown. Zoom in to see them.</small></div>}
            <div className="toggle-row"><span>Citrus County utility areas</span><button className={`toggle ${citOn ? 'on' : ''}`} role="switch" aria-checked={citOn} aria-label="Show Citrus County water and sewer operational areas" onClick={() => setCitOn(v => !v)}><span/></button></div>
            {citOn && <div className="pb-layers">
              {CIT_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={citLayers.includes(l.id)} onChange={e => setCitLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> <i className="pb-dot" style={{ background: l.color }}/>{l.label}</label>)}
              <small>Citrus County GIS. Shows which utility serves each area, not where pipes run (the county does not publish pipe maps).</small>
            </div>}
            <div className="toggle-row"><span>North Port utilities</span><button className={`toggle ${npOn ? 'on' : ''}`} role="switch" aria-checked={npOn} aria-label="Show North Port utility lines" onClick={() => setNpOn(v => !v)}><span/></button></div>
            {npOn && <div className="pb-layers">
              {NP_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={npLayers.includes(l.id)} onChange={e => setNpLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> <i className="pb-dot" style={{ background: l.color }}/>{l.label}</label>)}
              <small>City of North Port GIS. Zoom in to see the lines.</small>
            </div>}
            <div className="toggle-row"><span>Charlotte County utilities</span><button className={`toggle ${chOn ? 'on' : ''}`} role="switch" aria-checked={chOn} aria-label="Show Charlotte County Utilities layers" onClick={() => setChOn(v => !v)}><span/></button></div>
            {chOn && <div className="pb-layers">
              {CH_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={chLayers.includes(l.id)} onChange={e => setChLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> <i className="pb-dot" style={{ background: l.color }}/>{l.label}</label>)}
              <small>Charlotte County GIS (Port Charlotte and the rest of the county). Zoom in to see the lines. Punta Gorda runs its own utility.</small>
            </div>}
            <div className="toggle-row"><span>Port St. Lucie / St. Lucie County utilities</span><button className={`toggle ${pslOn ? 'on' : ''}`} role="switch" aria-checked={pslOn} aria-label="Show St. Lucie County utility layers" onClick={() => setPslOn(v => !v)}><span/></button></div>
            {pslOn && <div className="pb-layers">
              {PSL_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={pslLayers.includes(l.id)} onChange={e => setPslLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> <i className="pb-dot" style={{ background: l.color }}/>{l.label}</label>)}
              <small>St. Lucie County GIS. Neither the city nor the county publishes water or sewer pipe maps, so this shows who serves each area plus hydrants.</small>
            </div>}
            <div className="toggle-row"><span>Lee County utilities</span><button className={`toggle ${leeOn ? 'on' : ''}`} role="switch" aria-checked={leeOn} aria-label="Show Lee County Utilities lines" onClick={() => setLeeOn(v => !v)}><span/></button></div>
            {leeOn && <div className="pb-layers">
              {LEE_LAYERS.map(l => <label key={l.id}><input type="checkbox" checked={leeLayers.includes(l.id)} onChange={e => setLeeLayers(cur => e.target.checked ? [...cur, l.id] : cur.filter(x => x !== l.id))}/> <i className="pb-dot" style={{ background: l.color }}/>{l.label}</label>)}
              <small>Lee County Utilities (Lee County GIS). Cape Coral and Fort Myers run their own utilities and are not shown. Zoom in to see the lines.</small>
            </div>}
            <div className="toggle-row"><span>Zoning (local, not statewide)</span><button className={`toggle ${view.visible ? 'on' : ''}`} role="switch" aria-checked={view.visible} aria-label="Show zoning layer" onClick={() => setView(current => ({ ...current, visible: !current.visible }))}><span/></button></div>
            <div className="opacity-row"><span>Opacity</span><input aria-label="Zoning overlay opacity" type="range" min="0.1" max="0.85" step="0.05" value={opacity} onChange={e => setOpacity(Number(e.target.value))}/><span>{Math.round(opacity * 100)}%</span></div>
            <div className="field-row"><label className="field-label" htmlFor="scope-filter">ZONING AREA</label><div className="select-wrap"><select id="scope-filter" value={scope} onChange={e => { setScope(e.target.value); setView(current => ({ ...current, milieu: '', zoneFilter: '', zone: '' })); }}><option value="">All areas</option>{scopes.map(c => <option key={c} value={c}>{zonedCities.has(c) ? `${c} — zoning districts` : `${c} — no open zoning data`}</option>)}</select><ChevronDown size={14}/></div></div>
            {!scopeHasZoning && <p className="context-warning">Zoning is set by each city and county and is not published statewide. Select a parcel for a link to its local zoning map.</p>}
            {scopeHasZoning && <>
              <div className="field-row"><label className="field-label" htmlFor="milieu-filter">DISTRICT GROUP</label><div className="select-wrap"><select id="milieu-filter" value={view.milieu} onChange={e => chooseMilieu(e.target.value)}><option value="">All</option>{types.map(type => <option key={type} value={type}>{type}</option>)}</select><ChevronDown size={14}/></div></div>
              <div className="field-row"><label className="field-label" htmlFor="zone-filter">DISTRICT</label><div className="select-wrap"><select id="zone-filter" value={dropdownValue} onChange={e => chooseZone(e.target.value)} disabled={!zones.length}><option value="">{`All ${dropdownZones.length}`}</option>{view.milieu ? dropdownZones.map(z => <option key={z.code} value={z.code}>{z.number}</option>) : types.map(type => <optgroup key={type} label={type}>{dropdownZones.filter(z => z.type === type).map(z => <option key={z.code} value={z.code}>{z.city ? z.number : z.code}</option>)}</optgroup>)}</select><ChevronDown size={14}/></div></div>
            </>}
            <div className="filter-footer"><span><strong>{numberFormat.format(visibleCount)}</strong> {view.visible ? 'areas shown' : 'layer hidden'}</span><button className="text-button" onClick={() => { setScope(''); setView(current => ({ ...current, milieu: '', zoneFilter: '', zone: '' })); }}><RotateCcw size={12}/> Reset</button></div>
            <div className="legend-grid">{Object.entries(FAMILIES).filter(([code]) => !scope || code.startsWith('Z')).map(([code, item]) => <div className="legend-item" key={code}><i style={{ background: item.color }}/><small>{item.label.replace('Zoning · ', '')}</small></div>)}</div>
            <div className="legend-key"><span className="lot-key"/> Parcel <span className="city-key"/> County / borough <span className="selected-key"/> Selected</div>
            <div className="rail-data"><span className="live-dot"/><span>OPEN DATA</span><strong>{metadata?.unitsDate || 'Loading…'}</strong></div>
          </div>
        </details>
      </aside>
      {selectedLot?.geometry && lotState !== 'nogeometry'
        ? <LotPanel lot={selectedLot} address={selectedAddress} preferPoint={lotPoint} zoneLine={selected ? zoneSummary(selected) : undefined} zoneDetails={selected ? zoneBody(selected) : undefined} zoneText={selected ? zoneText(selected) : undefined} zoneGrid={selected?.grid} onReport={snap => { setReportLot(snap); setReportsOpen(true); }} onClose={() => { clearLot(); setSelectedAddress(''); setAddressCoordinates(null); }}/>
        : selected ? <section className="detail-card" aria-label="Selected zoning area" style={detailDrag.style}><header className="detail-head drag-handle" {...detailDrag.handle}><span className="grip" aria-hidden="true"/><div><div className="eyebrow">ZONING DISTRICT · NEW YORK CITY</div><h2>{`District ${selected.number}`}</h2><p className="detail-address">{zoneSummary(selected)}</p></div><button className="icon-button" onClick={() => chooseZone('')} aria-label="Close area details"><X size={18}/></button></header>{zoneBody(selected)}</section>
        : <div className="map-instruction"><MapPin size={17}/><span>Click a lot or area to explore it</span></div>}
      <button className="extent-button" onClick={reset}><RotateCcw size={14}/> Florida overview</button>
      <div className="disclaimer"><a className="maker-logo" href="https://garabedian.ai" target="_blank" rel="noreferrer" title="Made by Garabedian AI"><img src="/garabedian-ai-logo.svg" alt="Garabedian AI"/></a><ShieldAlert size={15}/><span><strong>Screening map only.</strong> Parcel outlines are county tax maps, not surveys. Values are the latest Florida DOR tax roll. Verify with the county property appraiser.</span><button onClick={() => setAbout(true)}>Data notes <ArrowUpRight size={12}/></button></div>
    </main>
    {reportsOpen && <Reports pending={reportLot} onClose={() => setReportsOpen(false)} onShowLot={snap => { setReportsOpen(false); if (snap.center) setFocus({ coordinates: snap.center, zoom: 18, serial: Date.now() }); }}/>}
    {about && <div className="modal-backdrop" onClick={() => setAbout(false)}><section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAbout(false)} aria-label="Close data notes"><X size={20}/></button><div className="eyebrow">PROVENANCE & LIMITATIONS</div><h2 id="about-title">The data behind the map.</h2><p>This independent atlas uses Florida public records. It is not an official State or county application and implies no endorsement.</p>
      <div className="source-stat-grid"><div><strong>{metadata ? numberFormat.format(metadata.unitCount || 0) : '—'}</strong><span>Parcels (live)</span></div><div><strong>67</strong><span>Counties</span></div><div><strong>2</strong><span>Recent sales per parcel</span></div></div>
      <h3>Parcels, owners, values and sales</h3><p>Parcels come live from Florida Statewide Parcels: each county property appraiser’s parcel map joined to the tax roll the Florida Department of Revenue collects. That gives the owner and mailing address, just (market) value, assessed and taxable value, homestead status, land and living area, year built, the two most recent sales with price and whether they were arm’s-length, and the legal description. Florida owner names and sale prices are public records.</p>
      <h3>Zoning</h3><p>Zoning is set by each city and county and is not published statewide. Each parcel links to a search for its local zoning map.</p>
      <h3>Values</h3><p>Just value is the appraiser’s estimate as of January 1 of the roll year. Homestead assessed value is capped (Save Our Homes) and resets to just value after a sale, so a buyer’s taxes can be much higher than the seller’s.</p>
      <div className="source-links"><a href="https://geodata.floridagio.gov/" target="_blank" rel="noreferrer">Florida GIO parcels <ArrowUpRight size={14}/></a><a href="https://floridarevenue.com/property/Pages/DataPortal.aspx" target="_blank" rel="noreferrer">FDOR tax roll data <ArrowUpRight size={14}/></a></div>
      <p className="modal-footer">Attribution: Florida Department of Revenue, Florida Geographic Information Office, county property appraisers. Geocoding © Esri. Imagery © Esri. Checked {metadata?.checkedDate}.</p></section></div>}
  </div>;
}
