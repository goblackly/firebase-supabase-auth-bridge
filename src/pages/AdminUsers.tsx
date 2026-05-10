import React, { useEffect, useState } from 'react';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, handleFirestoreError, OperationType, firebaseAppConfig } from '../firebase';
import Layout from '../components/Layout';
import { syncUserProfileToSupabase } from '../services/supabaseBridge';
import { fetchAllUsers } from '../services/supabaseReads';
import { notificationService } from '../services/notificationService';
import {
  Users,
  Mail,
  Phone,
  Shield,
  User,
  CheckCircle2,
  XCircle,
  UserPlus,
  X,
  Loader2,
  Plus,
  AlertCircle,
  Edit2,
  Key,
  Save
} from 'lucide-react';
import { UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addFormData, setAddFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    role: 'member' as 'member' | 'admin'
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editFormData, setEditFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    role: 'member' as 'member' | 'admin'
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);

    try {
      const usersData = await fetchAllUsers();
      setUsers(usersData);
    } catch (snapshotError: any) {
      console.error('AdminUsers fetchAllUsers error:', snapshotError);
      setError('Failed to load members. Please verify admin permissions.');
      handleFirestoreError(snapshotError, OperationType.LIST, 'users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleRoleUpdate = async (uid: string, newRole: 'admin' | 'member') => {
    const targetUser = users.find((candidate) => candidate.uid === uid);
    if (!targetUser) {
      return;
    }

    try {
      await updateDoc(doc(db, 'users', uid), {
        role: newRole
      });

      await syncUserProfileToSupabase({
        uid,
        email: targetUser.email,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        phone: targetUser.phone,
        role: newRole,
        chapter_role: targetUser.chapter_role,
        crossing_year: targetUser.crossing_year,
        photo_url: targetUser.photo_url,
      });

      await loadUsers();
    } catch (err) {
      console.error('Error updating role:', err);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    setAddError(null);

    try {
      const secondaryApp = initializeApp(firebaseAppConfig, 'SecondaryApp');
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        addFormData.email,
        addFormData.password
      );

      const newUser = userCredential.user;

      await setDoc(doc(db, 'users', newUser.uid), {
        first_name: addFormData.firstName,
        last_name: addFormData.lastName,
        email: addFormData.email,
        phone: addFormData.phone,
        role: addFormData.role,
        created_at: serverTimestamp(),
      });

      await syncUserProfileToSupabase({
        uid: newUser.uid,
        email: addFormData.email,
        first_name: addFormData.firstName,
        last_name: addFormData.lastName,
        phone: addFormData.phone,
        role: addFormData.role,
      });

      await deleteApp(secondaryApp);

      setIsAddModalOpen(false);
      setAddFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        role: 'member'
      });

      await loadUsers();
    } catch (err: any) {
      console.error('Error adding user:', err);
      setAddError(err.message || 'Failed to add user.');
    } finally {
      setIsAdding(false);
    }
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setEditFormData({
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone || '',
      role: user.role
    });
    setEditError(null);
    setEditSuccess(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsUpdating(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        first_name: editFormData.firstName,
        last_name: editFormData.lastName,
        phone: editFormData.phone,
        role: editFormData.role
      });

      await syncUserProfileToSupabase({
        uid: editingUser.uid,
        email: editingUser.email,
        first_name: editFormData.firstName,
        last_name: editFormData.lastName,
        phone: editFormData.phone,
        role: editFormData.role,
        chapter_role: editingUser.chapter_role,
        crossing_year: editingUser.crossing_year,
        photo_url: editingUser.photo_url,
      });

      setEditSuccess('User profile updated successfully.');
      await loadUsers();
      setTimeout(() => setIsEditModalOpen(false), 1500);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setEditError('Failed to update user profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!editingUser) return;

    setIsResettingPassword(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      await notificationService.requestPasswordResetEmail(editingUser.email);
      setEditSuccess(`Password reset email sent to ${editingUser.email}`);
    } catch (err: any) {
      console.error('Error resetting password:', err);
      setEditError('Failed to send password reset email.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesRole && matchesSearch;
  });

  return (
    <Layout title="Manage Members">
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

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setFilterRole('all')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterRole === 'all' ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20' : 'text-slate-400 hover:text-white'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterRole('admin')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterRole === 'admin' ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20' : 'text-slate-400 hover:text-white'}`}
              >
                Admins
              </button>
              <button
                onClick={() => setFilterRole('member')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${filterRole === 'member' ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20' : 'text-slate-400 hover:text-white'}`}
              >
                Members
              </button>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-primary flex items-center gap-2 py-2.5"
            >
              <Plus className="w-4 h-4" />
              Add Member
            </button>
          </div>

          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field w-full px-4"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredUsers.map((u) => (
              <motion.div
                key={u.uid}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-card group hover:border-sigma-blue/30 transition-all duration-300"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-sigma-blue/10 rounded-2xl flex items-center justify-center text-sigma-blue shrink-0 group-hover:scale-110 transition-transform duration-300">
                        <User className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white line-clamp-1">{u.first_name} {u.last_name}</h3>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border mt-1 ${
                          u.role === 'admin'
                            ? 'bg-sigma-gold/10 text-sigma-gold border-sigma-gold/20'
                            : 'bg-white/5 text-slate-400 border-white/5'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(u)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-sigma-blue/10 text-slate-400 hover:text-sigma-blue transition-all border border-white/5"
                        title="Edit User"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {u.role === 'admin' ? (
                        <button
                          onClick={() => handleRoleUpdate(u.uid, 'member')}
                          className="p-2 rounded-lg bg-white/5 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all border border-white/5"
                          title="Demote to Member"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRoleUpdate(u.uid, 'admin')}
                          className="p-2 rounded-lg bg-white/5 hover:bg-sigma-gold/10 text-slate-400 hover:text-sigma-gold transition-all border border-white/5"
                          title="Promote to Admin"
                        >
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Mail className="w-3.5 h-3.5 text-slate-600" />
                      <span className="truncate">{u.email}</span>
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Phone className="w-3.5 h-3.5 text-slate-600" />
                        <span>{u.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-slate-600 uppercase tracking-widest pt-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>UID: {u.uid.slice(0, 12)}...</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {!loading && filteredUsers.length === 0 && (
          <div className="glass-card p-20 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-slate-600" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No members found</h3>
            <p className="text-slate-500">Try adjusting your search or filter.</p>
          </div>
        )}

        <AnimatePresence>
          {isAddModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setIsAddModalOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-sigma-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Add New Member</h3>
                  <button onClick={() => setIsAddModalOpen(false)} className="p-2 text-slate-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleAddUser} className="p-8 space-y-6">
                  {addError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{addError}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-text">First Name</label>
                      <input
                        required
                        type="text"
                        value={addFormData.firstName}
                        onChange={(e) => setAddFormData({ ...addFormData, firstName: e.target.value })}
                        className="input-field w-full px-4"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label className="label-text">Last Name</label>
                      <input
                        required
                        type="text"
                        value={addFormData.lastName}
                        onChange={(e) => setAddFormData({ ...addFormData, lastName: e.target.value })}
                        className="input-field w-full px-4"
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label-text">Email Address</label>
                    <input
                      required
                      type="email"
                      value={addFormData.email}
                      onChange={(e) => setAddFormData({ ...addFormData, email: e.target.value })}
                      className="input-field w-full px-4"
                      placeholder="brother@example.com"
                    />
                  </div>

                  <div>
                    <label className="label-text">Phone Number</label>
                    <input
                      type="tel"
                      value={addFormData.phone}
                      onChange={(e) => setAddFormData({ ...addFormData, phone: e.target.value })}
                      className="input-field w-full px-4"
                      placeholder="(555) 000-0000"
                    />
                  </div>

                  <div>
                    <label className="label-text">Initial Password</label>
                    <input
                      required
                      type="password"
                      value={addFormData.password}
                      onChange={(e) => setAddFormData({ ...addFormData, password: e.target.value })}
                      className="input-field w-full px-4"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="label-text">Role</label>
                    <select
                      value={addFormData.role}
                      onChange={(e) => setAddFormData({ ...addFormData, role: e.target.value as 'member' | 'admin' })}
                      className="input-field w-full px-4"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isAdding}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {isAdding ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5" />
                        Create Member Account
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isEditModalOpen && editingUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={() => setIsEditModalOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-lg bg-sigma-dark border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Edit Member</h3>
                  <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleUpdateUser} className="p-8 space-y-6">
                  {editError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{editError}</p>
                    </div>
                  )}

                  {editSuccess && (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400 text-sm">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <p>{editSuccess}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label-text">First Name</label>
                      <input
                        required
                        type="text"
                        value={editFormData.firstName}
                        onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                        className="input-field w-full px-4"
                      />
                    </div>
                    <div>
                      <label className="label-text">Last Name</label>
                      <input
                        required
                        type="text"
                        value={editFormData.lastName}
                        onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                        className="input-field w-full px-4"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label-text">Email Address (Read-only)</label>
                    <input
                      type="email"
                      disabled
                      value={editingUser.email}
                      className="input-field w-full px-4 opacity-50 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="label-text">Phone Number</label>
                    <input
                      type="tel"
                      value={editFormData.phone}
                      onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                      className="input-field w-full px-4"
                    />
                  </div>

                  <div>
                    <label className="label-text">Role</label>
                    <select
                      value={editFormData.role}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as 'member' | 'admin' })}
                      className="input-field w-full px-4"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div className="pt-4 flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={isUpdating}
                      className="btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Save Changes
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleResetPassword}
                      disabled={isResettingPassword}
                      className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white transition-all flex items-center justify-center gap-2 text-sm font-bold"
                    >
                      {isResettingPassword ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Key className="w-4 h-4" />
                      )}
                      Send Password Reset Email
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
