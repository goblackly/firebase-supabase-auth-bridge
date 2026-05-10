import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ArrowLeft, Loader2, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    let active = true;

    const initializeRecovery = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (sessionError) {
        setError('We could not validate your recovery link. Please request a new one.');
        setReady(false);
        return;
      }

      const authUser = data.session?.user;
      if (!authUser) {
        setError('This reset link is invalid or has expired. Please request a new one.');
        setReady(false);
        return;
      }

      setEmail(authUser.email ?? '');
      setReady(true);
    };

    void initializeRecovery();

    return () => {
      active = false;
    };
  }, []);

  const passwordsMatch = useMemo(
    () => password.length > 0 && confirmPassword.length > 0 && password === confirmPassword,
    [password, confirmPassword]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!ready) {
      setError('This reset link is not ready. Please request a new one.');
      return;
    }

    if (password.length < 8) {
      setError('Please choose a password with at least 8 characters.');
      return;
    }

    if (!passwordsMatch) {
      setError('Your passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 1800);
    } catch (err: any) {
      setError(err.message || 'Failed to update your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-sigma-blue/20 via-sigma-dark to-sigma-dark">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-sigma-blue rounded-3xl shadow-2xl shadow-sigma-blue/20 mb-6">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 font-display">Set Your Password</h1>
          <p className="text-slate-400">
            {email ? `Choose a new password for ${email}.` : 'Choose a new password to finish signing in.'}
          </p>
        </div>

        <div className="glass-card p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 text-red-400 text-sm mb-6">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 p-4 rounded-xl flex items-start gap-3 text-emerald-400 text-sm mb-6">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p>Your password has been updated. Redirecting you to sign in...</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="label-text">New Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full px-4"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="label-text">Confirm Password</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field w-full px-4"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success || !ready}
              className="btn-primary w-full"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating Password...
                </span>
              ) : 'Save Password'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <Link to="/login" className="text-slate-400 text-sm hover:text-white flex items-center justify-center gap-2 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Sign In
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
