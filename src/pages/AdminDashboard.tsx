import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  Wallet,
  Receipt,
  Users,
  TrendingUp,
  Edit3,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  BarChart3,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Submission, YearlyGoal, MonthlyGoal } from '../types';
import { fetchAllSubmissions, fetchMonthlyGoal, fetchUserCount, fetchYearlyGoal } from '../services/supabaseReads';
import { updateGoalInSupabase, upsertGoalInSupabase } from '../services/supabaseBridge';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    approvedSpend: 0,
    pendingSpend: 0,
    approvedCount: 0,
    pendingCount: 0,
    memberCount: 0,
    businessCount: 0,
    currentMonthSpend: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearlyGoal, setYearlyGoal] = useState<YearlyGoal | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<MonthlyGoal | null>(null);
  const [isEditingYearlyGoal, setIsEditingYearlyGoal] = useState(false);
  const [isEditingMonthlyGoal, setIsEditingMonthlyGoal] = useState(false);
  const [newYearlyGoalAmount, setNewYearlyGoalAmount] = useState('');
  const [newMonthlyGoalAmount, setNewMonthlyGoalAmount] = useState('');
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadAdminStats() {
      setLoading(true);

      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const [submissions, memberCount, currentYearlyGoal, currentMonthlyGoal] = await Promise.all([
          fetchAllSubmissions(),
          fetchUserCount(),
          fetchYearlyGoal(year),
          fetchMonthlyGoal(year, month),
        ]);

        if (cancelled) {
          return;
        }

        let approvedTotal = 0;
        let pendingTotal = 0;
        let approvedCount = 0;
        let pendingCount = 0;
        let monthSpend = 0;
        const businesses = new Set<string>();
        const currentMonth = month;
        const currentYear = year;

        submissions.forEach((data: Submission) => {
          const receiptDate = data.receipt_date;

          if (data.status === 'approved') {
            approvedTotal += data.amount_spent;
            approvedCount += 1;
            businesses.add(data.business_name.trim().toLowerCase());

            if (receiptDate) {
              const [rYear, rMonth] = receiptDate.split('-').map(Number);
              if (rMonth === currentMonth && rYear === currentYear) {
                monthSpend += data.amount_spent;
              }
            }
          } else if (data.status === 'pending') {
            pendingTotal += data.amount_spent;
            pendingCount += 1;
          }
        });

        setStats({
          approvedSpend: approvedTotal,
          pendingSpend: pendingTotal,
          approvedCount,
          pendingCount,
          memberCount,
          businessCount: businesses.size,
          currentMonthSpend: monthSpend,
        });

        const activities = submissions.slice(0, 5).map((data) => {
          let title = 'Submission Update';
          let desc = '';

          if (data.status === 'pending') {
            title = 'New Submission';
            desc = `${data.user_name} submitted $${data.amount_spent.toLocaleString()} at ${data.business_name}`;
          } else if (data.status === 'approved') {
            title = 'Receipt Approved';
            desc = `Approved $${data.amount_spent.toLocaleString()} from ${data.user_name}`;
          } else if (data.status === 'rejected') {
            title = 'Receipt Rejected';
            desc = `Rejected $${data.amount_spent.toLocaleString()} from ${data.user_name}`;
          }

          return {
            id: data.id,
            title,
            desc,
            time: new Date(data.updated_at || data.created_at),
          };
        });

        setRecentActivity(activities);
        setYearlyGoal(currentYearlyGoal);
        setNewYearlyGoalAmount(currentYearlyGoal?.goal_amount?.toString() || '');
        setMonthlyGoal(currentMonthlyGoal);
        setNewMonthlyGoalAmount(currentMonthlyGoal?.goal_amount?.toString() || '');
        setError(null);
      } catch (err) {
        console.error('AdminDashboard Supabase read error:', err);
        if (!cancelled) {
          setError('Failed to load admin dashboard data from Supabase.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAdminStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleDateString();
  };

  const handleUpdateYearlyGoal = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const amount = parseFloat(newYearlyGoalAmount);
    if (isNaN(amount)) return;

    try {
      const data = yearlyGoal
        ? await updateGoalInSupabase('yearly_goals', { goal_amount: amount }, { id: yearlyGoal.id })
        : await upsertGoalInSupabase('yearly_goals', { year, goal_amount: amount }, 'year');

      setYearlyGoal(data as YearlyGoal);
      setIsEditingYearlyGoal(false);
    } catch (err) {
      console.error('Error updating yearly goal:', err);
    }
  };

  const handleUpdateMonthlyGoal = async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const amount = parseFloat(newMonthlyGoalAmount);
    if (isNaN(amount)) return;

    try {
      const monthlyGoalPayload = { year, month, goal_amount: amount };
      const data = monthlyGoal
        ? await updateGoalInSupabase('monthly_goals', monthlyGoalPayload, { id: monthlyGoal.id })
        : await upsertGoalInSupabase('monthly_goals', monthlyGoalPayload, 'year,month');

      setMonthlyGoal(data as MonthlyGoal);
      setIsEditingMonthlyGoal(false);
    } catch (err) {
      console.error('Error updating monthly goal:', err);
    }
  };

  return (
    <Layout title="Admin Dashboard">
      <div className="max-w-7xl mx-auto">
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-3 text-red-400">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <pre className="text-[10px] bg-black/20 p-2 rounded overflow-auto max-h-40">{error}</pre>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          <AdminStatCard
            title="Total Approved Spend"
            value={`$${stats.approvedSpend.toLocaleString()}`}
            icon={Wallet}
            color="text-emerald-400"
            bg="bg-emerald-400/10"
            subtitle={`${stats.approvedCount} approved receipts`}
          />
          <AdminStatCard
            title="Pending Spend"
            value={`$${stats.pendingSpend.toLocaleString()}`}
            icon={TrendingUp}
            color="text-amber-400"
            bg="bg-amber-400/10"
            subtitle={`${stats.pendingCount} receipts awaiting review`}
          />
          <AdminStatCard
            title="Active Members"
            value={stats.memberCount}
            icon={Users}
            color="text-sigma-blue"
            bg="bg-sigma-blue/10"
            subtitle={`${stats.businessCount} businesses supported`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white">Yearly Goal Management</h3>
                  <p className="text-sm text-slate-400">Set and track the chapter's yearly spending target.</p>
                </div>
                {!isEditingYearlyGoal ? (
                  <button onClick={() => setIsEditingYearlyGoal(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all">
                    <Edit3 className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditingYearlyGoal(false)} className="px-3 py-1 text-xs font-bold text-slate-500 hover:text-white">Cancel</button>
                    <button onClick={handleUpdateYearlyGoal} className="px-3 py-1 text-xs font-bold text-sigma-blue hover:text-blue-400">Save</button>
                  </div>
                )}
              </div>

              <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="96" cy="96" r="88" className="stroke-white/5 fill-none" strokeWidth="12" />
                    <motion.circle
                      cx="96"
                      cy="96"
                      r="88"
                      className="stroke-sigma-blue fill-none"
                      strokeWidth="12"
                      strokeDasharray={552}
                      initial={{ strokeDashoffset: 552 }}
                      animate={{ strokeDashoffset: 552 - (552 * Math.min(stats.approvedSpend / (yearlyGoal?.goal_amount || 1), 1)) }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-bold text-white">
                      {yearlyGoal ? Math.round((stats.approvedSpend / yearlyGoal.goal_amount) * 100) : 0}%
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Progress</span>
                  </div>
                </div>

                <div className="flex-1 space-y-6 w-full">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total Spend</p>
                      <p className="text-xl font-bold text-white">${stats.approvedSpend.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Yearly Goal</p>
                      {isEditingYearlyGoal ? (
                        <input
                          type="number"
                          value={newYearlyGoalAmount}
                          onChange={(e) => setNewYearlyGoalAmount(e.target.value)}
                          className="bg-transparent border-b border-sigma-blue text-xl font-bold text-white w-full focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <p className="text-xl font-bold text-white">${yearlyGoal?.goal_amount.toLocaleString() || '0'}</p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-sigma-blue/10 border border-sigma-blue/20 rounded-2xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-sigma-blue shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300">
                      {stats.approvedSpend >= (yearlyGoal?.goal_amount || 0)
                        ? "Congratulations! The chapter has exceeded this year's spending goal."
                        : `The chapter needs $${Math.max(0, (yearlyGoal?.goal_amount || 0) - stats.approvedSpend).toLocaleString()} more to reach the yearly goal.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-white">Monthly Goal Management</h3>
                  <p className="text-sm text-slate-400">Set and track the chapter's monthly spending target.</p>
                </div>
                {!isEditingMonthlyGoal ? (
                  <button onClick={() => setIsEditingMonthlyGoal(true)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all">
                    <Edit3 className="w-5 h-5" />
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setIsEditingMonthlyGoal(false)} className="px-3 py-1 text-xs font-bold text-slate-500 hover:text-white">Cancel</button>
                    <button onClick={handleUpdateMonthlyGoal} className="px-3 py-1 text-xs font-bold text-sigma-blue hover:text-blue-400">Save</button>
                  </div>
                )}
              </div>

              <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="relative w-48 h-48 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="96" cy="96" r="88" className="stroke-white/5 fill-none" strokeWidth="12" />
                    <motion.circle
                      cx="96"
                      cy="96"
                      r="88"
                      className="stroke-sigma-gold fill-none"
                      strokeWidth="12"
                      strokeDasharray={552}
                      initial={{ strokeDashoffset: 552 }}
                      animate={{ strokeDashoffset: 552 - (552 * Math.min(stats.currentMonthSpend / (monthlyGoal?.goal_amount || 1), 1)) }}
                      transition={{ duration: 1.5, ease: 'easeOut' }}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-bold text-white">
                      {monthlyGoal ? Math.round((stats.currentMonthSpend / monthlyGoal.goal_amount) * 100) : 0}%
                    </span>
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">Progress</span>
                  </div>
                </div>

                <div className="flex-1 space-y-6 w-full">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Month Spend</p>
                      <p className="text-xl font-bold text-white">${stats.currentMonthSpend.toLocaleString()}</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Monthly Goal</p>
                      {isEditingMonthlyGoal ? (
                        <input
                          type="number"
                          value={newMonthlyGoalAmount}
                          onChange={(e) => setNewMonthlyGoalAmount(e.target.value)}
                          className="bg-transparent border-b border-sigma-gold text-xl font-bold text-white w-full focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <p className="text-xl font-bold text-white">${monthlyGoal?.goal_amount.toLocaleString() || '0'}</p>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-sigma-gold/10 border border-sigma-gold/20 rounded-2xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-sigma-gold shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-300">
                      {stats.currentMonthSpend >= (monthlyGoal?.goal_amount || 0)
                        ? "Congratulations! The chapter has exceeded this month's spending goal."
                        : `The chapter needs $${Math.max(0, (monthlyGoal?.goal_amount || 0) - stats.currentMonthSpend).toLocaleString()} more to reach the monthly goal.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AdminLinkCard
                title="Review Submissions"
                description="Review and approve pending receipts."
                icon={Receipt}
                to="/admin/submissions"
                count={stats.pendingCount}
                badgeColor="bg-amber-500"
              />
              <AdminLinkCard
                title="Manage Members"
                description="View and manage chapter member profiles."
                icon={Users}
                to="/admin/users"
              />
              <AdminLinkCard
                title="Chapter Reports"
                description="View detailed spending analytics."
                icon={BarChart3}
                to="/admin/reports"
              />
            </div>
          </div>

          <div className="space-y-8">
            <div className="glass-card p-6">
              <h3 className="text-lg font-bold text-white mb-6">Recent Activity</h3>
              <div className="space-y-6">
                {recentActivity.length > 0 ? (
                  recentActivity.map((activity) => (
                    <ActivityItem key={activity.id} title={activity.title} desc={activity.desc} time={formatTime(activity.time)} />
                  ))
                ) : (
                  <p className="text-sm text-slate-500 italic">No recent activity found.</p>
                )}
              </div>
              <Link to="/admin/submissions" className="block w-full mt-6 py-3 text-sm font-bold text-slate-500 hover:text-white text-center transition-all border-t border-white/5">
                View All Submissions
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function AdminStatCard({ title, value, icon: Icon, color, bg, subtitle }: any) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${bg} ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function AdminLinkCard({ title, description, icon: Icon, to, count, badgeColor }: any) {
  return (
    <a href={to} className="glass-card p-6 hover:bg-white/10 transition-all group relative overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-sigma-blue/10 rounded-2xl flex items-center justify-center text-sigma-blue group-hover:scale-110 transition-transform">
          <Icon className="w-6 h-6" />
        </div>
        {count !== undefined && count > 0 && (
          <span className={`px-2 py-1 rounded-full text-[10px] font-bold text-white ${badgeColor}`}>
            {count} Pending
          </span>
        )}
      </div>
      <h4 className="text-lg font-bold text-white mb-1">{title}</h4>
      <p className="text-sm text-slate-500 mb-4">{description}</p>
      <div className="flex items-center gap-1 text-sigma-blue text-sm font-bold">
        Go to page <ArrowRight className="w-4 h-4" />
      </div>
    </a>
  );
}

function ActivityItem({ title, desc, time }: any) {
  return (
    <div className="flex gap-4">
      <div className="w-2 h-2 rounded-full bg-sigma-blue mt-2 shrink-0" />
      <div>
        <p className="text-sm font-bold text-white">{title}</p>
        <p className="text-xs text-slate-500 mb-1">{desc}</p>
        <p className="text-[10px] text-slate-600 uppercase font-bold">{time}</p>
      </div>
    </div>
  );
}
