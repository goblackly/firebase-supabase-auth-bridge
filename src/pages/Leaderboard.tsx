import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import {
  Trophy,
  Medal,
  TrendingUp,
  Users,
  Receipt,
  Crown
} from 'lucide-react';
import { motion } from 'motion/react';
import { Submission } from '../types';
import { fetchApprovedSubmissions } from '../services/supabaseReads';

interface LeaderboardEntry {
  userId: string;
  userName: string;
  totalSpend: number;
  receiptCount: number;
  groupImpact: number;
  businessesCount: number;
  impactScore: number;
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<keyof LeaderboardEntry>('totalSpend');

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      setLoading(true);

      try {
        const submissions = await fetchApprovedSubmissions();
        const userMap: Record<string, LeaderboardEntry & { businesses: Set<string> }> = {};

        submissions.forEach((data: Submission) => {
          if (!userMap[data.user_id]) {
            userMap[data.user_id] = {
              userId: data.user_id,
              userName: data.user_name || 'Unknown Brother',
              totalSpend: 0,
              receiptCount: 0,
              groupImpact: 0,
              businessesCount: 0,
              impactScore: 0,
              businesses: new Set<string>(),
            };
          }

          const entry = userMap[data.user_id];
          entry.totalSpend += data.amount_spent;
          entry.receiptCount += 1;
          entry.groupImpact += data.sigma_members_attended;
          entry.businesses.add(data.business_name.trim().toLowerCase());
          entry.businessesCount = entry.businesses.size;
          entry.impactScore += data.amount_spent + (data.sigma_members_attended * 10) + (data.black_owned_status === 'yes' ? 50 : 0);
        });

        const nextEntries = Object.values(userMap).map(({ businesses, ...entry }) => entry);

        if (!cancelled) {
          setEntries(nextEntries);
        }
      } catch (error) {
        console.error('Failed to load Supabase leaderboard:', error);
        if (!cancelled) {
          setEntries([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedEntries = [...entries].sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];
    if (typeof valA === 'number' && typeof valB === 'number') {
      return valB - valA;
    }
    return 0;
  });

  const topThree = sortedEntries.slice(0, 3);
  const others = sortedEntries.slice(3);

  return (
    <Layout title="Chapter Leaderboard">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-3 mb-10 bg-white/5 p-2 rounded-2xl border border-white/10">
          <SortButton active={sortBy === 'totalSpend'} onClick={() => setSortBy('totalSpend')} icon={TrendingUp}>Total Spend</SortButton>
          <SortButton active={sortBy === 'receiptCount'} onClick={() => setSortBy('receiptCount')} icon={Receipt}>Receipts</SortButton>
          <SortButton active={sortBy === 'groupImpact'} onClick={() => setSortBy('groupImpact')} icon={Users}>Group Impact</SortButton>
          <SortButton active={sortBy === 'impactScore'} onClick={() => setSortBy('impactScore')} icon={Crown}>Impact Score</SortButton>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-sigma-blue"></div>
          </div>
        ) : sortedEntries.length > 0 ? (
          <div className="space-y-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              {topThree[1] && (
                <PodiumCard entry={topThree[1]} rank={2} color="text-slate-300" bg="bg-slate-300/10" height="h-48" sortBy={sortBy} />
              )}
              {topThree[0] && (
                <PodiumCard entry={topThree[0]} rank={1} color="text-sigma-gold" bg="bg-sigma-gold/10" height="h-64" isMain sortBy={sortBy} />
              )}
              {topThree[2] && (
                <PodiumCard entry={topThree[2]} rank={3} color="text-amber-700" bg="bg-amber-700/10" height="h-40" sortBy={sortBy} />
              )}
            </div>

            <div className="glass-card overflow-hidden">
              <div className="divide-y divide-white/5">
                {others.map((entry, index) => (
                  <div key={entry.userId} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-6">
                      <span className="text-lg font-bold text-slate-500 w-6">{index + 4}</span>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white font-bold">
                          {entry.userName[0]}
                        </div>
                        <div>
                          <p className="font-bold text-white">{entry.userName}</p>
                          <p className="text-xs text-slate-500">{entry.receiptCount} receipts submitted</p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xl font-bold text-white">
                        {sortBy === 'totalSpend' ? `$${entry.totalSpend.toLocaleString()}` :
                         sortBy === 'impactScore' ? Math.round(entry.impactScore).toLocaleString() :
                         entry[sortBy]}
                      </p>
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                        {sortBy === 'totalSpend' ? 'Total Spend' :
                         sortBy === 'impactScore' ? 'Impact Score' :
                         sortBy.replace(/([A-Z])/g, ' $1')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card p-20 text-center">
            <Trophy className="w-16 h-16 text-slate-700 mx-auto mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Leaderboard is empty</h3>
            <p className="text-slate-500">Approved submissions will appear here.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

function SortButton({ children, active, onClick, icon: Icon }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
        active
        ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20'
        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

function PodiumCard({ entry, rank, color, bg, height, isMain, sortBy }: any) {
  const displayValue = () => {
    if (sortBy === 'totalSpend') return `$${entry.totalSpend.toLocaleString()}`;
    if (sortBy === 'impactScore') return Math.round(entry.impactScore).toLocaleString();
    return entry[sortBy].toLocaleString();
  };

  const displayLabel = () => {
    if (sortBy === 'totalSpend') return 'Total Spend';
    if (sortBy === 'impactScore') return 'Impact Score';
    return sortBy.replace(/([A-Z])/g, ' $1').replace(/^./, (str: string) => str.toUpperCase());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center ${isMain ? 'order-first md:order-none' : ''}`}
    >
      <div className="relative mb-4">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold border-4 border-white/10 ${bg} ${color}`}>
          {entry.userName[0]}
        </div>
        <div className={`absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${bg} ${color}`}>
          {rank === 1 ? <Crown className="w-5 h-5" /> : <Medal className="w-5 h-5" />}
        </div>
      </div>

      <div className="text-center mb-6">
        <p className="font-bold text-white text-lg">{entry.userName}</p>
        <p className={`text-sm font-bold ${color}`}>Rank #{rank}</p>
      </div>

      <div className={`w-full glass-card ${height} flex flex-col items-center justify-center p-6 bg-gradient-to-t from-white/5 to-transparent`}>
        <p className="text-2xl font-bold text-white mb-1">
          {displayValue()}
        </p>
        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{displayLabel()}</p>

        <div className="mt-4 pt-4 border-t border-white/5 w-full flex justify-around">
          <div className="text-center">
            <p className="text-xs font-bold text-white">{entry.receiptCount}</p>
            <p className="text-[8px] uppercase text-slate-500">Receipts</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-bold text-white">{entry.groupImpact}</p>
            <p className="text-[8px] uppercase text-slate-500">Impact</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
