import type { LotSnapshot, PropertyFile } from './files';

// Worksheets and checklists for the reporting module, for Florida practice. They prepare a licensee's work;
// the FR/BAR contract, brokerage relationship disclosure and seller's disclosure are still signed on the official forms.

export interface Field { key: string; label: string; type?: 'text' | 'date' | 'number' | 'area'; hint?: string; side?: 'listing' | 'buyer' }

export const MANDATE_FIELDS: Field[] = [
  { key: 'clientName', label: 'Client name(s)' },
  { key: 'clientAddress', label: 'Client address' },
  { key: 'clientPhone', label: 'Client phone' },
  { key: 'clientEmail', label: 'Client email' },
  { key: 'entity', label: 'If an entity: legal name and signer', hint: 'Check Sunbiz (Florida Division of Corporations).' },
  { key: 'relationship', label: 'Brokerage relationship (transaction broker, single agent, no brokerage relationship)', hint: 'Florida presumes transaction brokerage (§475.278).' },
  { key: 'price', label: 'List price', type: 'number', side: 'listing' },
  { key: 'budget', label: 'Maximum price / budget', type: 'number', side: 'buyer' },
  { key: 'criteria', label: 'Search criteria (areas, type, waterfront, HOA, must-haves)', type: 'area', side: 'buyer' },
  { key: 'type', label: 'Listing type (exclusive right of sale, exclusive agency)', side: 'listing' },
  { key: 'start', label: 'Agreement start', type: 'date' },
  { key: 'end', label: 'Agreement end', type: 'date' },
  { key: 'commission', label: 'Compensation and cooperating compensation' },
  { key: 'inclusions', label: 'Personal property included (appliances, window treatments)', type: 'area', side: 'listing' },
  { key: 'exclusions', label: 'Exclusions', type: 'area', side: 'listing' },
  { key: 'mortgage', label: 'Mortgage(s) and payoff, liens, PACE / special assessments', side: 'listing' },
  { key: 'financing', label: 'Pre-approval (lender, amount) or proof of funds', side: 'buyer' },
  { key: 'title', label: 'Closing agent / title company' },
  { key: 'showings', label: 'Showing instructions (lockbox, gate code, tenants, pets)', side: 'listing' },
  { key: 'other', label: 'Other conditions', type: 'area' }
];

export interface Topic { key: string; label: string; ask: string; hint?: (s: LotSnapshot) => string | '' }
const year = (s: LotSnapshot) => s.unit?.builtYear ?? null;

// Florida requires sellers to disclose known material defects (Johnson v. Davis); topics follow the FR/BAR Seller's Property Disclosure.
export const DECLARATION_TOPICS: Topic[] = [
  { key: 'flood', label: 'Flooding & flood insurance', ask: 'Any flood damage or claims, FEMA assistance, or flood insurance carried? (Florida flood disclosure required since 2025.)' },
  { key: 'roof', label: 'Roof', ask: 'Roof age, material, leaks, repairs, permits; is it insurable (age limits)?', hint: s => (year(s) ?? 2020) < 2010 ? 'Older home: insurers often require a roof under 15–20 years and a 4-point inspection.' : '' },
  { key: 'water', label: 'Water intrusion & mold', ask: 'Leaks, water intrusion, mold, past remediation?' },
  { key: 'sinkhole', label: 'Sinkholes & settling', ask: 'Any sinkhole claims, repairs, cracks or settling?' },
  { key: 'pests', label: 'Termites & wood-destroying organisms', ask: 'Termites, damage, tenting history, bond?' },
  { key: 'structure', label: 'Structure & windstorm', ask: 'Hurricane damage, shutters/impact windows, wind mitigation features?' },
  { key: 'systems', label: 'Plumbing, electrical & HVAC', ask: 'Polybutylene or cast-iron pipes, aluminum wiring, Federal Pacific panel, AC age?', hint: s => (year(s) ?? 2000) < 1980 ? 'Built before 1980: cast-iron drains and older panels are common; ask for a 4-point inspection.' : '' },
  { key: 'water_septic', label: 'Water & sewer', ask: 'City water/sewer or well and septic? Last septic pump-out?' },
  { key: 'pool', label: 'Pool & enclosure', ask: 'Pool barrier compliance, equipment age, screen enclosure condition?' },
  { key: 'permits', label: 'Permits & code', ask: 'Additions, conversions, or work without permits; open permits or code violations?' },
  { key: 'environment', label: 'Environmental', ask: 'Radon tests, Chinese drywall, fuel tanks, nearby contamination?', hint: s => { const y = year(s); return y && y >= 2001 && y <= 2009 ? `Built ${y}: ask whether Chinese drywall was ever found.` : ''; } },
  { key: 'hoa', label: 'HOA / condo / CDD', ask: 'HOA or condo association, dues, special assessments, CDD bonds, rental restrictions?', hint: s => /Condo/.test(s.unit?.use || '') ? 'Condominium: milestone inspection and structural reserve study (SIRS) status are required disclosures.' : '' },
  { key: 'taxes', label: 'Taxes & homestead', ask: 'Homestead or other exemptions? Buyer’s taxes will reset to just value.', hint: s => s.unit?.homestead ? 'Seller has homestead: the buyer’s assessed value resets to just value next year.' : '' },
  { key: 'other', label: 'Anything else', ask: 'Any other known defect that materially affects the value?' }
];

