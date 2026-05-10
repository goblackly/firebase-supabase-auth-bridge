import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../firebase';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const actionCode = searchParams.get('oobCode') ?? '';
  const mode = searchParams.get('mode') ?? '';

  useEffect(() => {
    let cancelled = false;

    async function validateResetLink() {
      if (!actionCode || (mode && mode !== 'resetPassword')) {
        if (!cancelled) {
          setError('This password reset link is invalid or incomplete.');
          setVerifying(false);
        }
        return;
      }

      try {
        const accountEmail = await verifyPasswordResetCode(auth, actionCode);
        if (!cancelled) {
          setEmail(accountEmail);
          setError('');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'This password reset link is invalid or has expired.');
        }
      } finally {
        if (!cancelled) {
          setVerifying(false);
        }
      }
    }

    void validateResetLink();

    return () => {
      cancelled = true;
    };
  }, [actionCode, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!actionCode) {
      setError('This password reset link is invalid.');
      return;
    }

    if (password.length < 8) {
      setError('Please choose a password with at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await confirmPasswordReset(auth, actionCode, password);
      setMessage('Your password has been updated. You can sign in now.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset your password. Please request a new link.');
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
            <LockIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 font-display">Choose New Password</h1>
          <p className="text-slate-400">Set a new password for your Black Spend account.</p>
        </div>

        <div className="glass-card p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 text-red-400 text-sm mb-6">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {message && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 p-4 rounded-xl flex items-start gap-3 text-emerald-400 text-sm mb-6">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p>{message}</p>
            </div>
          )}

          {verifying ? (
            <div className="py-10 flex items-center justify-center gap-3 text-slate-300">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking your reset link...</span>
            </div>
          ) : message ? (
            <div className="space-y-6">
              <Link to="/login" className="btn-primary w-full inline-flex items-center justify-center">
                Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="label-text">Account Email</label>
                <div className="input-field w-full px-4 text-slate-300 flex items-center min-h-12">
                  {email || 'Unable to verify email'}
                </div>
              </div>

              <div>
                <label className="label-text">New Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  className="input-field w-full px-4"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="label-text">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  className="input-field w-full px-4"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="btn-primary w-full"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </span>
                ) : 'Update Password'}
              </button>
            </form>
          )}

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

function LockIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
