import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Eye, FileText, MapPin, X } from 'lucide-react';
import type { LotSnapshot } from '../lib/files';
import { useDrag } from '../lib/useDrag';
import { territoryAt, territoryLinks, type Territory, type TerritoryLinks } from '../lib/territory';
import { inSatelliteBeach } from '../lib/satelliteBeach';
import { brevardUtilitiesAt, type BrevardUtilities } from '../lib/brevardUtilities';
import { rockledgeUtilitiesAt, type RockledgeUtilities } from '../lib/rockledge';
import { melbourneUtilitiesAt, type MelbourneUtilities } from '../lib/melbourne';
import { titusvilleUtilitiesAt, type TitusvilleUtilities } from '../lib/titusville';
import { cocoaUtilitiesAt, type CocoaUtilities } from '../lib/cocoa';
import { palmBayUtilitiesAt, type PalmBayUtilities } from '../lib/palmBayUtilities';
import { countySales, SALES_COUNTIES, type Sale, FT_PER_M, infrastructureAt, type Infra, lotArea, lotCenter, lotEdges, SQFT_PER_M2, streetViewUrl, unitsInLot, type LotFeature, type Unit } from '../lib/lots';

const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (v: number | null | undefined) => v == null ? '—' : dollars.format(v);
const len = (m: number) => <>{(m * FT_PER_M).toFixed(1)} ft<small>{m.toFixed(1)} m</small></>;
const sqft = (m2: number | null, land = false) => m2 === null ? '—' : <>{n.format(m2 * SQFT_PER_M2)} ft²<small>{land && m2 > 4046 ? `${(m2 / 4046.86).toFixed(2)} acres` : `${n.format(m2)} m²`}</small></>;

interface Props {
  lot: LotFeature;
  address?: string;
  preferPoint?: [number, number] | null;
  /** One-line zone summary shown under the title, and its full details (collapsed). */
  zoneLine?: ReactNode;
  zoneDetails?: ReactNode;
  /** Plain-text zone summary and grid link, for reports. */
  zoneText?: string;
  zoneGrid?: string;
  onReport?: (snapshot: LotSnapshot) => void;
  onClose: () => void;
}

