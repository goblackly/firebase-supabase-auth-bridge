import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  Trophy, 
  Users,
  Settings, 
  LogOut, 
  ShieldCheck, 
  Menu, 
  X,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
  const { profile, isAdmin } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Submit Receipt', path: '/submit', icon: PlusCircle },
    { name: 'My Submissions', path: '/my-submissions', icon: History },
    { name: 'Leaderboard', path: '/leaderboard', icon: Trophy },
    { name: 'Profile', path: '/profile', icon: Settings },
  ];

  const adminItems = [
    { name: 'Admin Dashboard', path: '/admin', icon: ShieldCheck },
    { name: 'Review Submissions', path: '/admin/submissions', icon: History },
    { name: 'Manage Members', path: '/admin/users', icon: Users },
    { name: 'Reports', path: '/admin/reports', icon: Trophy },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-sigma-dark flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-sigma-dark border-r border-white/5 p-6 sticky top-0 h-screen overflow-y-auto">
        <div className="mb-10 px-2">
          <h1 className="text-lg font-bold text-white font-display leading-tight">
            Black Spend <br />
            <span className="text-sigma-blue">Initiative</span>
          </h1>
        </div>

        <nav className="flex-1 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Main Menu</p>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive(item.path) 
                ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
              {isActive(item.path) && <ChevronRight className="w-4 h-4 ml-auto" />}
            </Link>
          ))}

          {isAdmin && (
            <div className="mt-10">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Admin Panel</p>
              {adminItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive(item.path) 
                    ? 'bg-sigma-gold/20 text-sigma-gold border border-sigma-gold/30' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-10 h-10 bg-sigma-blue/20 rounded-full flex items-center justify-center text-sigma-blue font-bold">
              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{profile?.first_name} {profile?.last_name}</p>
              <p className="text-xs text-slate-500 truncate">{profile?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-red-400 hover:bg-red-400/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-sigma-dark border-b border-white/5 p-4 flex items-center justify-between sticky top-0 z-50">
        <h1 className="text-lg font-bold text-white font-display">Black Spend</h1>
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-slate-400 hover:text-white"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-sigma-dark p-6 shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8 shrink-0">
                <h1 className="text-xl font-bold text-white font-display">Menu</h1>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-slate-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto space-y-2 pr-2 -mr-2">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all ${
                      isActive(item.path) 
                      ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                ))}

                {isAdmin && (
                  <div className="mt-8 pt-8 border-t border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 px-2">Admin Panel</p>
                    {adminItems.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-4 rounded-xl transition-all ${
                          isActive(item.path) 
                          ? 'bg-sigma-gold/20 text-sigma-gold border border-sigma-gold/30' 
                          : 'text-slate-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="font-medium">{item.name}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </nav>

              <div className="pt-6 mt-6 border-t border-white/5 shrink-0">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-4 w-full rounded-xl text-red-400 bg-red-400/5 hover:bg-red-400/10 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10 overflow-x-hidden">
        {title && (
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white font-display">{title}</h2>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
