import { useCallback, useEffect, useState } from 'react';

export type MyPinStatus = 'research' | 'promising' | 'followup' | 'pass';
export const MY_PIN_STATUS: Record<MyPinStatus, { label: string; color: string }> = {
  research: { label: 'To research', color: '#7c3aed' },
  promising: { label: 'Promising', color: '#14a37f' },
  followup: { label: 'Follow up', color: '#e08a00' },
  pass: { label: 'Pass', color: '#8a8f87' },
};
export interface MyPin { id: string; lng: number; lat: number; label: string; note: string; status: MyPinStatus; created: number }

/** The user's own research pins, kept in this browser (localStorage) under the given key. */
export function useMyPins(storageKey: string) {
  const [pins, setPins] = useState<MyPin[]>(() => { try { const v = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(pins)); } catch { /* storage blocked: pins last for this visit */ } }, [storageKey, pins]);
  const add = useCallback((lng: number, lat: number, label = ''): string => {
    const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setPins(list => [...list, { id, lng, lat, label: label || `Pin ${list.length + 1}`, note: '', status: 'research', created: Date.now() }]);
    return id;
  }, []);
  const update = useCallback((id: string, patch: Partial<MyPin>) => setPins(list => list.map(p => p.id === id ? { ...p, ...patch } : p)), []);
  const remove = useCallback((id: string) => setPins(list => list.filter(p => p.id !== id)), []);
  const clear = useCallback(() => setPins([]), []);
  return { pins, add, update, remove, clear };
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