export interface Check { key: string; label: string; url?: string; hint?: string }
export const PREOFFER_CHECKS: Check[] = [
  { key: 'title', label: 'Title commitment ordered (liens, open permits, code liens)' },
  { key: 'survey', label: 'Survey current; matches the parcel map and improvements' },
  { key: 'roll', label: 'Property appraiser record checked (owner, values, exemptions)' },
  { key: 'sales', label: 'Full sales history (every deed) and recent comparable sales reviewed' },
  { key: 'zoning', label: 'Zoning and future land use checked with the city or county' },
  { key: 'water', label: 'Infrastructure · Drinking water: public water or private well confirmed', hint: 'Ask the water utility for a will-serve letter; a well needs a water test.' },
  { key: 'sewer', label: 'Infrastructure · Wastewater: central sewer or septic confirmed', url: 'https://www.floridahealth.gov/environmental-health/onsite-sewage/', hint: 'Septic: get the permit from the county health department and a septic inspection.' },
  { key: 'electric', label: 'Infrastructure · Electric provider and service at the lot confirmed', url: 'https://www.floridapsc.com/electric-utility-service-territory', hint: 'FPL, Duke, TECO, a co-op or a city utility.' },
  { key: 'gas', label: 'Infrastructure · Natural gas available (or propane)' },
  { key: 'broadband', label: 'Infrastructure · Internet / broadband providers at the address', url: 'https://broadbandmap.fcc.gov/home' },
  { key: 'road', label: 'Infrastructure · Legal access on a paved road; who maintains it (city, county, HOA, private)' },
  { key: 'drainage', label: 'Infrastructure · Stormwater, drainage and water-management-district permits' },
  { key: 'fees', label: 'Infrastructure · Hook-up, capacity and impact fees (vacant land / new build)' },
  { key: 'hydrant', label: 'Infrastructure · Fire hydrant and fire station distance (insurance rating)' },
  { key: 'permits', label: 'Open and expired permits searched' },
  { key: 'flood', label: 'FEMA flood zone and elevation certificate checked', url: 'https://msc.fema.gov/portal/search' },
  { key: 'insurance', label: 'Homeowners and wind insurance quote obtained', hint: '4-point and wind-mitigation inspections lower premiums.' },
  { key: 'inspection', label: 'Home inspection, 4-point and wind mitigation booked' },
  { key: 'wdo', label: 'Wood-destroying organism (termite) inspection' },
  { key: 'sinkhole', label: 'Sinkhole history checked (Florida Geological Survey)', url: 'https://geodata.dep.state.fl.us/' },
  { key: 'environment', label: 'FDEP contamination sites searched (Map Direct)', url: 'https://ca.dep.state.fl.us/mapdirect/' },
  { key: 'disclosure', label: 'Seller’s property disclosure received and reviewed' },
  { key: 'radon', label: 'Radon gas notice included in the contract (§404.056)' },
  { key: 'lead', label: 'Lead-based paint disclosure (built before 1978)' },
  { key: 'hoa', label: 'HOA / condo documents, budget, assessments (rescission period)' },
  { key: 'condo', label: 'Condo milestone inspection and SIRS reviewed' },
  { key: 'cdd', label: 'CDD and special assessments checked' },
  { key: 'taxes', label: 'Taxes estimated at the buyer’s new assessed value' },
  { key: 'valuation', label: 'Price compared with just value and last sale' },
  { key: 'stamps', label: 'Documentary stamp tax estimated' },
  { key: 'financing', label: 'Loan approval, appraisal and insurance binder confirmed' },
  { key: 'closing', label: 'Closing date, possession and walk-through agreed' }
];

export const LISTING_FIELDS: Field[] = [
  { key: 'type', label: 'Property type' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'rooms', label: 'Bedrooms / bathrooms' },
  { key: 'parking', label: 'Garage / carport / parking' },
  { key: 'pool', label: 'Pool / waterfront / view' },
  { key: 'construction', label: 'Construction, roof year, impact windows' },
  { key: 'taxes', label: 'Annual taxes (current owner)' },
  { key: 'hoa', label: 'HOA / condo fees, CDD' },
  { key: 'flood', label: 'Flood zone' },
  { key: 'description', label: 'Public remarks', type: 'area' },
  { key: 'agentRemarks', label: 'Agent remarks', type: 'area' }
];

export const DOC_CATEGORIES = ['Listing / buyer agreement', 'Brokerage relationship disclosure', 'Seller’s disclosure', 'Survey', 'Title commitment', 'Inspections (4-point, wind, WDO)', 'Insurance', 'HOA / condo documents', 'Photos', 'Contract', 'Other'];

