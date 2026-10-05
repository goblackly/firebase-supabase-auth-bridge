import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { fetchBusinessCatalog, safeWebsite, searchBusinesses, type DirectoryBusiness } from '../services/businessDirectory';
import { ownershipLabels } from '../services/businessRankings';

export default function Businesses() {
  const [rows, setRows] = useState<DirectoryBusiness[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setRows(await fetchBusinessCatalog(true)); }
    catch { setError('Unable to load businesses. Please try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const categories = [...new Set(rows.flatMap(b => b.categories))].sort();
  const results = searchBusinesses(rows, search, category);
  return <Layout title="Businesses We Support">
    <p className="text-slate-400 max-w-3xl mb-6">Discover businesses supported by approved chapter receipts. Listings are not proof of Black ownership; check each ownership label.</p>
    <div className="flex flex-wrap gap-3 mb-6">
      <input aria-label="Search directory" placeholder="Business name, phone, or location" value={search} onChange={e => setSearch(e.target.value)} className="input-field p-3 flex-1 min-w-48" />
      <select aria-label="Business category" value={category} onChange={e => setCategory(e.target.value)} className="input-field p-3"><option value="">All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
    </div>
    {loading ? <p role="status" className="text-slate-400">Loading directory...</p> : error ? <div role="alert" className="text-red-300">{error} <button onClick={() => void load()} className="underline">Retry</button></div> : <>
      <p className="text-sm text-slate-400 mb-4">{results.length} business locations</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">{results.map(b => <article key={b.id} className="glass-card p-5 space-y-3">
        <h3 className="font-semibold text-lg text-white">{b.business_name}</h3>
        <p className="text-sm text-slate-400">{[b.business_address, b.city, b.state, b.zip_code].filter(Boolean).join(', ') || 'Location not provided'}</p>
        {(!b.business_address || !b.city || !b.state) && <p className="text-xs text-slate-500">Location details incomplete</p>}
        <p className={`text-sm ${b.ownership_status === 'verified_black_owned' ? 'text-emerald-400' : 'text-slate-300'}`}>{ownershipLabels[b.ownership_status]}</p>
        <p className="text-xs text-slate-400">Sigma-owned: {b.sigma_owned == null ? 'Unknown' : b.sigma_owned ? 'Yes' : 'No'}</p>
        <p className="text-sm text-slate-400">{b.categories.join(' / ')}</p>
        <div className="flex gap-4 flex-wrap">{b.phone && <a className="text-sigma-gold underline text-sm" href={`tel:${b.phone.replace(/[^+\d]/g, '')}`}>{b.phone}</a>}
          {safeWebsite(b.website) && <a className="text-sigma-gold underline text-sm" href={safeWebsite(b.website)!} target="_blank" rel="noopener noreferrer">Visit Website</a>}</div>
      </article>)}</div>
      {!results.length && <p className="text-slate-400">No businesses match your search. Businesses appear after a real receipt is approved and linked.</p>}
    </>}
  </Layout>;
}
