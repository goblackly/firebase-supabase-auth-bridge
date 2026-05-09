import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Download, Calendar, BarChart3, PieChart as PieChartIcon, AlertCircle } from 'lucide-react';
import { Submission } from '../types';
import { fetchApprovedSubmissions } from '../services/supabaseReads';

const COLORS = ['#002366', '#D4AF37', '#10b981', '#6366f1', '#f59e0b', '#ef4444'];

export default function AdminReports() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);

      try {
        const approvedSubmissions = await fetchApprovedSubmissions();

        if (!cancelled) {
          setSubmissions(approvedSubmissions);
          setError(null);
        }
      } catch (err) {
        console.error('AdminReports Supabase read error:', err);
        if (!cancelled) {
          setError('Failed to load approved submissions from Supabase.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryData = Object.entries(
    submissions.reduce((acc: Record<string, number>, sub) => {
      acc[sub.category] = (acc[sub.category] || 0) + sub.amount_spent;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const monthlyDataMap = submissions.reduce((acc: Record<string, number>, sub) => {
    if (!sub.receipt_date) return acc;
    const [year, month] = sub.receipt_date.split('-').map(Number);
    const key = `${year}-${month.toString().padStart(2, '0')}`;
    acc[key] = (acc[key] || 0) + sub.amount_spent;
    return acc;
  }, {});

  const monthlyData = Object.entries(monthlyDataMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => {
      const [year, month] = key.split('-').map(Number);
      return {
        name: `${monthNames[month - 1]} ${year}`,
        value,
        key,
      };
    });

  const memberData = Object.entries(
    submissions.reduce((acc: Record<string, number>, sub) => {
      const memberName = sub.user_name || 'Unknown';
      acc[memberName] = (acc[memberName] || 0) + sub.amount_spent;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));

  const exportToCSV = () => {
    const headers = ['Date', 'Member', 'Business', 'Amount', 'Category', 'Sigma-Owned', 'City', 'State'];
    const rows = submissions.map((sub) => [
      sub.receipt_date,
      sub.user_name,
      sub.business_name,
      sub.amount_spent,
      sub.category,
      sub.black_owned_status,
      sub.city,
      sub.state,
    ]);

    const csvContent = [headers, ...rows].map((entry) => entry.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `sigma_spend_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Layout title="Chapter Reports">
      <div className="max-w-7xl mx-auto space-y-10">
        <div className="flex justify-end">
          <button onClick={exportToCSV} className="btn-primary" disabled={loading || submissions.length === 0}>
            <Download className="w-5 h-5" />
            Export CSV Report
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sigma-blue"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-8">
                <PieChartIcon className="w-6 h-6 text-sigma-blue" />
                <h3 className="text-xl font-bold text-white">Spend by Category</h3>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
                {categoryData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-xs text-slate-400 truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card p-8">
              <div className="flex items-center gap-3 mb-8">
                <Calendar className="w-6 h-6 text-sigma-blue" />
                <h3 className="text-xl font-bold text-white">Monthly Spending Trend</h3>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      cursor={{ fill: '#ffffff05' }}
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Bar dataKey="value" fill="#002366" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-2 glass-card overflow-hidden">
              <div className="p-8 border-b border-white/5">
                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                  <BarChart3 className="w-6 h-6 text-sigma-blue" />
                  Monthly Spend Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Month</th>
                      <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Total Spend</th>
                      <th className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Receipts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...monthlyData].reverse().map((item) => {
                      const receiptCount = submissions.filter((sub) => {
                        const [year, month] = sub.receipt_date.split('-').map(Number);
                        return `${year}-${month.toString().padStart(2, '0')}` === item.key;
                      }).length;

                      return (
                        <tr key={item.key} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-4 font-bold text-white">{item.name}</td>
                          <td className="px-8 py-4 text-right font-bold text-emerald-400">${item.value.toLocaleString()}</td>
                          <td className="px-8 py-4 text-right text-slate-400">{receiptCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-2 glass-card p-8">
              <div className="flex items-center gap-3 mb-8">
                <BarChart3 className="w-6 h-6 text-sigma-blue" />
                <h3 className="text-xl font-bold text-white">Top 10 Spenders</h3>
              </div>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={memberData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                    <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={120} />
                    <Tooltip
                      cursor={{ fill: '#ffffff05' }}
                      contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: number) => `$${value.toLocaleString()}`}
                    />
                    <Bar dataKey="value" fill="#D4AF37" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
