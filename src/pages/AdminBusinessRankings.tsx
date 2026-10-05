import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import { auditBusinesses, ownershipLabels, rankBusinesses, rankingsCsv, reconciliation, locationLabel,
  type BusinessGroup, type BusinessSnapshot, type OwnershipStatus } from '../services/businessRankings';
import { confirmBusinessMatch, fetchBusinessSnapshot, reviewOwnership, unlinkBusinessMatch } from '../services/businessRegistry';
import { formatReceiptDate } from '../services/receiptDate';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function message(err: unknown) { return (err as { message?: string })?.message || 'Unable to complete the request. Please retry.'; }

export default function AdminBusinessRankings() {
  const { profile } = useAuth();
  const fullAdmin = profile?.account_mode === 'normal' && profile?.role === 'admin';
  const [showIssues, setShowIssues] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [preview, setPreview] = useState<{ identity: string | null; receipts: number; name: string; address: string | null }[] | null>(null);
  const [undoEvent, setUndoEvent] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<BusinessSnapshot | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('unmatched');
  const [review, setReview] = useState<BusinessGroup | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState('new');
  const [newRecord, setNewRecord] = useState({ business_name: '', business_address: '', city: '', state: '', zip_code: '' });
  const [ownership, setOwnership] = useState<OwnershipStatus>('unverified');
  const [sigma, setSigma] = useState('unknown');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true); setError('');
    try {
      const data = await fetchBusinessSnapshot() as BusinessSnapshot & { undo_event?: number | null };
      setSnapshot(data); setUndoEvent(data.undo_event ?? null);
    }
    catch (err) { setSnapshot(null); setError(message(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);

  async function historical(apply = false) {
    setSaving(true); setError('');
    try {
      if (apply && !window.confirm('Link historical receipts with complete exact identities? Incomplete locations remain unmatched for review. Original receipt details and totals will not change.')) return;
      const { data, error } = await supabase.rpc(apply ? 'apply_historical_business_links' : 'historical_business_preview');
      if (error) throw error;
      if (apply) { setPreview(null); setNotice(`${data} receipts linked. Check reconciliation below.`); await reload(); }
      else setPreview(data);
    } catch (e) { setError(message(e)); } finally { setSaving(false); }
  }
  async function consolidate() {
    if (!review?.business || target === 'new' || target === review.business.id) return;
    if (!window.confirm('Combine these business records? All receipts from the source branch will link to the selected target. Only confirm if they are the same branch.')) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('consolidate_businesses',{ p_source: review.business.id, p_target: target });
      if (error) throw error;
      setUndoEvent(Number(data)); setReview(null); await reload();
    } catch (e) { setError(message(e)); } finally { setSaving(false); }
  }

  function openReview(group: BusinessGroup) {
    setReview(group); setSelected(group.receipts.map(r => r.id));
    setTarget(group.business?.id ?? 'new');
    const r = group.business ?? group.receipts[0];
    setNewRecord({ business_name: group.name, business_address: r.business_address ?? '',
      city: r.city ?? '', state: r.state ?? '', zip_code: r.zip_code ?? '' });
    setOwnership(group.business?.ownership_status ?? 'unverified');
    setSigma(group.business?.sigma_owned == null ? 'unknown' : group.business.sigma_owned ? 'yes' : 'no');
    setNote(group.business?.verification_note ?? ''); setError('');
  }
  async function save(action: 'match' | 'unlink' | 'ownership') {
    if (!review) return;
    setSaving(true); setError('');
    try {
      if (action === 'ownership' && review.business) {
        await reviewOwnership(review.business, ownership, sigma === 'unknown' ? null : sigma === 'yes', note);
      } else if (action === 'unlink' && review.business) {
        await unlinkBusinessMatch(selected, review.business.id);
      } else {
        await confirmBusinessMatch(selected, target === 'new' ? null : target, target === 'new' ? newRecord : null, review.business?.id ?? null);
      }
      setReview(null); setNotice('Review saved. Original receipt details, amounts, dates, and statuses are unchanged.');
      await reload();
    } catch (err) { setError(message(err)); }
    finally { setSaving(false); }
  }

  const audit = snapshot ? auditBusinesses(snapshot) : null;
  const ranks = snapshot ? rankBusinesses(snapshot, year) : [];
  const check = snapshot ? reconciliation(snapshot, year) : null;
  const unsafe = !!audit && [...audit.invalidDates, ...audit.badAmounts, ...audit.missingMembers].some(r => r.status === 'approved');
  const years = [...new Set([new Date().getFullYear(), ...(snapshot?.year_totals.map(t => Number(t.year)) ?? [])])].sort((a, b) => b - a);
  const queue = audit?.groups.filter(g => (filter === 'all' || (filter === 'unmatched' ? !g.business : !!g.business)) &&
    `${g.name} ${g.location}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)) ?? [];

  return <Layout title="Business Rankings">
    <p className="text-slate-400 mb-6 max-w-3xl">Draft year-end awards report. Approved spending follows the receipt date, not approval date.
      Unmatched entries remain separate until an admin confirms the business and branch.</p>
    <div className="flex flex-wrap gap-3 items-center mb-6">
      <label className="text-slate-300">Report year <select aria-label="Report year" value={year} onChange={e => setYear(Number(e.target.value))}
        className="input-field ml-3 px-3 py-2">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
      <button className="btn-secondary px-4 py-2" disabled={loading || saving} onClick={() => void reload()}>Refresh</button>
      <button className="btn-primary px-4 py-2" disabled={!snapshot || loading || !check?.matches || unsafe}
        onClick={() => snapshot && download(rankingsCsv(snapshot, year), `black-spend-business-rankings-${year}.csv`, 'text/csv;charset=utf-8;')}>Export Rankings CSV</button>
      {fullAdmin && <button className="btn-secondary px-4 py-2" onClick={() => setShowTechnical(!showTechnical)}>Technical Audit</button>}
      {showTechnical && <button className="btn-secondary px-4 py-2" disabled={!snapshot || loading}
        onClick={() => snapshot && download(JSON.stringify({ generated_at: snapshot.generated_at, audit, year_totals: snapshot.year_totals }, null, 2),
          'black-spend-business-audit.json', 'application/json')}>Export Audit</button>}
      <Link to="/admin/reports" className="text-slate-400 underline">Chapter Reports</Link>
    </div>
    {error && <div role="alert" className="border border-red-500/30 bg-red-500/10 text-red-300 rounded-xl p-4 mb-4">{error}</div>}
    {notice && <p role="status" className="text-emerald-400 mb-4">{notice}</p>}
    {fullAdmin && <div className="flex flex-wrap gap-3 mb-5"><button className="btn-secondary px-4 py-2" onClick={() => setShowIssues(!showIssues)}>Issues to Review {showIssues ? '(Hide)' : ''}</button>
      <button disabled={saving} className="btn-secondary px-4 py-2" onClick={() => void historical()}>Preview Historical Links</button>
      {undoEvent && <button disabled={saving} className="btn-secondary px-4 py-2" onClick={async () => {
        const { error } = await supabase.rpc('undo_business_consolidation',{p_event:undoEvent});
        if (error) setError(error.message); else { setUndoEvent(null); await reload(); }
      }}>Undo Last Consolidation</button>}</div>}
    {preview && <div className="glass-card p-5 mb-5"><h3 className="text-white font-semibold">Read-only Historical Preview</h3><p className="text-slate-400 my-3">{preview.reduce((n,g) => n+g.receipts,0)} unlinked receipts. Complete exact identities reuse one branch; incomplete locations stay unmatched for review.</p>
      <div className="max-h-64 overflow-y-auto text-sm text-slate-400">{preview.map((g,i) => <p key={i}>{g.name} · {g.address || 'No street address'} · {g.receipts} receipts · {g.identity ? 'Exact complete identity' : 'Separate records; needs review'}</p>)}</div>
      <button disabled={saving} className="btn-primary p-3 mt-3" onClick={() => void historical(true)}>Apply Reviewed Safe Links</button><button className="p-3 text-slate-400" onClick={() => setPreview(null)}>Close</button></div>}
    {loading ? <p role="status" className="text-slate-400">Loading business audit...</p> : snapshot && audit && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-5"><p className="label-text">Approved Spend · {year}</p><p className="text-2xl font-bold text-white">{money(check!.cents)}</p><p className="text-slate-400">{check!.receipts} receipts · {ranks.length} business entries</p></div>
        <div className="glass-card p-5"><p className="label-text">Unmatched · All Years</p><p className="text-2xl font-bold text-sigma-gold">{snapshot.submissions.filter(r => !r.business_id).length}</p><p className="text-slate-400">Receipts awaiting identity review</p></div>
        <div className="glass-card p-5"><p className="label-text">Reconciliation</p><p className={`font-bold ${check!.matches && !unsafe ? 'text-emerald-400' : 'text-red-400'}`}>{check!.matches && !unsafe ? 'Totals reconciled' : 'Review required; export blocked'}</p><p className="text-slate-400">Database approved total: {money(check!.expectedCents)}</p></div>
      </div>
      <section className="glass-card mb-8 overflow-hidden">
        <div className="p-5 border-b border-white/5"><h3 className="text-lg font-bold text-white">Supported Businesses · {year}</h3>
          <p className="text-sm text-slate-400 mt-1">Includes all supported businesses. Verified Black ownership is required for award consideration; duplicate candidates need review.</p></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-slate-400"><tr>{['Rank', 'Business / Branch', 'Spend', 'Receipts', 'Brothers', 'Ownership / Eligibility', 'Review'].map(h => <th className="p-4" key={h}>{h}</th>)}</tr></thead>
          <tbody>{ranks.map(r => <tr key={r.key} className="border-t border-white/5">
            <td className="p-4 text-sigma-gold">{r.rank}{r.tied && <span className="block text-xs">Tie</span>}</td>
            <td className="p-4"><p className="text-white font-semibold">{r.name}</p><p className="text-xs text-slate-400 mt-1">{r.location}</p><p className="text-xs text-sigma-gold mt-1">{r.business ? 'Admin-matched' : 'Unmatched'}</p></td>
            <td className="p-4 font-semibold text-emerald-400 whitespace-nowrap">{money(r.cents)}</td>
            <td className="p-4 text-white">{r.receipts.length}</td><td className="p-4 text-white">{r.members}</td>
            <td className="p-4 text-slate-300">{ownershipLabels[r.business?.ownership_status ?? 'unverified']}<p className="text-xs text-slate-400 mt-1">
              {r.business?.ownership_status === 'verified_black_owned' ? 'Final award review required' : r.business?.ownership_status === 'not_black_owned' ? 'Not eligible' : 'Award eligibility pending'}</p>
              <p className="text-xs text-slate-400 mt-1">Sigma-owned: {r.business?.sigma_owned == null ? 'Unknown' : r.business.sigma_owned ? 'Yes' : 'No'}</p></td>
            <td className="p-4">{fullAdmin && <button className="text-sigma-gold underline" onClick={() => openReview(audit.groups.find(g => g.key === r.key)!)}>Review</button>}
              {!!audit.groups.find(g => g.key === r.key)?.duplicateReceipts.length && <p className="text-xs text-red-300 mt-2">Duplicate review needed</p>}</td>
          </tr>)}</tbody></table></div>{!ranks.length && <p className="p-6 text-slate-400">No approved receipts for this year.</p>}
      </section>
      {showIssues && fullAdmin && <section className="glass-card p-5">
        <h3 className="text-lg font-bold text-white">Issues to Review</h3>
        <p className="text-sm text-slate-400 mt-2">Legacy yes/no answers came from a Sigma-owned question, not verified Black ownership.
          Similar names are suggestions only; check locations before linking branches.</p>
        {showTechnical && <p className="text-sm text-slate-400 mt-2">{snapshot.submissions.filter(r => !r.city?.trim() || !r.state?.trim()).length} receipts missing city/state ·
          {' '}{audit.invalidDates.length} invalid dates · {audit.badAmounts.length} invalid amounts · {audit.missingMembers.length} missing member IDs ·
          {' '}{audit.groups.reduce((n, g) => n + g.duplicateReceipts.length, 0)} flagged or potential duplicate receipts</p>}
        <div className="flex flex-wrap gap-3 my-5">
          <input aria-label="Search businesses" placeholder="Search business or location" value={search} onChange={e => setSearch(e.target.value)} className="input-field px-4 py-2 flex-1 min-w-48" />
          <select aria-label="Review queue filter" value={filter} onChange={e => setFilter(e.target.value)} className="input-field px-4 py-2"><option value="unmatched">Unmatched</option><option value="matched">Matched</option><option value="all">All entries</option></select>
        </div>
        <div className="space-y-3">{queue.map(g => <div key={g.key} className="border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div><p className="font-semibold text-white">{g.name}</p><p className="text-sm text-slate-400">{g.location} · {g.receipts.length} receipts (all statuses)</p>
            {g.suggestions.length > 0 && <p className="text-xs text-sigma-gold mt-2">Possible variants: {g.suggestions.map(s => `${s.name} (${s.location})`).join('; ')}</p>}
            <p className="text-xs text-slate-400 mt-2">{g.missingLocation ? 'Location incomplete. ' : ''}{g.duplicateReceipts.length ? `${g.duplicateReceipts.length} duplicate candidates. ` : ''}{g.invalidDates.length ? 'Invalid receipt date. ' : ''}
              {g.business ? ownershipLabels[g.business.ownership_status] : 'Unmatched / ownership unverified'}</p></div>
          <button className="btn-secondary px-4 py-2 shrink-0" onClick={() => openReview(g)}>Review Business</button>
        </div>)}</div>{!queue.length && <p className="text-slate-400">No entries match this filter.</p>}
      </section>}
    </>}
    {review && snapshot && <div className="fixed inset-0 z-[70] bg-black/80 overflow-y-auto p-4 flex items-start justify-center" role="dialog" aria-modal="true" aria-label="Review business identity">
      <div className="glass-card w-full max-w-3xl p-6 my-8 bg-sigma-dark">
        <div className="flex justify-between gap-4"><h3 className="text-xl font-bold text-white">Review {review.name}</h3><button disabled={saving} onClick={() => setReview(null)} className="text-slate-300">Close</button></div>
        <p className="text-slate-400 text-sm my-4">Select only receipts for the same business and branch. Matching never changes original receipt details. Ownership requires a separate review.</p>
        {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}
        <div className="max-h-64 overflow-y-auto border border-white/10 rounded-lg mb-5">{review.receipts.map(r => <label key={r.id} className="flex gap-3 p-3 border-b border-white/5 text-sm text-slate-300">
          <input type="checkbox" aria-label={`Select receipt ${r.id}`} disabled={saving} checked={selected.includes(r.id)} onChange={e => setSelected(e.target.checked ? [...selected, r.id] : selected.filter(id => id !== r.id))} />
          <span>{r.business_name} · {formatReceiptDate(r.receipt_date)} · {money(Math.round(Number(r.amount_spent) * 100))} · {r.status}<span className="block text-xs text-slate-400">{locationLabel(r)} · Legacy answer: {r.legacy_ownership} · ID: {r.id}</span></span>
        </label>)}</div>
        <label className="label-text">Match selected receipts to<select aria-label="Business target" value={target} onChange={e => setTarget(e.target.value)} disabled={saving} className="input-field w-full px-3 py-2 mt-2 mb-4">
          <option value="new">Create a new branch record (Unverified)</option>{snapshot.businesses.map(b => <option key={b.id} value={b.id}>{b.business_name} — {locationLabel(b)} — {b.id.slice(0, 8)}</option>)}</select></label>
        {target === 'new' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">{(['business_name','business_address','city','state','zip_code'] as const).map(field => <label className="text-slate-400 text-sm" key={field}>
          {field.replace(/_/g, ' ')}<input aria-label={`Canonical ${field.replace(/_/g, ' ')}`} maxLength={field === 'business_name' ? 200 : 300} value={newRecord[field]} disabled={saving}
            onChange={e => setNewRecord({ ...newRecord, [field]: e.target.value })} className="input-field w-full px-3 py-2 mt-1" /></label>)}</div>}
        <div className="flex flex-wrap gap-3"><button disabled={saving || !selected.length || selected.length > 500 || (target === 'new' && !newRecord.business_name.trim())}
          onClick={() => void save('match')} className="btn-primary px-4 py-2">Confirm Selected Match ({selected.length})</button>
          {review.business && <button disabled={saving || !selected.length} onClick={() => void save('unlink')} className="btn-secondary px-4 py-2">Return Selected to Unmatched</button>}</div>
        {review.business && target !== 'new' && target !== review.business.id && <button disabled={saving} onClick={() => void consolidate()} className="btn-secondary p-3 mt-3">Combine Entire Source Branch Into Selected Business</button>}
        {review.business && <div className="border-t border-white/10 mt-6 pt-6">
          <h4 className="font-semibold text-white">Ownership Review · {review.business.business_name}</h4><p className="text-xs text-slate-400 mt-2 mb-4">Applies to every receipt linked to this branch. Record the source of your verification; never infer it from the legacy answer.</p>
          <label className="label-text">Black ownership<select aria-label="Black ownership" value={ownership} disabled={saving} onChange={e => setOwnership(e.target.value as OwnershipStatus)} className="input-field w-full px-3 py-2 my-2">{Object.entries(ownershipLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="label-text">Sigma ownership<select aria-label="Sigma ownership" value={sigma} disabled={saving} onChange={e => setSigma(e.target.value)} className="input-field w-full px-3 py-2 my-2"><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label>
          <label className="label-text">Verification source / note<textarea aria-label="Verification source" value={note} disabled={saving} onChange={e => setNote(e.target.value)} className="input-field w-full px-3 py-2 my-2" /></label>
          <button className="btn-secondary px-4 py-2" disabled={saving || (ownership !== 'unverified' && !note.trim())} onClick={() => void save('ownership')}>Save Ownership Review</button>
        </div>}
        {saving && <p role="status" className="text-slate-400 mt-4">Saving review...</p>}
      </div>
    </div>}
  </Layout>;
}