/** Everything about one selected parcel, in a single card. */
export default function LotPanel({ lot, address, preferPoint, zoneLine, zoneDetails, zoneText, zoneGrid, onReport, onClose }: Props) {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [copied, setCopied] = useState(false);
  // The chosen tab stays open as you move from parcel to parcel; the map reads it to tailor the hover label.
  const [showOlder, setShowOlder] = useState(false);
  const [tab, setTabState] = useState<'overview' | 'owner' | 'sales' | 'infra' | 'lot'>(() => (document.body.dataset.lotTab as 'sales') || 'overview');
  const setTab = (t: typeof tab) => { document.body.dataset.lotTab = t; setTabState(t); };
  useEffect(() => () => { delete document.body.dataset.lotTab; }, []);
  const [infra, setInfra] = useState<Infra | null | 'loading'>('loading');
  const [palmBay, setPalmBay] = useState<PalmBayUtilities | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setPalmBay('loading');
    void palmBayUtilitiesAt(lot).then(r => { if (active) setPalmBay(r); }).catch(() => { if (active) setPalmBay(null); });
    return () => { active = false; };
  }, [lot]);
  const [cocoa, setCocoa] = useState<CocoaUtilities | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setCocoa('loading');
    void cocoaUtilitiesAt(lot).then(r => { if (active) setCocoa(r); }).catch(() => { if (active) setCocoa(null); });
    return () => { active = false; };
  }, [lot]);
  const [tv, setTv] = useState<TitusvilleUtilities | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setTv('loading');
    void titusvilleUtilitiesAt(lot).then(r => { if (active) setTv(r); }).catch(() => { if (active) setTv(null); });
    return () => { active = false; };
  }, [lot]);
  const [mb, setMb] = useState<MelbourneUtilities | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setMb('loading');
    void melbourneUtilitiesAt(lot).then(r => { if (active) setMb(r); }).catch(() => { if (active) setMb(null); });
    return () => { active = false; };
  }, [lot]);
  const [rl, setRl] = useState<RockledgeUtilities | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setRl('loading');
    void rockledgeUtilitiesAt(lot).then(r => { if (active) setRl(r); }).catch(() => { if (active) setRl(null); });
    return () => { active = false; };
  }, [lot]);
  const [bu, setBu] = useState<BrevardUtilities | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setBu('loading');
    void brevardUtilitiesAt(lot).then(r => { if (active) setBu(r); }).catch(() => { if (active) setBu(null); });
    return () => { active = false; };
  }, [lot]);
  const [sb, setSb] = useState(false);
  useEffect(() => {
    let active = true; setSb(false);
    void inSatelliteBeach(lot).then(r => { if (active) setSb(r); }).catch(() => undefined);
    return () => { active = false; };
  }, [lot]);
  const [history, setHistory] = useState<Sale[] | null | 'loading'>(null);
  useEffect(() => {
    let active = true; setInfra('loading');
    const c = lotCenter(lot);
    if (!c) { setInfra(null); return; }
    void infrastructureAt(c).then(r => { if (active) setInfra(r); }).catch(() => { if (active) setInfra(null); });
    return () => { active = false; };
  }, [lot]);
  const [territory, setTerritory] = useState<{ place: Territory; links: TerritoryLinks | null } | null | 'none'>(null);
  const drag = useDrag('detail');
  useEffect(() => {
    let active = true;
    setTerritory(null);
    const center = lotCenter(lot);
    if (!center) { setTerritory('none'); return; }
    void territoryAt(center).then(async place => {
      if (active) setTerritory(place ? { place, links: await territoryLinks(place.code) } : 'none');
    }).catch(() => { if (active) setTerritory('none'); });
    return () => { active = false; };
  }, [lot]);
  useEffect(() => {
    let active = true;
    setUnits(null);
    void unitsInLot(lot).then(found => { if (active) setUnits(found); }).catch(() => { if (active) setUnits([]); });
    return () => { active = false; };
  }, [lot]);

  useEffect(() => {
    const u = units?.[0];
    if (!u || !u.county || !SALES_COUNTIES[u.county]) { setHistory(null); return; }
    let active = true; setHistory('loading');
    void countySales(u, lotCenter(lot)).then(r => { if (active) setHistory(r); }).catch(() => { if (active) setHistory(null); });
    return () => { active = false; };
  }, [units, lot]);
  const area = lotArea(lot);
  const edges = lotEdges(lot);
  const perimeter = edges.reduce((t, e) => t + e.length, 0);
  const unit0 = units?.[0];
  const unit = unit0 && Array.isArray(history) && history.length ? { ...unit0, sales: history } : unit0;
  const countySource = unit0?.county && Array.isArray(history) && history.length ? SALES_COUNTIES[unit0.county] : '';
  const viewPoint = preferPoint || lotCenter(lot);
  const place = territory && territory !== 'none' ? territory.place : null;
  const links = territory && territory !== 'none' ? territory.links : null;
  const nyc = place?.type === 'borough';
  const muni = unit?.muni && unit.muni !== place?.name ? unit.muni : '';
  const placeLabel = !place ? '' : nyc ? `${place.name} · New York City` : [muni, place.name].filter(Boolean).join(' · ');
  const key = unit?.sbl || lot.properties.LABEL;
  const bbl = unit?.bbl && unit.bbl.length === 10 ? unit.bbl : '';
  const acris = bbl ? `https://a836-acris.nyc.gov/bblsearch/bblsearch.asp?borough=${bbl[0]}&block=${Number(bbl.slice(1, 6))}&lot=${Number(bbl.slice(6))}` : '';
  const zola = bbl ? `https://zola.planning.nyc.gov/l/lot/${bbl[0]}/${Number(bbl.slice(1, 6))}/${Number(bbl.slice(6))}` : '';
  const bis = bbl ? `https://a810-bisweb.nyc.gov/bisweb/PropertyProfileOverviewServlet?boro=${bbl[0]}&block=${Number(bbl.slice(1, 6))}&lot=${Number(bbl.slice(6))}` : '';
  const rollUrl = nyc ? links?.roll || undefined : links?.site;
  const title = address || unit?.label;

  async function copy() {
    try { await navigator.clipboard.writeText(key); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  function report() {
    const g = lot.geometry;
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    onReport?.({
      lot: key, address: title || '', place: placeLabel, zone: zoneText || (unit?.zoning ? `Zoning ${unit.zoning}${unit.overlays ? ` · overlays ${unit.overlays}` : ''}${unit.special ? ` · special district ${unit.special}` : ''}` : ''),
      zoneGrid: zola || zoneGrid, zoningUrl: links?.zoning, rollUrl: acris || rollUrl,
      center: viewPoint, rings: polys.map(p => p[0].map(([x, y]) => [x, y] as [number, number])), area, perimeter, sides: edges.map(e => e.length),
      unit: unit ? { ...unit, infra: infra === 'loading' ? null : infra } : null, capturedAt: new Date().toISOString()
    });
  }

  return <section className="detail-card" aria-label="Selected parcel" style={drag.style}>
    <header className="detail-head drag-handle" {...drag.handle}><span className="grip" aria-hidden="true"/>
      <div>
        <div className="eyebrow">{placeLabel ? placeLabel.toUpperCase() : 'TAX PARCEL'}</div>
        <h2>{`Parcel ${key}`}</h2>
        {title && <p className="detail-address"><MapPin size={13}/>{title}</p>}
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Close parcel details"><X size={18}/></button>
    </header>

    {zoneLine && <details className="zone-line"><summary>{zoneLine}<ChevronDown size={14}/></summary><div className="zone-line-body">{zoneDetails}</div></details>}

    {units === null && <p className="detail-note" role="status">Loading assessment…</p>}
    {units?.length === 0 && <p className="detail-note">No assessment record on this parcel. Check the county’s real property office.</p>}

    {unit && <div className="tabs" role="tablist">{(['overview', 'owner', 'sales', 'infra', 'lot'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
      {t === 'overview' ? 'Overview' : t === 'owner' ? 'Owner' : t === 'sales' ? `Sales${unit.sales?.length ? ` (${unit.sales.length})` : ''}` : t === 'infra' ? 'Utilities' : 'Lot'}</button>)}</div>}

    {unit && tab === 'overview' && <>
      <div className="value-hero"><span>Just (market) value · appraisal</span><strong>{money(unit.marketValue ?? unit.totalValue)}</strong>
        <small>{unit.marketDate || 'Tax roll'} · {unit.county || 'county'} property appraiser</small></div>
      <button className="owner-line as-link" onClick={() => setTab('owner')}><span>Owner of record</span><b>{unit.owner || 'Not published — see property appraiser'}</b><small>Owner details →</small></button>
      <table className="appraisal"><tbody>
        <tr><th>Land value</th><td>{money(unit.landValue)}</td></tr>
        <tr><th>Building & improvements</th><td>{money(unit.buildingValue)}</td></tr>
        <tr className="sum"><th>Just (market) value</th><td>{money(unit.marketValue)}</td></tr>
        <tr><th>Assessed value{unit.homestead ? ' (capped)' : ''}</th><td>{money(unit.totalValue)}</td></tr>
        <tr><th>Taxable value</th><td>{money(unit.taxableValue)}</td></tr>
      </tbody></table>
      <dl className="fact-grid">
        <div><dt>Lot area</dt><dd>{sqft(unit.landArea ?? area, true)}</dd></div>
        <div><dt>Living area</dt><dd>{sqft(unit.floorArea)}</dd></div>
        <div><dt>Year built</dt><dd>{unit.builtYear ?? '—'}</dd></div>
        <div><dt>Residential units</dt><dd>{unit.dwellings ?? '—'}</dd></div>
        <div><dt>Homestead</dt><dd>{unit.homestead ? 'Yes — cap resets on sale' : 'No'}</dd></div>
        <div><dt>Property class</dt><dd>{unit.use || '—'}</dd></div>
        {unit.effYear && unit.effYear !== unit.builtYear && <div><dt>Effective year</dt><dd>{unit.effYear}</dd></div>}
        {unit.zoning && <div><dt>Zoning</dt><dd>{unit.zoning}{unit.overlays && <small>Overlay {unit.overlays}</small>}{unit.special && <small>Special district {unit.special}</small>}</dd></div>}
        {unit.far && <div><dt>FAR</dt><dd><small>{unit.far}</small></dd></div>}
        {(unit.landmark || unit.histDistrict) && <div><dt>Landmark</dt><dd>{[unit.landmark, unit.histDistrict].filter(Boolean).join(' · ')}</dd></div>}
        {unit.agDistrict && <div><dt>Agricultural district</dt><dd>{unit.agDistrict}</dd></div>}
      </dl>
      {unit.sales?.[0] && <button className="owner-line as-link" onClick={() => setTab('sales')}><span>Last sale</span><b>{unit.sales[0].nominal ? 'Nominal transfer' : money(unit.sales[0].price)} · {unit.sales[0].date}</b><small>Full sales history →</small></button>}
    </>}

    {unit && tab === 'owner' && <div className="tab-body">
      <div className="owner-line"><span>Owner of record</span><b>{unit.owner || 'Not published — see property appraiser'}</b></div>
      <dl className="fact-grid">
        <div><dt>Mailing address</dt><dd>{unit.ownerMail || '—'}</dd></div>
        <div><dt>Homestead</dt><dd>{unit.homestead ? 'Yes — owner-occupied' : 'No'}</dd></div>
        <div><dt>Parcel ID</dt><dd>{key}</dd></div>
        <div><dt>County</dt><dd>{unit.county || '—'}</dd></div>
        {unit.sales?.[0]?.buyer && <div><dt>Acquired</dt><dd>{unit.sales[0].date}<small>{unit.sales[0].nominal ? 'nominal transfer' : money(unit.sales[0].price)}</small></dd></div>}
      </dl>
      {unit.legal && <p className="detail-foot">Legal description: {unit.legal}</p>}
      <ol className="owner-links">
        {links?.roll && <li><a href={links.roll} target="_blank" rel="noreferrer">{unit.county || 'County'} property appraiser <ArrowUpRight size={11}/></a> — parcel {key}, exemptions, permits.</li>}
        <li><a href={`https://www.google.com/search?q=${encodeURIComponent(`${unit.county || ''} Florida clerk of court official records search`)}`} target="_blank" rel="noreferrer">Clerk official records <ArrowUpRight size={11}/></a> — vesting deed, mortgages, liens.</li>
        <li><a href={`https://search.sunbiz.org/Inquiry/CorporationSearch/ByName`} target="_blank" rel="noreferrer">Sunbiz <ArrowUpRight size={11}/></a> — officers and agent if the owner is a company.</li>
      </ol>
      <p className="detail-foot">Owner on the county tax roll (Florida DOR statewide parcels). Confirm the vesting deed in the clerk’s official records.</p>
    </div>}

    {unit && tab === 'sales' && <div className="tab-body">
      {(() => {
        const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 5);
        const recent = (unit.sales || []).filter(x => x.year > cutoff.getFullYear() || (x.year === cutoff.getFullYear() && (x.month || 12) >= cutoff.getMonth() + 1));
        const older = (unit.sales || []).filter(x => !recent.includes(x));
        const row = (x: Sale, i: number) => <div key={i}><span>{x.date}</span><strong>{x.nominal ? 'Nominal' : money(x.price)}</strong>
          <small>{[x.deed, x.nominal ? 'non-cash transfer' : x.qualified ? 'arm’s-length sale' : x.code ? 'not qualified' : '', x.vacant ? 'vacant' : '',
            x.book && x.page ? `OR ${x.book}/${x.page}` : x.instrument ? `Instr. ${x.instrument}` : ''].filter(Boolean).join(' · ')}
            {(x.seller || x.buyer) && <><br/>{x.seller && <>From {x.seller}</>}{x.seller && x.buyer && ' → '}{x.buyer && <>to {x.buyer}</>}</>}</small></div>;
        return <div className="sales"><b>Sales history · last 5 years{recent.length ? ` · ${recent.length} sale${recent.length > 1 ? 's' : ''}` : ''}</b>
          {history === 'loading' && <p className="detail-foot">Loading the county’s sales history…</p>}
          {recent.map(row)}
          {history !== 'loading' && !recent.length && <p className="detail-foot">No sale in the last 5 years in the data this atlas can read{older.length ? ' (older sales below).' : '.'}</p>}
          {older.length > 0 && <button className="text-button" style={{ margin: '8px 0' }} onClick={() => setShowOlder(v => !v)}>{showOlder ? 'Hide' : 'Show'} {older.length} older sale{older.length > 1 ? 's' : ''}</button>}
          {showOlder && older.map(row)}
          <p className="detail-foot">{countySource ? <>Source: {countySource}. </> : <>The state roll carries only the two most recent sales{unit0?.county ? `, and ${unit0.county} does not publish a longer history as open data` : ''}. </>}Every older sale and deed is on the {links?.roll ? <a href={links.roll} target="_blank" rel="noreferrer">property appraiser’s sales tab <ArrowUpRight size={10}/></a> : 'property appraiser’s sales tab'} and in the clerk’s official records.</p>
        </div>;
      })()}
    </div>}

    {unit && tab === 'infra' && <div className="tab-body infra">
        {infra === 'loading' ? <p className="detail-note">Checking water and sewer…</p> : <ul>
          <li className={infra?.waterKind === 'public' ? 'ok' : infra?.waterKind === 'well' ? 'warn' : 'q'}><span>Drinking water</span><b>{infra?.water || 'No data'}</b></li>
          <li className={infra?.sewerKind === 'sewer' ? 'ok' : infra?.sewerKind === 'septic' ? 'warn' : 'q'}><span>Wastewater</span><b>{infra?.sewer || 'No data'}</b></li>
          <li className="q"><span>Electric</span><b><a href="https://www.floridapsc.com/electric-utility-service-territory" target="_blank" rel="noreferrer">Find the provider <ArrowUpRight size={10}/></a></b></li>
          <li className="q"><span>Internet</span><b>{viewPoint && <a href={`https://broadbandmap.fcc.gov/location-summary/fixed?lat=${viewPoint[1]}&lon=${viewPoint[0]}&zoom=17`} target="_blank" rel="noreferrer">FCC broadband map <ArrowUpRight size={10}/></a>}</b></li>
          <li className="q"><span>Gas · road · drainage · fees</span><b>Confirm with utilities and the county</b></li>
        </ul>}
        {sb && <div className="pb-util">
          <b>City of Satellite Beach utilities</b>
          <ul>
            <li className="q"><span>City limits</span><b>Inside the City of Satellite Beach</b></li>
            <li className="q"><span>Water and sewer lines</span><b>Not published by the city</b></li>
          </ul>
          <p className="detail-foot">Satellite Beach does not run its own water or sewer maps publicly. The county’s service-area maps put the city inside the City of Melbourne’s water service area and Brevard County’s South Beaches sewer area; those blocks appear on this tab when they cover the parcel. Confirm with Satellite Beach Public Works. Source: City of Satellite Beach GIS (city boundary).</p>
        </div>}
        {bu && bu !== 'loading' && <div className="pb-util">
          <b>Brevard County Utility Services</b>
          <ul>
            {bu.areas.map(a => <li key={a.label} className="ok"><span>{a.kind === 'sewer' ? 'Sewer service area' : 'Water service area'}</span><b>{a.label}</b></li>)}
          </ul>
          <p className="detail-foot">The parcel is inside this Brevard County Utility Services service area. That means the county is the utility for the area, not that a line reaches the lot. Confirm with Brevard County Utility Services. Source: Brevard County GIS.</p>
        </div>}
        {rl && rl !== 'loading' && <div className="pb-util">
          <b>City of Rockledge utilities</b>
          <ul>
            <li className="q"><span>City limits</span><b>{rl.inCity ? 'Inside the City of Rockledge' : 'Outside the City of Rockledge'}</b></li>
            {rl.schedule && <li className="q"><span>Trash</span><b>{rl.schedule.trash || '—'}</b></li>}
            {rl.schedule && <li className="q"><span>Recycling · yard</span><b>{[rl.schedule.recycle, rl.schedule.yard].map(v => v || '—').join(' · ')}</b></li>}
            <li className="q"><span>Water and sewer lines</span><b>Not published by the city</b></li>
          </ul>
          <p className="detail-foot">Rockledge does not publish water, sewer or hydrant maps publicly. Many Rockledge parcels are on the City of Cocoa’s water customer list; when a parcel is, its Cocoa record appears in the Cocoa block. Confirm sewer and water with the City of Rockledge Public Works. Source: City of Rockledge GIS (city boundary, residential pickup schedule).</p>
        </div>}
        {mb && mb !== 'loading' && <div className="pb-util">
          <b>City of Melbourne utilities</b>
          <ul>
            <li className="q"><span>City limits</span><b>{mb.inCity ? 'Inside the City of Melbourne' : 'Outside the City of Melbourne'}</b></li>
            <li className={mb.waterArea ? 'ok' : 'q'}><span>Water service area</span><b>{mb.waterArea ? 'Inside the Melbourne water service area' : 'Outside the Melbourne water service area'}</b></li>
            <li className={mb.sewerArea ? 'ok' : 'q'}><span>Sewer service area</span><b>{mb.sewerArea ? 'Inside the Melbourne sewer service area' : 'Outside the Melbourne sewer service area'}</b></li>
            {mb.waste && <li className="q"><span>Trash (zone {mb.waste.zone})</span><b>{mb.waste.trash}</b></li>}
            {mb.waste && <li className="q"><span>Recycling · yard · bulk</span><b>{[mb.waste.recycle, mb.waste.yard, mb.waste.bulk].join(' · ')}</b></li>}
          </ul>
          <p className="detail-foot">A service area means Melbourne is the utility that serves the area, not that a line reaches the lot. Melbourne does not publish its water and sewer line maps publicly, so mains and hydrants are not shown. Confirm with Melbourne Public Works &amp; Utilities. Sources: Brevard County GIS utility service areas; City of Melbourne GIS (solid waste zones, city boundary).</p>
        </div>}
        {tv && tv !== 'loading' && <div className="pb-util">
          <b>City of Titusville utilities</b>
          <ul>
            <li className="q"><span>City limits</span><b>{tv.inCity ? 'Inside the City of Titusville' : 'Outside the City of Titusville'}</b></li>
            {([['Water main', tv.waterMain], ['Sewer main', tv.sewerMain], ['Reclaimed water main', tv.reclaimMain]] as const).map(([label, m]) => <li key={label} className={m ? (m.feet <= 30 ? 'ok' : 'q') : 'q'}><span>{label}</span><b>{m ? `${m.feet < 1 ? 'Touches the lot' : `${Math.round(m.feet)} ft from the lot`} · ${[m.diameter ? `${m.diameter} in` : '', m.material, m.kind].filter(Boolean).join(' ')}` : 'None mapped within about 500 ft'}</b></li>)}
            <li className="q"><span>Water service line</span><b>{tv.waterLateral ? `Recorded on or touching the lot${tv.waterLateral.material ? ` (${tv.waterLateral.material})` : ''}` : 'None recorded on the lot'}</b></li>
            <li className="q"><span>Sewer lateral</span><b>{tv.sewerLateral ? `Recorded on or touching the lot${tv.sewerLateral.material ? ` (${tv.sewerLateral.material})` : ''}` : 'None recorded on the lot'}</b></li>
            <li className="q"><span>Nearest fire hydrant</span><b>{tv.hydrant ? `${tv.hydrant.feet < 1 ? 'On the lot' : `${Math.round(tv.hydrant.feet)} ft`} · ${tv.hydrant.id}` : 'None within about 500 ft'}</b></li>
          </ul>
          <p className="detail-foot">Distances run from the lot outline to the lines the City of Titusville has mapped. A main nearby does not guarantee a connection is allowed or paid for. Confirm with Titusville Utilities. Source: City of Titusville GIS (gis.titusville.com).</p>
        </div>}
        {cocoa && cocoa !== 'loading' && <div className="pb-util">
          <b>City of Cocoa utilities</b>
          <ul>
            <li className={cocoa.water.access ? 'ok' : 'q'}><span>Cocoa water</span><b>{cocoa.water.access ? `Customer record on file (${cocoa.water.where})` : cocoa.water.area ? 'Inside the water service area, no customer record' : 'Not on the city’s water list'}</b></li>
            <li className={cocoa.sewer.access ? 'ok' : cocoa.sewer.area ? 'q' : 'warn'}><span>Cocoa sewer</span><b>{cocoa.sewer.access ? `Customer record on file (${cocoa.sewer.where})` : cocoa.sewer.area ? 'Inside the sewer service area, no customer record' : 'Not on the city’s sewer list'}</b></li>
            <li className="q"><span>City limits</span><b>{cocoa.inCity ? 'Inside the City of Cocoa' : 'Outside the City of Cocoa'}</b></li>
            {cocoa.serviceLine && <li className={/lead|galvan/i.test(cocoa.serviceLine.customer) && !/non-lead/i.test(cocoa.serviceLine.customer) ? 'warn' : 'q'}><span>Water service line</span><b>Customer side: {cocoa.serviceLine.customer || 'Unknown'} · utility side: {cocoa.serviceLine.utility || 'Unknown'}</b></li>}
            {cocoa.waste && <li className="q"><span>Trash</span><b>{cocoa.waste.trash || '—'}</b></li>}
            {cocoa.waste && <li className="q"><span>Recycling · yard · bulk</span><b>{[cocoa.waste.recycle, cocoa.waste.yard, cocoa.waste.bulk].map(v => v || '—').join(' · ')}</b></li>}
          </ul>
          <p className="detail-foot">A “customer record” means the parcel is on the City of Cocoa’s water or sewer account list, not that a line is guaranteed at the lot. Confirm with Cocoa Utilities. Sources: City of Cocoa GIS (water and sewer access, waste collection, lead and copper service line inventory) and Brevard County GIS utility service areas.</p>
        </div>}
        {palmBay === 'loading' && <p className="detail-note">Checking the City of Palm Bay utilities map…</p>}
        {palmBay && palmBay !== 'loading' && <div className="pb-util">
          <b>City of Palm Bay utilities</b>
          <ul>
            {palmBay.unit && <li className={palmBay.unit.water === 'Yes' ? 'ok' : 'q'}><span>Water (city unit)</span><b>{palmBay.unit.water || 'No data'}</b></li>}
            {palmBay.unit && <li className={palmBay.unit.sewer === 'Yes' ? 'ok' : palmBay.unit.sewer === 'No' ? 'warn' : 'q'}><span>Sewer (city unit)</span><b>{palmBay.unit.sewer || 'No data'}</b></li>}
            {palmBay.unit && <li className="q"><span>Reclaimed water</span><b>{palmBay.unit.reclaimed || 'No data'}</b></li>}
            {palmBay.water && <li className={palmBay.water === 'Yes' ? 'ok' : 'warn'}><span>Water available</span><b>{palmBay.water}</b></li>}
            {palmBay.sewer && <li className={palmBay.sewer === 'Yes' ? 'ok' : 'warn'}><span>Sewer available</span><b>{palmBay.sewer}</b></li>}
            {palmBay.reclaimed && <li className="q"><span>Reclaimed available</span><b>{palmBay.reclaimed}</b></li>}
            {palmBay.unit && <li className="q"><span>Unit</span><b>{palmBay.unit.description || palmBay.unit.name}</b></li>}
            {palmBay.hydrant && <li className="q"><span>Nearest fire hydrant</span><b>{Math.round(palmBay.hydrant.feet)} ft{palmBay.hydrant.address ? ` · ${palmBay.hydrant.address}` : ''}{palmBay.hydrant.owner ? ` · ${palmBay.hydrant.owner}` : ''}{palmBay.hydrant.status ? ` (${palmBay.hydrant.status})` : ''}</b></li>}
            {!palmBay.hydrant && <li className="q"><span>Nearest fire hydrant</span><b>None within 800 ft</b></li>}
            {palmBay.trash && <li className="q"><span>Trash</span><b>{palmBay.trash.trash}</b></li>}
            {palmBay.trash && <li className="q"><span>Recycling · yard · bulk</span><b>{palmBay.trash.recycle} · {palmBay.trash.yard} · {palmBay.trash.bulk}</b></li>}
          </ul>
          {palmBay.availNote && <p className="detail-foot">{palmBay.availNote}</p>}
          {palmBay.lines.length > 0 && <div className="pb-hookup">
            <b>Estimated hookup cost by lot line</b>
            {palmBay.lines.map((l, i) => <div key={i}><span>{l.feet.toFixed(0)} ft</span><span>Water ${l.water?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}</span><span>Sewer ${l.sewer?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—'}</span>{l.note && <small>{l.note}</small>}</div>)}
            <small>Estimates only: water $18.80/ft + $2,561 capital charge + $812.42 meter + $100 deposit; sewer $29.63/ft + $3,300 capital charge + $100 deposit. Call Palm Bay Utilities, (321) 952-3400, for a quote. Lot lines shared with a neighbour are listed too.</small>
          </div>}
          <p className="detail-foot">Source: City of Palm Bay public map (gis.palmbayflorida.org). <a href="https://gis.palmbayflorida.org/portal/apps/webappviewer/index.html?id=71ec29150c0b469ea3e70abeb332944c" target="_blank" rel="noreferrer">Open it <ArrowUpRight size={10}/></a></p>
        </div>}
        <p className="detail-foot">Water and sewer: Florida Department of Health, Florida Water Management Inventory{infra && infra !== 'loading' && infra.year ? ` (updated ${infra.year})` : ''}. “Likely” means estimated, not confirmed. The full checklist is in the property file.</p>
    </div>}

    {(tab === 'lot' || !unit) && <div className="tab-body">
      {!unit && area !== null && <dl className="fact-grid"><div><dt>Lot area (drawing)</dt><dd>{sqft(area, true)}</dd></div></dl>}
      {edges.length > 0 && <>
      <dl className="fact-grid">
        {unit?.frontage != null && <div><dt>Frontage (roll)</dt><dd>{len(unit.frontage)}</dd></div>}
        {unit?.depth != null && <div><dt>Depth (roll)</dt><dd>{len(unit.depth)}</dd></div>}
        <div><dt>Perimeter</dt><dd>{len(perimeter)}</dd></div>
        <div><dt>Sides</dt><dd>{edges.length}</dd></div>
      </dl>
      <ol className="side-list">{edges.map((e, i) => <li key={i}><span>Side {i + 1}</span><strong>{(e.length * FT_PER_M).toFixed(1)} ft</strong><small>{e.length.toFixed(1)} m</small></li>)}</ol>
      <p className="detail-foot">Sides are measured on the county parcel map drawing, not a survey.</p>
      </>}
    </div>}


    {onReport && <button className="report-button" onClick={report} disabled={units === null}><FileText size={15}/> Create report</button>}
    {viewPoint && <a className="street-view-button" href={streetViewUrl(viewPoint)} target="_blank" rel="noreferrer"><Eye size={15}/> Street View <ArrowUpRight size={13}/></a>}

    <div className="link-row">
      {zola ? <a href={zola} target="_blank" rel="noreferrer">ZoLa zoning <ArrowUpRight size={11}/></a> : links && <a href={links.zoning} target="_blank" rel="noreferrer">Zoning <ArrowUpRight size={11}/></a>}
      {bis && <a href={bis} target="_blank" rel="noreferrer">DOB permits & C of O <ArrowUpRight size={11}/></a>}
      {acris && <a href={acris} target="_blank" rel="noreferrer">ACRIS <ArrowUpRight size={11}/></a>}
      {links?.roll && <a href={links.roll} target="_blank" rel="noreferrer">Property appraiser <ArrowUpRight size={11}/></a>}
      <a href="https://msc.fema.gov/portal/search" target="_blank" rel="noreferrer">FEMA flood <ArrowUpRight size={11}/></a>
      <button onClick={copy}><Copy size={11}/>{copied ? 'Copied' : key}</button>
    </div>

    <p className="detail-foot">Tax roll: Florida Department of Revenue statewide parcels ({unit?.county || 'county'}). Just value is the appraiser’s market value; assessed value is capped for homesteads (Save Our Homes).</p>
  </section>;
}
