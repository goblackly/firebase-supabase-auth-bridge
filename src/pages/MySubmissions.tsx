import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  ExternalLink,
  Calendar,
  Store,
  DollarSign,
  History as HistoryIcon
} from 'lucide-react';
import { Submission } from '../types';
import { fetchUserSubmissions } from '../services/supabaseReads';

export default function MySubmissions() {
  const { profile, user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;

    async function loadSubmissions() {
      if (!user || !profile?.uid) {
        setSubmissions([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const data = await fetchUserSubmissions(profile.uid);
        if (!cancelled) {
          setSubmissions(data);
        }
      } catch (error) {
        console.error('Failed to load Supabase submissions:', error);
        if (!cancelled) {
          setSubmissions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, [profile?.uid, user]);

  const filteredSubmissions = submissions.filter(sub => {
    if (filter === 'all') return true;
    return sub.status === filter;
  });

  return (
    <Layout title="My Submissions">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterButton>
            <FilterButton active={filter === 'pending'} onClick={() => setFilter('pending')}>Pending</FilterButton>
            <FilterButton active={filter === 'approved'} onClick={() => setFilter('approved')}>Approved</FilterButton>
            <FilterButton active={filter === 'rejected'} onClick={() => setFilter('rejected')}>Rejected</FilterButton>
          </div>

          <div className="text-sm text-slate-500">
            Showing {filteredSubmissions.length} submissions
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sigma-blue"></div>
          </div>
        ) : filteredSubmissions.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {filteredSubmissions.map((sub) => (
              <div key={sub.id} className="glass-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/10 transition-all group">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    sub.status === 'approved' ? 'bg-emerald-400/10 text-emerald-400' :
                    sub.status === 'rejected' ? 'bg-red-400/10 text-red-400' :
                    'bg-amber-400/10 text-amber-400'
                  }`}>
                    {sub.status === 'approved' ? <CheckCircle2 className="w-6 h-6" /> :
                     sub.status === 'rejected' ? <XCircle className="w-6 h-6" /> :
                     <Clock className="w-6 h-6" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-white">{sub.business_name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        sub.status === 'approved' ? 'bg-emerald-400/20 text-emerald-400' :
                        sub.status === 'rejected' ? 'bg-red-400/20 text-red-400' :
                        'bg-amber-400/20 text-amber-400'
                      }`}>
                        {sub.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {new Date(sub.receipt_date).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><Store className="w-4 h-4" /> {sub.category}</span>
                      {(sub.city || sub.business_address) && (
                        <span className="flex items-center gap-1">
                          <Search className="w-4 h-4" />
                          {sub.business_address ? `${sub.business_address}, ` : ''}
                          {sub.city}{sub.state ? `, ${sub.state}` : ''}
                          {sub.zip_code ? ` ${sub.zip_code}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                  <div className="text-2xl font-bold text-white flex items-center gap-1">
                    <DollarSign className="w-5 h-5 text-slate-500" />
                    {sub.amount_spent.toLocaleString()}
                  </div>
                  {sub.receipt_file_url ? (
                    <a
                      href={sub.receipt_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sigma-blue text-sm font-semibold flex items-center gap-1 hover:underline"
                    >
                      View Receipt <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <span className="text-slate-500 text-xs italic">No receipt attached</span>
                  )}
                </div>

                {sub.admin_notes && (
                  <div className="md:hidden mt-4 p-3 bg-red-400/5 border border-red-400/10 rounded-xl text-xs text-red-400">
                    <strong>Admin Note:</strong> {sub.admin_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-20 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <HistoryIcon className="w-10 h-10 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No submissions found</h3>
            <p className="text-slate-500 mb-8">You haven't submitted any receipts with this filter yet.</p>
            <button
              onClick={() => setFilter('all')}
              className="btn-secondary inline-flex"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

function FilterButton({ children, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
        active
        ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20'
        : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
