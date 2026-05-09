import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import {
  Wallet,
  Receipt,
  Store,
  Users,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Trophy
} from 'lucide-react';
import { motion } from 'motion/react';
import { Submission, YearlyGoal, MonthlyGoal } from '../types';
import { fetchApprovedSubmissions, fetchMonthlyGoal, fetchUserSubmissions, fetchYearlyGoal } from '../services/supabaseReads';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [stats, setStats] = useState({
    totalSpend: 0,
    receiptCount: 0,
    businessesCount: 0,
    groupImpact: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);
  const [yearlyGoal, setYearlyGoal] = useState<YearlyGoal | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<MonthlyGoal | null>(null);
  const [currentYearSpend, setCurrentYearSpend] = useState(0);
  const [currentMonthSpend, setCurrentMonthSpend] = useState(0);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadSupabaseDashboardData() {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const [userSubmissions, approvedSubmissions, currentYearlyGoal, currentMonthlyGoal] = await Promise.all([
          fetchUserSubmissions(user.uid),
          fetchApprovedSubmissions(),
          fetchYearlyGoal(year),
          fetchMonthlyGoal(year, month),
        ]);

        if (cancelled) {
          return;
        }

        const approvedUserSubmissions = userSubmissions.filter((submission) => submission.status === 'approved');
        const businesses = new Set<string>();
        let total = 0;
        let impact = 0;

        approvedUserSubmissions.forEach((submission) => {
          total += submission.amount_spent;
          impact += submission.sigma_members_attended;
          businesses.add(submission.business_name.trim().toLowerCase());
        });

        setStats({
          totalSpend: total,
          receiptCount: approvedUserSubmissions.length,
          businessesCount: businesses.size,
          groupImpact: impact,
        });

        setRecentSubmissions(userSubmissions.slice(0, 5));

        let yearSpend = 0;
        let monthSpend = 0;

        approvedSubmissions.forEach((submission) => {
          const receiptDate = new Date(submission.receipt_date);
          if (receiptDate.getFullYear() === year) {
            yearSpend += submission.amount_spent;
            if (receiptDate.getMonth() + 1 === month) {
              monthSpend += submission.amount_spent;
            }
          }
        });

        setCurrentYearSpend(yearSpend);
        setCurrentMonthSpend(monthSpend);
        setYearlyGoal(currentYearlyGoal);
        setMonthlyGoal(currentMonthlyGoal);
        setError(null);
      } catch (err) {
        console.error('Dashboard Supabase read error:', err);
        if (!cancelled) {
          setError('Failed to load dashboard stats from Supabase.');
        }
      }
    }

    void loadSupabaseDashboardData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const yearlyProgressPercent = yearlyGoal ? Math.min(Math.round((currentYearSpend / yearlyGoal.goal_amount) * 100), 100) : 0;
  const monthlyProgressPercent = monthlyGoal ? Math.min(Math.round((currentMonthSpend / monthlyGoal.goal_amount) * 100), 100) : 0;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-3 text-red-400">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <pre className="text-[10px] bg-black/20 p-2 rounded overflow-auto max-h-40">
              {error}
            </pre>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white font-display mb-2">Welcome Bro. {profile?.last_name}</h1>
            <p className="text-slate-400">Track your impact and help move our chapter's Sigma Spend Initiative forward.</p>
          </div>
          <Link to="/submit" className="btn-primary">
            <Plus className="w-5 h-5" />
            Submit Receipt
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <StatCard
            title="Total Approved Spend"
            value={`$${stats.totalSpend.toLocaleString()}`}
            icon={Wallet}
            color="text-emerald-400"
            bg="bg-emerald-400/10"
          />
          <StatCard
            title="Approved Receipts"
            value={stats.receiptCount}
            icon={Receipt}
            color="text-sigma-blue"
            bg="bg-sigma-blue/10"
          />
          <StatCard
            title="Businesses Supported"
            value={stats.businessesCount}
            icon={Store}
            color="text-sigma-gold"
            bg="bg-sigma-gold/10"
          />
          <StatCard
            title="Group Impact"
            value={stats.groupImpact}
            icon={Users}
            color="text-indigo-400"
            bg="bg-indigo-400/10"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Yearly Progress</h3>
                    <p className="text-xs text-slate-400">{new Date().getFullYear()} Goal</p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-sigma-blue" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold text-white">${currentYearSpend.toLocaleString()}</span>
                    <span className="text-slate-500 text-xs">Goal: ${yearlyGoal?.goal_amount.toLocaleString() || '0'}</span>
                  </div>

                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${yearlyProgressPercent}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-sigma-blue to-indigo-500 rounded-full"
                    />
                  </div>

                  <p className="text-[10px] text-slate-400 text-right uppercase font-bold tracking-wider">{yearlyProgressPercent}% achieved</p>
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-white">Monthly Progress</h3>
                    <p className="text-xs text-slate-400">{new Date().toLocaleString('default', { month: 'long' })} Goal</p>
                  </div>
                  <TrendingUp className="w-5 h-5 text-sigma-gold" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <span className="text-2xl font-bold text-white">${currentMonthSpend.toLocaleString()}</span>
                    <span className="text-slate-500 text-xs">Goal: ${monthlyGoal?.goal_amount.toLocaleString() || '0'}</span>
                  </div>

                  <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${monthlyProgressPercent}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-sigma-gold to-amber-500 rounded-full"
                    />
                  </div>

                  <p className="text-[10px] text-slate-400 text-right uppercase font-bold tracking-wider">{monthlyProgressPercent}% achieved</p>
                </div>
              </div>
            </div>

            <div className="glass-card overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Recent Submissions</h3>
                <Link to="/my-submissions" className="text-sigma-blue text-sm font-semibold hover:underline flex items-center gap-1">
                  View All <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              <div className="divide-y divide-white/5">
                {recentSubmissions.length > 0 ? (
                  recentSubmissions.map((sub) => (
                    <div key={sub.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          sub.status === 'approved' ? 'bg-emerald-400/10 text-emerald-400' :
                          sub.status === 'rejected' ? 'bg-red-400/10 text-red-400' :
                          'bg-amber-400/10 text-amber-400'
                        }`}>
                          {sub.status === 'approved' ? <CheckCircle2 className="w-5 h-5" /> :
                           sub.status === 'rejected' ? <XCircle className="w-5 h-5" /> :
                           <Clock className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold text-white">{sub.business_name}</p>
                          <p className="text-xs text-slate-500">{new Date(sub.receipt_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-white">${sub.amount_spent.toLocaleString()}</p>
                        <p className={`text-[10px] uppercase font-bold tracking-wider ${
                          sub.status === 'approved' ? 'text-emerald-400' :
                          sub.status === 'rejected' ? 'text-red-400' :
                          'text-amber-400'
                        }`}>{sub.status}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center">
                    <p className="text-slate-500 italic">No submissions yet. Start by submitting your first receipt!</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-white mb-6">Quick Actions</h3>
              <div className="grid grid-cols-1 gap-4">
                <Link to="/submit" className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5">
                  <div className="w-10 h-10 bg-sigma-blue rounded-lg flex items-center justify-center text-white">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="font-bold">New Submission</span>
                </Link>
                <Link to="/leaderboard" className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/5">
                  <div className="w-10 h-10 bg-sigma-gold rounded-lg flex items-center justify-center text-white">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <span className="font-bold">View Leaderboard</span>
                </Link>
              </div>
            </div>

            <div className="glass-card p-6 bg-gradient-to-br from-sigma-blue/20 to-transparent">
              <h3 className="text-lg font-bold text-white mb-4">Chapter Impact</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Our collective spending power is a tool for economic empowerment. Every receipt submitted helps us measure the impact of the Kappa Upsilon Sigma Chapter.
              </p>
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-500">
                  <span>Chapter Goal Status</span>
                  <span className="text-sigma-blue">On Track</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <div className="glass-card p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg} ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
