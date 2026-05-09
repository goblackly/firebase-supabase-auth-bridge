import React, { useState, useRef, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { syncUserProfileToSupabase } from '../services/supabaseBridge';
import {
  User,
  Mail,
  Phone,
  Camera,
  Save,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';

export default function Profile() {
  const { profile, user } = useAuth();
  const [formData, setFormData] = useState({
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    phone: profile?.phone || '',
  });
  const [photoUrl, setPhotoUrl] = useState(profile?.photo_url || '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFormData({
        firstName: profile.first_name || '',
        lastName: profile.last_name || '',
        phone: profile.phone || '',
      });
      setPhotoUrl(profile.photo_url || '');
    }
  }, [profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        setError('Image is too large. Please choose an image under 500KB.');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
        setSuccess(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const profileRef = doc(db, 'users', profile.uid);
      await updateDoc(profileRef, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        photo_url: photoUrl,
      });

      await syncUserProfileToSupabase({
        uid: profile.uid,
        email: profile.email || user?.email || '',
        first_name: formData.firstName,
        last_name: formData.lastName,
        phone: formData.phone,
        role: profile.role,
        chapter_role: profile.chapter_role,
        crossing_year: profile.crossing_year,
        photo_url: photoUrl,
      });

      setSuccess(true);
    } catch (err: any) {
      console.error('Update profile error:', err);
      setError('Failed to update profile. Please try again.');
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="My Profile">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card overflow-hidden"
        >
          <div className="h-32 bg-gradient-to-r from-sigma-blue to-blue-900 relative">
            <div className="absolute -bottom-16 left-8">
              <div className="relative group">
                <div className="w-32 h-32 rounded-3xl bg-sigma-dark border-4 border-sigma-dark overflow-hidden shadow-2xl">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt="Profile"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sigma-blue bg-sigma-blue/10">
                      <User className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-3xl text-white"
                >
                  <Camera className="w-8 h-8" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*"
                />
              </div>
            </div>
          </div>

          <div className="pt-20 p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div>
                <h2 className="text-2xl font-bold text-white">{profile?.first_name} {profile?.last_name}</h2>
                <p className="text-slate-400 flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4" />
                  {profile?.email}
                </p>
              </div>
              <div className="px-4 py-2 bg-sigma-blue/10 border border-sigma-blue/20 rounded-full text-sigma-blue text-xs font-bold uppercase tracking-widest">
                {profile?.role}
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-8">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-bold">{error}</p>
                </div>
              )}

              {success && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-bold">Profile updated successfully!</p>
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
                      placeholder="(555) 000-0000"
                    />
                  </div>
                </div>

                <div>
                  <label className="label-text">Email Address (Read-only)</label>
                  <div className="relative">
                    <input
                      type="email"
                      disabled
                      value={profile?.email}
                      className="input-field w-full px-4 opacity-50 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary flex items-center gap-2 px-8"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving Changes...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Profile
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
