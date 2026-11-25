import { useCallback, useEffect, useRef, useState } from 'react';

export type MyPinStatus = 'research' | 'promising' | 'followup' | 'pass';
export const MY_PIN_STATUS: Record<MyPinStatus, { label: string; color: string }> = {
  research: { label: 'To research', color: '#7c3aed' },
  promising: { label: 'Promising', color: '#14a37f' },
  followup: { label: 'Follow up', color: '#e08a00' },
  pass: { label: 'Pass', color: '#8a8f87' },
};
// A pin sits on a parcel: `parcel` is "<county no>-<parcel id>" and lng / lat the parcel's centre ("-": no parcel nearby).
export interface MyPin { id: string; lng: number; lat: number; label: string; note: string; status: MyPinStatus; created: number; updatedAt?: number; parcel?: string; address?: string; fit?: number } // fit 1: placed at a point inside the lot

// ---- Optional cloud sync with the DRE backend (same "pins" list DRE uses) ----
const CLOUD = 'https://dre-v5-jgarabedian.fly.dev';
const SECRET_KEY = 'atlas-cloud-secret';
export type CloudState = 'off' | 'syncing' | 'synced' | 'offline' | 'auth';
const hash = (o: unknown) => { const s = JSON.stringify(o); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };
interface Base { rev: number; h: Record<string, string> }

