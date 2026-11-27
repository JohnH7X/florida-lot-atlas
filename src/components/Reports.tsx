import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, Download, FileText, FolderOpen, Paperclip, Printer, Settings as Gear, Trash2, Upload, X } from 'lucide-react';
import { DEFAULT_SETTINGS, STATUSES, deleteDoc, getDoc, loadFiles, loadSettings, log, newFile, now, putDoc, saveFiles, saveSettings, uid, type DocMeta, type FileStatus, type LotSnapshot, type PropertyFile, type Settings } from '../lib/files';
import { DOC_CATEGORIES, PREOFFER_CHECKS, docCategory, preofferFindings } from '../lib/checklists';
import { reportHtml } from '../lib/reportHtml';

interface Props { pending: LotSnapshot | null; onClose: () => void; onShowLot: (s: LotSnapshot) => void }

// Internal use only: the broker tabs (Agreement, Disclosure, Listing, Supervision) were removed on 2026-11-26.
const TABS = ['Report', 'Pre-offer', 'Documents', 'History'] as const;
type Tab = typeof TABS[number];
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const kb = (b: number) => b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`;

/** Property files: branded reports, broker worksheets, documents and activity, kept in this browser. */
export default function Reports({ pending, onClose, onShowLot }: Props) {
  const [files, setFiles] = useState<PropertyFile[]>(loadFiles);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState<FileStatus | ''>('');
  const [q, setQ] = useState('');
  const handled = useRef<LotSnapshot | null>(null);

  useEffect(() => saveFiles(files), [files]);
  useEffect(() => saveSettings(settings), [settings]);

  // Opening from a lot: reuse that lot's file if there is one, otherwise start a new file.
  useEffect(() => {
    if (!pending || handled.current === pending) return;
    handled.current = pending;
    const existing = files.find(f => f.snapshot.lot === pending.lot && f.status !== 'Archived');
    if (existing) {
      setFiles(fs => fs.map(f => f.id === existing.id ? log({ ...f, snapshot: { ...pending } }, 'Parcel data refreshed from the atlas') : f));
      setOpenId(existing.id);
    } else {
      const f = newFile(pending);
      setFiles(fs => [f, ...fs]);
      setOpenId(f.id);
    }
  }, [pending, files]);

  const file = files.find(f => f.id === openId) || null;
  const update = (fn: (f: PropertyFile) => PropertyFile) => setFiles(fs => fs.map(f => f.id === openId ? { ...fn(f), updated: now() } : f));

  return <div className="rp-backdrop" role="dialog" aria-modal="true" aria-label="Property files">
    <div className="rp-shell">
      <header className="rp-top">
        {file || showSettings ? <button className="rp-ghost" onClick={() => { setOpenId(null); setShowSettings(false); }}><ArrowLeft size={16}/> All files</button> : <h2><FolderOpen size={18}/> Property files</h2>}
        <div className="rp-top-actions">
          {!showSettings && <button className="rp-ghost" onClick={() => { setShowSettings(true); setOpenId(null); }}><Gear size={15}/> Branding & agency</button>}
          <button className="icon-button" onClick={onClose} aria-label="Close property files"><X size={18}/></button>
        </div>
      </header>
      <div className="rp-body">
        {showSettings ? <SettingsView settings={settings} setSettings={setSettings} files={files} setFiles={setFiles}/>
          : file ? <FileView file={file} settings={settings} update={update} onShowLot={() => onShowLot(file.snapshot)} onDelete={async () => {
            if (!confirm('Delete this property file and its documents from this browser?')) return;
            await Promise.all(file.docs.map(d => deleteDoc(d.id).catch(() => undefined)));
            setFiles(fs => fs.filter(f => f.id !== file.id)); setOpenId(null);
          }}/>
          : <Dashboard files={files} filter={filter} setFilter={setFilter} q={q} setQ={setQ} open={setOpenId}/>}
      </div>
    </div>
  </div>;
}

function Dashboard({ files, filter, setFilter, q, setQ, open }: { files: PropertyFile[]; filter: FileStatus | ''; setFilter: (s: FileStatus | '') => void; q: string; setQ: (s: string) => void; open: (id: string) => void }) {
  const counts = useMemo(() => Object.fromEntries(STATUSES.map(s => [s, files.filter(f => f.status === s).length])), [files]);
  const shown = files.filter(f => (!filter || f.status === filter) && (!q || `${f.snapshot.address} ${f.snapshot.lot}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  const recent = files.flatMap(f => f.history.slice(0, 5).map(h => ({ ...h, f }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return <div className="rp-dash">
    <div className="rp-stats">
      <button className={!filter ? 'on' : ''} onClick={() => setFilter('')}><b>{files.length}</b>All files</button>
      {STATUSES.map(s => <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(filter === s ? '' : s)}><b>{counts[s]}</b>{s}</button>)}
    </div>
    <input className="rp-search" placeholder="Search address or lot" value={q} onChange={e => setQ(e.target.value)}/>
    {files.length === 0 ? <div className="rp-empty"><FileText size={28}/><p><b>No property files yet.</b> Click a lot on the map, then <b>Create report</b> in its card. The file keeps the report, worksheets, documents and history together.</p></div>
      : <div className="rp-table" role="table">
        <div className="rp-row rp-head" role="row"><span>Property</span><span>Status</span><span>Progress</span><span>Updated</span></div>
        {shown.map(f => { const done = PREOFFER_CHECKS.filter(c => f.checks[c.key]).length; return <button className="rp-row" role="row" key={f.id} onClick={() => open(f.id)}>
          <span><b>{f.snapshot.address || `Parcel ${f.snapshot.lot}`}</b><small>Tax map {f.snapshot.lot}</small></span>
          <span><i className={`rp-pill s-${f.status.replace(/\s/g, '')}`}>{f.status}</i></span>
          <span><i className="rp-bar"><i style={{ width: `${done / PREOFFER_CHECKS.length * 100}%` }}/></i><small>{done}/{PREOFFER_CHECKS.length} checks · {f.docs.length} docs</small></span>
          <span><small>{when(f.updated)}</small></span></button>; })}
      </div>}
    {recent.length > 0 && <section className="rp-card"><h3>Recent activity</h3><ul className="rp-history">{recent.map((h, i) => <li key={i}><time>{when(h.at)}</time><span><b>{h.f.snapshot.address || h.f.snapshot.lot}</b> · {h.text}</span></li>)}</ul></section>}
  </div>;
}

function FileView({ file, settings, update, onShowLot, onDelete }: { file: PropertyFile; settings: Settings; update: (fn: (f: PropertyFile) => PropertyFile) => void; onShowLot: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<Tab>('Report');
  const s = file.snapshot;
  return <div className="rp-file">
    <div className="rp-file-head">
      <div><div className="eyebrow">{s.place ? s.place.toUpperCase() : 'PROPERTY FILE'} · {s.lot}</div><h2>{s.address || `Parcel ${s.lot}`}</h2>
        <button className="rp-link" onClick={onShowLot}>Show on map</button></div>
      <div className="rp-file-meta">
        <label>Status<select value={file.status} onChange={e => update(f => log({ ...f, status: e.target.value as FileStatus }, `Status changed to ${e.target.value}`))}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select></label>
        <button className="rp-ghost danger" onClick={onDelete} title="Delete file"><Trash2 size={15}/></button>
      </div>
    </div>
    <nav className="rp-tabs">{TABS.map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
    {tab === 'Report' && <DocPreview html={reportHtml(file, settings)} onPrint={() => update(f => log({ ...f, reports: f.reports + 1 }, 'Property report generated'))} intro={<>
      A branded report built from the tax roll, sales and the parcel map, section by section, with the status of your checks.</>}/>}
    {tab === 'Pre-offer' && <Checklist file={file} update={update}/>}
    {tab === 'Documents' && <Documents file={file} update={update}/>}
    {tab === 'History' && <section className="rp-card"><h3>Activity history</h3><ul className="rp-history">{file.history.map((h, i) => <li key={i}><time>{when(h.at)}</time><span>{h.text}</span></li>)}</ul></section>}
  </div>;
}

function DocPreview({ html, onPrint, intro, compact }: { html: string; onPrint: () => void; intro?: ReactNode; compact?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  return <section className="rp-card">
    {intro && <p className="rp-intro">{intro}</p>}
    <div className="rp-actions"><button className="rp-primary" onClick={() => { frame.current?.contentWindow?.print(); onPrint(); }}><Printer size={15}/> Print / Save as PDF</button>
      <button className="rp-ghost" onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }}>Open in new tab <ArrowUpRight size={13}/></button></div>
    <iframe ref={frame} className={`rp-frame${compact ? ' compact' : ''}`} title="Document preview" srcDoc={html}/>
  </section>;
}

function Checklist({ file, update }: { file: PropertyFile; update: (fn: (f: PropertyFile) => PropertyFile) => void }) {
  const s = file.snapshot;
  const extra: Record<string, string | undefined> = { roll: s.rollUrl, zoning: s.zoneGrid || s.zoningUrl };
  const done = PREOFFER_CHECKS.filter(c => file.checks[c.key]).length;
  const notes = file.checkNotes || {};
  function fill() {
    const found = preofferFindings(file);
    update(f => {
      const n = { ...(f.checkNotes || {}) }, ch = { ...f.checks };
      for (const [k, v] of Object.entries(found)) { if (!n[k]) n[k] = v.note; if (v.done && ch[k] === undefined) ch[k] = true; }
      return log({ ...f, checkNotes: n, checks: ch }, `Pre-offer filled from atlas data (${Object.keys(found).length} items)`);
    });
  }
  return <section className="rp-card"><p className="rp-intro">Before signing the contract. Each line links to the primary source. {done}/{PREOFFER_CHECKS.length} done.
    <button className="rp-fill" onClick={fill}>Fill in from atlas data</button></p>
    <ul className="rp-checks">{PREOFFER_CHECKS.map(c => { const url = c.url || extra[c.key]; return <li key={c.key}><div className="rp-checkrow"><label><input type="checkbox" checked={!!file.checks[c.key]} onChange={e => update(f => log({ ...f, checks: { ...f.checks, [c.key]: e.target.checked } }, `${e.target.checked ? 'Checked' : 'Unchecked'}: ${c.label}`))}/>{c.label}</label>
      {url && <a href={url} target="_blank" rel="noreferrer">Open <ArrowUpRight size={11}/></a>}</div>
      <input className="rp-note" placeholder="Finding, date, source…" value={notes[c.key] || ''} onChange={e => update(f => ({ ...f, checkNotes: { ...(f.checkNotes || {}), [c.key]: e.target.value } }))}/></li>; })}</ul></section>;
}

function Documents({ file, update }: { file: PropertyFile; update: (fn: (f: PropertyFile) => PropertyFile) => void }) {
  const [cat, setCat] = useState(DOC_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const metas: DocMeta[] = [];
    for (const blob of Array.from(list)) { const id = uid(); await putDoc(id, blob); metas.push({ id, name: blob.name, size: blob.size, type: blob.type, added: now(), category: cat }); }
    update(f => log({ ...f, docs: [...metas, ...f.docs] }, `Added ${metas.length === 1 ? metas[0].name : `${metas.length} documents`} (${cat})`));
    setBusy(false);
  }
  async function open(id: string, name: string, download = false) {
    const blob = await getDoc(id); if (!blob) return alert('This document is not in this browser.');
    const url = URL.createObjectURL(blob);
    if (download) { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); } else window.open(url, '_blank');
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <section className="rp-card"><p className="rp-intro">Keep the agreement, disclosures, survey, title commitment, inspections, insurance, HOA documents and photos with the file. Documents stay in this browser.</p>
    <div className="rp-actions"><select value={cat} onChange={e => setCat(e.target.value)}>{DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
      <label className="rp-primary"><Paperclip size={15}/> {busy ? 'Adding…' : 'Add documents'}<input type="file" multiple hidden onChange={e => { void add(e.target.files); e.target.value = ''; }}/></label>
      {file.docs.length > 0 && <button className="rp-ghost" onClick={() => file.docs.forEach((d, i) => window.setTimeout(() => void open(d.id, d.name, true), i * 400))}><Download size={14}/> Download all</button>}</div>
    {file.docs.length === 0 ? <p className="rp-muted">No documents yet.</p> : <ul className="rp-docs">{file.docs.map(d => <li key={d.id}>
      <button className="rp-link" onClick={() => void open(d.id, d.name)}>{d.name}</button><small>{docCategory(d.category)} · {kb(d.size)} · {when(d.added)}</small>
      <button className="rp-ghost" onClick={() => void open(d.id, d.name, true)} aria-label={`Download ${d.name}`}><Download size={13}/></button>
      <button className="rp-ghost danger" aria-label={`Remove ${d.name}`} onClick={async () => { await deleteDoc(d.id).catch(() => undefined); update(f => log({ ...f, docs: f.docs.filter(x => x.id !== d.id) }, `Removed ${d.name}`)); }}><Trash2 size={13}/></button></li>)}</ul>}
  </section>;
}

function SettingsView({ settings, setSettings, files, setFiles }: { settings: Settings; setSettings: (s: Settings) => void; files: PropertyFile[]; setFiles: (f: PropertyFile[]) => void }) {
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  // Internal use only: no broker name, title, license or contact details.
  const fields: [keyof Settings, string][] = [['agency', 'Agency']];
  function logo(file?: File) {
    if (!file) return;
    const r = new FileReader(); r.onload = () => set({ logo: String(r.result) }); r.readAsDataURL(file);
  }
  function backup() {
    const blob = new Blob([JSON.stringify({ settings, files }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `property-files-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }
  function restore(file?: File) {
    if (!file) return;
    file.text().then(t => { const d = JSON.parse(t); if (Array.isArray(d.files)) setFiles(d.files); if (d.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings }); }).catch(() => alert('That backup could not be read.'));
  }
  return <div className="rp-settings">
    <section className="rp-card"><h3>Report branding</h3><p className="rp-intro">Printed at the top of every report and worksheet.</p>
      <div className="rp-form">{fields.map(([k, l]) => <label key={k}>{l}<input value={String(settings[k])} onChange={e => set({ [k]: e.target.value })}/></label>)}
        <label>Accent colour<input type="color" value={settings.color} onChange={e => set({ color: e.target.value })}/></label>
        <label>Logo<span className="rp-logo">{settings.logo && <img src={settings.logo} alt=""/>}<label className="rp-ghost"><Upload size={14}/> Upload<input type="file" accept="image/*" hidden onChange={e => logo(e.target.files?.[0])}/></label>{settings.logo && <button className="rp-ghost" onClick={() => set({ logo: '' })}>Remove</button>}</span></label></div></section>
    <section className="rp-card"><h3>Backup</h3><p className="rp-intro">Files are saved in this browser only. Download a backup to move them to another computer or share them with your agency. Attached documents are not included.</p>
      <div className="rp-actions"><button className="rp-primary" onClick={backup}><Download size={15}/> Download backup</button><label className="rp-ghost"><Upload size={14}/> Restore backup<input type="file" accept="application/json" hidden onChange={e => restore(e.target.files?.[0])}/></label></div></section>
  </div>;
}
