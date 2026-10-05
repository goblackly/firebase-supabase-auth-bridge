import React, { useEffect, useState } from 'react';
import { fetchBusinessCatalog, searchBusinesses, type DirectoryBusiness } from '../services/businessDirectory';
import type { ReceiptDraftFormData } from '../services/receiptDraft';

export default function BusinessPicker({ value, onChange }: { value: ReceiptDraftFormData; onChange: (value: ReceiptDraftFormData) => void }) {
  const [businesses, setBusinesses] = useState<DirectoryBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    fetchBusinessCatalog().then(rows => {
      if (!active) return;
      setBusinesses(rows);
    }).catch(() => active && setError('Business lookup is unavailable. Please retry before submitting.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);
  const matches = searchBusinesses(businesses, value.businessName).slice(0, 8);
  const selected = businesses.find(b => b.id === value.businessId);
  const stale = !!value.businessId && !loading && !error && (!selected || selected.updated_at !== value.businessVersion);
  function choose(b: DirectoryBusiness) {
    onChange({ ...value, businessId: b.id, businessVersion: b.updated_at, businessName: b.business_name,
      businessAddress: b.business_address ?? '', city: b.city ?? '', state: b.state ?? '', zipCode: b.zip_code ?? '',
      businessPhone: b.phone ?? '', businessWebsite: b.website ?? '', category: b.category ?? value.category, businessEntryMode: 'existing' });
    setOpen(false);
  }
  return <div className="space-y-3">
    <label className="label-text" htmlFor="business-search">Business Name</label>
    <input id="business-search" required maxLength={200} autoComplete="off" className="input-field w-full p-3"
      placeholder="Find a business by name, phone, or location" value={value.businessName}
      onFocus={() => setOpen(true)} onChange={e => { setOpen(true); onChange({ ...value, businessName: e.target.value, businessId: '', businessVersion: '', businessEntryMode: '' }); }} />
    {loading && <p role="status" className="text-sm text-slate-400">Loading businesses...</p>}
    {error && <p role="alert" className="text-sm text-red-300">{error} <button type="button" className="underline" onClick={() => window.location.reload()}>Retry lookup</button></p>}
    {stale && <p role="alert" className="text-amber-300 text-sm">This business changed. Please search and reselect it. Your other details are saved.</p>}
    {open && !loading && !error && <div className="border border-white/10 rounded-xl overflow-hidden">
      {matches.map(b => <button type="button" key={b.id} className="block text-left w-full p-3 hover:bg-white/5 border-b border-white/5" onClick={() => choose(b)}>
        <span className="text-white font-semibold">{b.business_name}</span><span className="block text-sm text-slate-400">{[b.business_address, b.city, b.state].filter(Boolean).join(', ') || 'Location not provided'}</span>
      </button>)}
      {!matches.length && <p className="p-3 text-sm text-slate-400">No matching business yet.</p>}
      <button type="button" className="p-3 text-sigma-gold text-left w-full" onClick={() => {
        onChange({ ...value, businessId: '', businessVersion: '', businessEntryMode: 'new' }); setOpen(false);
      }}>Add a new business</button>
    </div>}
    {value.businessEntryMode && !stale && <p role="status" className="text-sm text-emerald-400">{value.businessId ? 'Business selected. Confirm the location below.' : 'New business: enter its city and state below.'}</p>}
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="label-text">Business phone (optional)<input type="tel" maxLength={40} value={value.businessPhone ?? ''} onChange={e => onChange({ ...value, businessPhone: e.target.value })} className="input-field w-full p-3 mt-2" /></label>
      <label className="label-text">Website (optional)<input type="url" maxLength={500} placeholder="https://example.com" value={value.businessWebsite ?? ''} onChange={e => onChange({ ...value, businessWebsite: e.target.value })} className="input-field w-full p-3 mt-2" /></label>
    </div>
    <p className="text-xs text-slate-400">Phone and website help identify a branch. Existing directory records are not changed by a receipt submission.</p>
  </div>;
}
