import { useState } from 'react';
import { Cloud, Crosshair, Download, EyeOff, MapPin, Trash2, X } from 'lucide-react';
import { MY_PIN_STATUS, myPinsCsv, downloadText, type CloudState, type MyPin, type MyPinStatus } from '../lib/myPins';

interface Props {
  pins: MyPin[];
  placing: boolean;
  activeId: string | null;
  canPinParcel: boolean;
  hideTransfers: boolean;
  onToggleTransfers: () => void;
  fileName: string;
  onTogglePlacing: () => void;
  onPinParcel: () => void;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<MyPin>) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onFly: (pin: MyPin) => void;
  onOpenParcel: (pin: MyPin) => void;
  cloud: CloudState;
  onConnect: (passphrase: string) => Promise<string>;
  onDisconnect: () => void;
}

export default function MyPinsPanel(p: Props) {
  const [asking, setAsking] = useState(false), [pass, setPass] = useState(''), [err, setErr] = useState('');
  const label = p.cloud === 'synced' ? 'Synced with your DRE cloud' : p.cloud === 'syncing' ? 'Syncing…' : p.cloud === 'offline' ? 'Offline — will retry' : p.cloud === 'auth' ? 'Passphrase rejected' : '';
  return <section className="my-pins" aria-label="My research pins">
    <div className="my-pins-head"><strong><MapPin size={14}/> My pins{p.pins.length ? ` (${p.pins.length})` : ''}</strong>
      {p.pins.length > 0 && <span className="my-pins-tools">
        <button className="text-button" onClick={() => downloadText(p.fileName, myPinsCsv(p.pins))}><Download size={12}/> CSV</button>
        <button className="text-button" onClick={() => { if (window.confirm(`Delete all ${p.pins.length} of your pins?`)) p.onClear(); }}><X size={12}/> Clear</button>
      </span>}
    </div>
    <div className="my-pins-actions">
      <button className={`pin-btn ${p.placing ? 'on' : ''}`} onClick={p.onTogglePlacing}><Crosshair size={13}/> {p.placing ? 'Click the map… (done)' : 'Drop a pin'}</button>
      <button className={`pin-btn ${p.hideTransfers ? 'on' : ''}`} aria-pressed={p.hideTransfers} onClick={p.onToggleTransfers} title="Ignore $0–$100 transfers when colouring lots and labelling sales"><EyeOff size={13}/> {p.hideTransfers ? 'Transfers hidden' : 'Hide transfers'}</button>
      {p.canPinParcel && <button className="pin-btn" onClick={p.onPinParcel}><MapPin size={13}/> Pin open parcel</button>}
    </div>
    <div className="cloud-row">
      {p.cloud === 'off' || p.cloud === 'auth'
        ? (asking
          ? <form onSubmit={async e => { e.preventDefault(); setErr(''); const m = await p.onConnect(pass); if (m) setErr(m); else { setAsking(false); setPass(''); } }}>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Your DRE passphrase" aria-label="DRE passphrase" autoComplete="off"/>
              <button className="pin-btn" type="submit" disabled={!pass.trim()}>Connect</button>
              {(err || p.cloud === 'auth') && <small className="cloud-err">{err || 'Wrong passphrase.'}</small>}
            </form>
          : <button className="text-button" onClick={() => setAsking(true)}><Cloud size={12}/> Sync pins with your DRE cloud</button>)
        : <span className="cloud-ok"><Cloud size={12}/> {label}<button className="text-button" onClick={p.onDisconnect}>Disconnect</button></span>}
    </div>
    {p.placing && <p className="search-hint">Click anywhere on the map to drop a pin. Esc or the button ends it. Drag a pin to move it.</p>}
    {p.pins.length === 0 && !p.placing && <p className="search-hint">Drop pins on places you want to research later. They stay in this browser.</p>}
    {p.pins.map(pin => {
      const open = p.activeId === pin.id, st = MY_PIN_STATUS[pin.status];
      return <div key={pin.id} className={`my-pin-row ${open ? 'on' : ''}`}>
        <button className="my-pin-main" onClick={() => { p.onSelect(open ? null : pin.id); if (!open) p.onFly(pin); }}>
          <i style={{ background: st.color }}/><span>{pin.label}</span><em>{st.label}</em>
        </button>
        {open && <div className="my-pin-edit">
          <input value={pin.label} onChange={e => p.onUpdate(pin.id, { label: e.target.value })} aria-label="Pin name" placeholder="Name"/>
          <select value={pin.status} onChange={e => p.onUpdate(pin.id, { status: e.target.value as MyPinStatus })} aria-label="Status">
            {(Object.keys(MY_PIN_STATUS) as MyPinStatus[]).map(k => <option key={k} value={k}>{MY_PIN_STATUS[k].label}</option>)}
          </select>
          <textarea value={pin.note} onChange={e => p.onUpdate(pin.id, { note: e.target.value })} rows={3} placeholder="Notes: what to check, who to call, ideas…" aria-label="Notes"/>
          <div className="my-pin-btns">
            <button className="text-button" onClick={() => p.onOpenParcel(pin)}>Open parcel here</button>
            <button className="text-button danger" onClick={() => { p.onRemove(pin.id); p.onSelect(null); }}><Trash2 size={12}/> Delete</button>
          </div>
        </div>}
      </div>;
    })}
  </section>;
}
