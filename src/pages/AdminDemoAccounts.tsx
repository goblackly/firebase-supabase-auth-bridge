import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import type { UserProfile } from '../types';

export default function AdminDemoAccounts() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [adminEmail, setAdminEmail] = useState('admin@pbskus.net');
  const [memberEmail, setMemberEmail] = useState('demo@pbskus.net');
  const fullAdmin = profile?.role === 'admin' && profile?.account_mode === 'normal';
  async function load() {
    const { data, error } = await supabase.from('users').select('auth_user_id,firebase_uid,first_name,last_name,email,role,account_mode');
    if (error) throw error;
    setUsers((data ?? []).map(u => ({ ...u, uid: u.firebase_uid, created_at: '' })));
  }
  useEffect(() => { if (fullAdmin) void load().catch(e => setError(e.message)); }, [fullAdmin]);
  async function createDemo(email: string, accountMode: 'demo_admin' | 'demo_member') {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', { body: {
        email, accountMode, firstName: 'Demo', lastName: accountMode === 'demo_admin' ? 'Admin' : 'Brother', role: 'member',
      } });
      if (error || data?.error) throw error ?? new Error(data.error);
      await load();
      setNotice('Demo account created with restricted access. Set its password privately before distributing it.');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function inviteDemo(u: UserProfile) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke('send-password-reset-email', { body: { email: u.email, type: 'admin-created-account' } });
      if (error || data?.error) throw error ?? new Error(data.error);
      setNotice(`A labeled demo invitation was sent to ${u.email}. Set the password privately using its link.`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function action(u: UserProfile, mode?: string) {
    if (!u.auth_user_id) return;
    if (!window.confirm(mode ? `Designate ${u.email} as ${mode}? Use accounts created specifically for this demo.` : `Archive demo receipts and permanently remove their uploaded receipt files for ${u.email}? Real receipts are never included.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error } = mode ? await supabase.rpc('designate_demo_account', { p_user: u.auth_user_id, p_mode: mode })
        : await supabase.functions.invoke('cleanup-demo', { body: { userId: u.auth_user_id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setNotice(mode ? 'Designation saved. Sign the demo account out and back in.' : `${data.archived} demo receipts archived; ${data.filesRemoved} receipt files removed.`);
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Layout title="Live Demo Accounts">
    {!fullAdmin ? <p className="text-slate-400">Only a full administrator can configure demo accounts.</p> : <>
      <p className="text-slate-400 mb-6">Create dedicated demo accounts with restricted access from the start. Set passwords privately before sharing. Demo data never counts toward chapter results.</p>
      <div className="glass-card p-4 mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3"><label className="flex-1 text-slate-300">Demo admin email<input type="email" className="input-field p-3 mt-2 w-full" value={adminEmail} onChange={e=>setAdminEmail(e.target.value)} /></label>
          <button disabled={busy || !adminEmail.includes('@')} className="btn-secondary p-3 self-end" onClick={()=>void createDemo(adminEmail,'demo_admin')}>Create Demo Admin</button></div>
        <div className="flex flex-col sm:flex-row gap-3"><label className="flex-1 text-slate-300">Demo brother email<input type="email" className="input-field p-3 mt-2 w-full" value={memberEmail} onChange={e=>setMemberEmail(e.target.value)} /></label>
          <button disabled={busy || !memberEmail.includes('@')} className="btn-secondary p-3 self-end" onClick={()=>void createDemo(memberEmail,'demo_member')}>Create Demo Brother</button></div>
        <p className="text-xs text-slate-400">Passwords are generated securely and never displayed. Send a demo invitation only if you can receive email at that address.</p>
      </div>
      {error && <p role="alert" className="text-red-300 mb-4">{error}</p>}{notice && <p role="status" className="text-emerald-400 mb-4">{notice}</p>}
      <div className="space-y-3">{users.filter(u => u.auth_user_id !== profile.auth_user_id).map(u => <div key={u.uid} className="glass-card p-4 flex flex-col sm:flex-row justify-between gap-4">
        <div><p className="font-semibold text-white">{u.first_name} {u.last_name}</p><p className="text-sm text-slate-400">{u.email} · {u.account_mode}</p></div>
        <div className="flex flex-wrap gap-2"><button disabled={busy} className="btn-secondary p-2" onClick={() => void action(u,'demo_member')}>Demo Brother</button>
          <button disabled={busy} className="btn-secondary p-2" onClick={() => void action(u,'demo_admin')}>Demo Admin</button>
          {u.account_mode !== 'normal' && <><button disabled={busy} className="btn-secondary p-2" onClick={() => void inviteDemo(u)}>Send Demo Invitation</button><button disabled={busy} className="btn-secondary p-2" onClick={() => void action(u)}>Clean Up Demo Receipts</button><button disabled={busy} className="btn-secondary p-2" onClick={() => void action(u,'normal')}>Remove Designation</button></>}</div>
      </div>)}</div>
    </>}
  </Layout>;
}
