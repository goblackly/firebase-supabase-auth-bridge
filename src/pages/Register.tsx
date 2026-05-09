import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { notificationService } from '../services/notificationService';
import { syncUserProfileToSupabase } from '../services/supabaseBridge';
import { UserPlus, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export default function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const user = userCredential.user;

      const isAdmin = formData.email.toLowerCase() === 'info@goblackly.com';
      const firestoreProfile = {
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        role: isAdmin ? 'admin' : 'member',
        created_at: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', user.uid), firestoreProfile);
      await user.getIdToken(true);

      try {
        await syncUserProfileToSupabase({
          uid: user.uid,
          email: formData.email,
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: formData.phone,
          role: isAdmin ? 'admin' : 'member',
        });
      } catch (syncError) {
        console.warn('Supabase user sync deferred after registration:', syncError);
      }

      await notificationService.notifyAdminNewUser({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email
      });

      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to register. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-sigma-blue/20 via-sigma-dark to-sigma-dark">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sigma-blue rounded-2xl shadow-xl shadow-sigma-blue/20 mb-4">
            <UserPlus className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 font-display">Join the Initiative</h1>
          <p className="text-slate-400">Register to start tracking your impact.</p>
        </div>

        <div className="glass-card p-8">
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label-text">First Name</label>
                <div className="relative">
                  <input
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="input-field w-full px-4"
                    placeholder="Abram"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Last Name</label>
                <div className="relative">
                  <input
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="input-field w-full px-4"
                    placeholder="Taylor"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Email Address</label>
                <div className="relative">
                  <input
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="input-field w-full px-4"
                    placeholder="brother@phibetasigma1914.org"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Phone Number</label>
                <div className="relative">
                  <input
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input-field w-full px-4"
                    placeholder="(202) 726-5434"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="label-text">Password</label>
                <div className="relative">
                  <input
                    name="password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    className="input-field w-full px-4"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Creating Account...' : 'Register'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <Link to="/login" className="text-sigma-blue font-semibold hover:underline">
                Sign in here
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-500 text-xs">
            Developed By{' '}
            <a
              href="https://goblackly.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-sigma-blue transition-colors font-medium"
            >
              GoBlackly OS
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
