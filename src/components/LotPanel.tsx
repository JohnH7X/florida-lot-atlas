import { useEffect, useState, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Eye, FileText, MapPin, X } from 'lucide-react';
import type { LotSnapshot } from '../lib/files';
import { useDrag } from '../lib/useDrag';
import { territoryAt, territoryLinks, type Territory, type TerritoryLinks } from '../lib/territory';
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
  const [tab, setTabState] = useState<'overview' | 'owner' | 'sales' | 'infra' | 'lot'>(() => (document.body.dataset.lotTab as 'sales') || 'overview');
  const setTab = (t: typeof tab) => { document.body.dataset.lotTab = t; setTabState(t); };
  useEffect(() => () => { delete document.body.dataset.lotTab; }, []);
  const [infra, setInfra] = useState<Infra | null | 'loading'>('loading');
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
      <div className="sales"><b>Sales history{unit.sales?.length ? ` · ${unit.sales.length} sale${unit.sales.length > 1 ? 's' : ''}` : ''}</b>
        {history === 'loading' && <p className="detail-foot">Loading the county’s full sales history…</p>}
        {unit.sales?.length ? unit.sales.map((x, i) => <div key={i}><span>{x.date}</span><strong>{x.nominal ? 'Nominal' : money(x.price)}</strong>
          <small>{[x.deed, x.nominal ? 'non-cash transfer' : x.qualified ? 'arm’s-length sale' : x.code ? 'not qualified' : '', x.vacant ? 'vacant' : '',
            x.book && x.page ? `OR ${x.book}/${x.page}` : x.instrument ? `Instr. ${x.instrument}` : ''].filter(Boolean).join(' · ')}
            {(x.seller || x.buyer) && <><br/>{x.seller && <>From {x.seller}</>}{x.seller && x.buyer && ' → '}{x.buyer && <>to {x.buyer}</>}</>}</small></div>)
          : history !== 'loading' && <p className="detail-foot">No sale in the last two years on the state tax roll.</p>}
        <p className="detail-foot">{countySource ? <>Source: {countySource}. </> : <>The state roll only carries sales from the last two roll years (up to two per parcel). </>}Every older sale and deed is on the {links?.roll ? <a href={links.roll} target="_blank" rel="noreferrer">property appraiser’s sales tab <ArrowUpRight size={10}/></a> : 'property appraiser’s sales tab'} and in the clerk’s official records.</p>
      </div>
    </div>}

    {unit && tab === 'infra' && <div className="tab-body infra">
        {infra === 'loading' ? <p className="detail-note">Checking water and sewer…</p> : <ul>
          <li className={infra?.waterKind === 'public' ? 'ok' : infra?.waterKind === 'well' ? 'warn' : 'q'}><span>Drinking water</span><b>{infra?.water || 'No data'}</b></li>
          <li className={infra?.sewerKind === 'sewer' ? 'ok' : infra?.sewerKind === 'septic' ? 'warn' : 'q'}><span>Wastewater</span><b>{infra?.sewer || 'No data'}</b></li>
          <li className="q"><span>Electric</span><b><a href="https://www.floridapsc.com/electric-utility-service-territory" target="_blank" rel="noreferrer">Find the provider <ArrowUpRight size={10}/></a></b></li>
          <li className="q"><span>Internet</span><b>{viewPoint && <a href={`https://broadbandmap.fcc.gov/location-summary/fixed?lat=${viewPoint[1]}&lon=${viewPoint[0]}&zoom=17`} target="_blank" rel="noreferrer">FCC broadband map <ArrowUpRight size={10}/></a>}</b></li>
          <li className="q"><span>Gas · road · drainage · fees</span><b>Confirm with utilities and the county</b></li>
        </ul>}
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