/** The user's own research pins, kept in this browser (localStorage); with the DRE passphrase they also sync to the DRE cloud. */
export function useMyPins(storageKey: string) {
  const [pins, setPins] = useState<MyPin[]>(() => { try { const v = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } });
  const pinsRef = useRef(pins); pinsRef.current = pins;
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(pins)); } catch { /* storage blocked: pins last for this visit */ } }, [storageKey, pins]);
  const add = useCallback((lng: number, lat: number, label = '', on?: { parcel?: string; address?: string; fit?: number }): string => {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setPins(list => [...list, { id, lng, lat, label: label || `Pin ${list.length + 1}`, note: '', status: 'research', created: Date.now(), updatedAt: Date.now(), ...(on?.parcel ? on : {}) }]);
    return id;
  }, []);
  const update = useCallback((id: string, patch: Partial<MyPin>) => setPins(list => list.map(p => p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)), []);
  const remove = useCallback((id: string) => setPins(list => list.filter(p => p.id !== id)), []);
  const forceNext = useRef(false);
  const clear = useCallback(() => { forceNext.current = true; setPins([]); }, []);

  // --- cloud ---
  const [secret, setSecret] = useState(() => { try { return localStorage.getItem(SECRET_KEY) || ''; } catch { return ''; } });
  const [cloud, setCloud] = useState<CloudState>(secret ? 'syncing' : 'off');
  const baseKey = `${storageKey}-cloudbase`;
  const base = useRef<Base>((() => { try { const b = JSON.parse(localStorage.getItem(baseKey) || ''); if (b && b.h) return b as Base; } catch { /* none yet */ } return { rev: -1, h: {} }; })());
  const saveBase = () => { try { localStorage.setItem(baseKey, JSON.stringify(base.current)); } catch { /* fine */ } };
  const busy = useRef(false), again = useRef(false);

  const sync = useCallback(async () => {
    if (!secret) return;
    if (busy.current) { again.current = true; return; }
    busy.current = true; setCloud('syncing');
    const headers = { 'Content-Type': 'application/json', 'x-app-secret': secret };
    try {
      do {
        again.current = false;
        // 1. pull: merge the cloud's pins into ours (my unpushed edits win unless the cloud copy is newer)
        const r = await fetch(`${CLOUD}/api/pins`, { headers });
        if (r.status === 401) { setCloud('auth'); try { localStorage.removeItem(SECRET_KEY); } catch { /* */ } setSecret(''); return; }
        const full = await r.json();
        if (!r.ok || !full?.ok) throw new Error('pull failed');
        const server: MyPin[] = Array.isArray(full.pins) ? full.pins : [];
        const local = pinsRef.current, lmap = new Map(local.map(p => [p.id, p])), sids = new Set(server.map(p => p.id));
        const out: MyPin[] = [], nb: Record<string, string> = {};
        for (const sp of server) {
          const l = lmap.get(sp.id), bh = base.current.h[sp.id], sh = hash(sp);
          if (!l) { if (bh !== undefined) { nb[sp.id] = bh; continue; } out.push(sp); nb[sp.id] = sh; continue; } // deleted here, delete still pending
          const lh = hash(l);
          if (lh === sh) { out.push(l); nb[sp.id] = sh; continue; }
          if (bh === lh) { out.push(sp); nb[sp.id] = sh; continue; } // no pending edit here: take the cloud's copy
          if ((sp.updatedAt || 0) > (l.updatedAt || 0)) { out.push(sp); nb[sp.id] = sh; } else { out.push(l); if (bh !== undefined) nb[sp.id] = bh; }
        }
        const mine = local.filter(l => !sids.has(l.id) && base.current.h[l.id] === undefined); // created here, not pushed yet
        const next = [...out, ...mine].sort((a, b) => a.created - b.created);
        base.current.h = nb; base.current.rev = full.rev;
        if (next.length !== local.length || next.some((p, i) => p !== local[i])) { pinsRef.current = next; setPins(next); }
        // 2. push my pending changes
        const cur = pinsRef.current, seen = new Set<string>();
        const ops: { t: 'put' | 'del'; id: string; rec?: MyPin }[] = [];
        for (const p of cur) { seen.add(p.id); if (base.current.h[p.id] !== hash(p)) ops.push({ t: 'put', id: p.id, rec: p }); }
        for (const id of Object.keys(base.current.h)) if (!seen.has(id)) ops.push({ t: 'del', id });
        if (ops.length) {
          const post = await fetch(`${CLOUD}/api/pins/ops`, { method: 'POST', headers, body: JSON.stringify({ baseRev: base.current.rev, ops, force: forceNext.current }) });
          forceNext.current = false;
          const j = await post.json().catch(() => ({}));
          if (!j?.ok) throw new Error(j?.error || 'push failed');
          const skipped = new Set<string>((j.skipped || []).map((x: { id: string }) => x.id));
          for (const op of ops) { if (skipped.has(op.id)) { again.current = true; continue; } if (op.t === 'put') base.current.h[op.id] = hash(op.rec); else delete base.current.h[op.id]; }
          if (j.prevRev === base.current.rev) base.current.rev = j.rev; else again.current = true;
        }
        saveBase();
      } while (again.current);
      setCloud('synced');
    } catch { setCloud('offline'); } finally { busy.current = false; }
  }, [secret]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (secret) void sync(); }, [secret, sync]);
  useEffect(() => { if (!secret) return; const t = window.setTimeout(() => void sync(), 800); return () => window.clearTimeout(t); }, [pins, secret, sync]);
  useEffect(() => {
    if (!secret) return;
    const poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void sync(); }, 30000);
    const vis = () => { if (document.visibilityState === 'visible') void sync(); };
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', vis); };
  }, [secret, sync]);

  /** Check the passphrase against the DRE backend, then start syncing. Returns an error message, or '' on success. */
  const connect = useCallback(async (pass: string): Promise<string> => {
    try {
      const r = await fetch(`${CLOUD}/api/pins`, { headers: { 'x-app-secret': pass.trim() } });
      if (r.status === 401) return 'Wrong passphrase.';
      if (!r.ok) return 'The DRE cloud did not answer. Try again.';
      try { localStorage.setItem(SECRET_KEY, pass.trim()); } catch { /* kept for this visit only */ }
      base.current = { rev: -1, h: {} };
      setSecret(pass.trim()); setCloud('syncing');
      return '';
    } catch { return 'Could not reach the DRE cloud.'; }
  }, []);
  const disconnect = useCallback(() => { try { localStorage.removeItem(SECRET_KEY); } catch { /* */ } setSecret(''); setCloud('off'); base.current = { rev: -1, h: {} }; saveBase(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { pins, add, update, remove, clear, cloud, connect, disconnect };
}

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function myPinsCsv(pins: MyPin[]): string {
  const rows = pins.map(p => [p.label, MY_PIN_STATUS[p.status].label, p.note, p.lat.toFixed(6), p.lng.toFixed(6), `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`, new Date(p.created).toISOString().slice(0, 10)]);
  return [['label', 'status', 'note', 'lat', 'lng', 'google_maps', 'added'], ...rows].map(r => r.map(cell).join(',')).join('\n');
}
export function downloadText(name: string, text: string, mime = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