// ---- pre-offer findings filled in from what the atlas already knows about the parcel ----

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** Documentary stamp tax on the deed (seller, customarily): $0.70 per $100; Miami-Dade $0.60, plus $0.45 surtax except on single-family homes. */
export function docStamps(price: number, miamiDade: boolean, singleFamily: boolean) {
  if (!miamiDade) return [['Deed doc stamps 0.70%', Math.round(price * 0.007)]] as [string, number][];
  const lines: [string, number][] = [['Deed doc stamps 0.60% (Miami-Dade)', Math.round(price * 0.006)]];
  if (!singleFamily) lines.push(['Miami-Dade surtax 0.45%', Math.round(price * 0.0045)]);
  return lines;
}

export interface Finding { note: string; done?: boolean }
export function preofferFindings(f: PropertyFile): Record<string, Finding> {
  const s = f.snapshot, u = s.unit, out: Record<string, Finding> = {};
  const price = Number(f.mandate.price || f.listing.price || f.mandate.budget) || 0;
  if (u) out.roll = { note: [u.owner && `Owner: ${u.owner}`, u.use, u.builtYear && `built ${u.builtYear}`, u.marketValue && `just value ${money(u.marketValue)}`, u.taxableValue && `taxable ${money(u.taxableValue)}`, u.homestead ? 'homestead' : 'no homestead', u.marketDate].filter(Boolean).join(' · ') + '.', done: true };
  if (u?.sales?.length) out.sales = { note: 'Last sales on the tax roll: ' + u.sales.map(x => `${x.date} ${x.nominal ? 'nominal transfer' : money(x.price)}${x.qualified ? '' : ' (not arm’s length)'}${x.book ? ` OR ${x.book}/${x.page}` : ''}`).join(' · ') + '. Older deeds: county property appraiser sales tab and clerk official records.' };
  const inf = u?.infra;
  if (inf) {
    const src = ` (Florida Dept. of Health water inventory${inf.year ? `, ${inf.year}` : ''}).`;
    out.water = { note: `${inf.water}${src}${inf.waterKind === 'well' ? ' Order a well water test.' : inf.waterKind === 'public' ? ' Confirm the account with the utility.' : ' Confirm with the utility.'}`, done: inf.water.startsWith('Known') };
    out.sewer = { note: `${inf.sewer}${src}${inf.sewerKind === 'septic' ? ' Get the septic permit from the health department and a septic inspection; check whether sewer is coming (mandatory hook-up).' : inf.sewerKind === 'sewer' ? ' Confirm the account with the utility.' : ' Confirm with the utility.'}`, done: inf.sewer.startsWith('Known') };
    if (inf.sewerKind === 'na' || inf.waterKind === 'na') out.fees = { note: 'Vacant on the inventory: ask the utilities for a will-serve letter, line extension cost and capacity / impact fees.' };
  }
  if (u && !/^Vacant/.test(u.use || '') && u.builtYear) out.electric = { note: `Built ${u.builtYear}: service exists. Confirm the provider and panel age at inspection.` };
  if (s.center) out.broadband = { note: `Check providers at ${s.center[1].toFixed(5)}, ${s.center[0].toFixed(5)} on the FCC broadband map.` };
  out.survey = { note: `Parcel ${s.lot}${s.area ? ` · about ${Math.round(s.area * 10.7639).toLocaleString()} ft² on the parcel map` : ''}${u?.legal ? ` · legal: ${u.legal}` : ''}. Compare with the survey.` };
  out.zoning = { note: `Zoning is set by ${u?.muni ? `the City of ${u.muni[0] + u.muni.slice(1).toLowerCase()} or ` : ''}${u?.county || 'the county'}; check zoning and future land use.` };
  if (u?.builtYear) out.lead = u.builtYear < 1978 ? { note: `Built ${u.builtYear}: lead paint disclosure required.` } : { note: `Built ${u.builtYear}: lead paint disclosure not required.`, done: true };
  if (u && !/Condo/.test(u.use || '')) out.condo = { note: 'Not a condominium on the roll: not applicable.', done: true };
  if (u) out.taxes = { note: u.homestead ? `Seller has homestead (assessed ${money(u.totalValue || 0)} vs just ${money(u.marketValue || 0)}): the buyer’s taxes will be based on about ${money(u.marketValue || 0)}.` : `No homestead: assessed ${money(u.totalValue || 0)}, just ${money(u.marketValue || 0)}.` };
  const value = u?.marketValue;
  if (value) out.valuation = price
    ? { note: `Price ${money(price)} vs just value ${money(value)}: ${price >= value ? '+' : ''}${Math.round((price / value - 1) * 100)}%${u?.sales?.[0] ? `; last sale ${money(u.sales[0].price)} (${u.sales[0].date})` : ''}.`, done: true }
    : { note: `Just value ${money(value)}${u?.sales?.[0] ? `, last sale ${money(u.sales[0].price)} (${u.sales[0].date})` : ''}. Enter the price in the agreement to compare.` };
  const base = price || value || 0;
  if (base) {
    const lines = docStamps(base, /Miami-Dade/.test(u?.county || s.place), /Single family/.test(u?.use || ''));
    out.stamps = { note: `On ${money(base)}: ${lines.map(([l, v]) => `${l} ${money(v)}`).join(' · ')}. Mortgage adds 0.35% stamps + 0.2% intangible tax on the loan.`, done: true };
  }
  return out;
}
