import React, { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import {
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { Submission } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { fetchAllSubmissions, fetchUserContactByFirebaseUid } from '../services/supabaseReads';
import {
  deleteSubmissionFromSupabase,
  updateSubmissionReviewInSupabase,
} from '../services/supabaseBridge';
import { notificationService } from '../services/notificationService';

export default function AdminSubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSubmissions() {
      setLoading(true);

      try {
        const subs = await fetchAllSubmissions();
        const flaggedSubs = subs.map((sub) => {
          const isDuplicate = subs.some(
            (other) =>
              other.id !== sub.id &&
              other.user_id === sub.user_id &&
              other.business_name.toLowerCase() === sub.business_name.toLowerCase() &&
              other.amount_spent === sub.amount_spent &&
              other.receipt_date === sub.receipt_date
          );
          return { ...sub, duplicate_flag: isDuplicate };
        });

        if (!cancelled) {
          setSubmissions(flaggedSubs);
          setError(null);
        }
      } catch (err) {
        console.error('AdminSubmissions Supabase read error:', err);
        if (!cancelled) {
          setError('Failed to load submissions from Supabase.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, []);

  const openSubmission = (submission: Submission) => {
    setSelectedSubmission(submission);
    setAdminNotes(submission.admin_notes ?? '');
  };

  const handleStatusUpdate = async (submission: Submission, status: 'approved' | 'rejected') => {
    const firebaseDocId = submission.firebase_doc_id;
    const nextAdminNotes = adminNotes.trim();
    const nextUpdatedAt = new Date().toISOString();

    try {
      await updateSubmissionReviewInSupabase(
        submission.id,
        status,
        nextAdminNotes,
        submission.duplicate_flag ?? false
      );

      if (firebaseDocId) {
        try {
          await updateDoc(doc(db, 'submissions', firebaseDocId), {
            status,
            admin_notes: nextAdminNotes,
            updated_at: serverTimestamp(),
          });
        } catch (firebaseError) {
          console.warn('Firebase review mirror failed after Supabase review update:', firebaseError);
        }
      }

      setSubmissions((current) =>
        current.map((item) =>
          item.id === submission.id
            ? { ...item, status, admin_notes: nextAdminNotes, updated_at: nextUpdatedAt }
            : item
        )
      );
      setSelectedSubmission(null);
      setAdminNotes('');
      setError(null);

      void (async () => {
        const contact = await fetchUserContactByFirebaseUid(submission.user_id);

        if (!contact?.email) {
          return;
        }

        if (status === 'approved') {
          await notificationService.notifyMemberSubmissionApproved({
            email: contact.email,
            lastName: contact.lastName,
            businessName: submission.business_name,
            amount: submission.amount_spent,
          });
          return;
        }

        await notificationService.notifyMemberSubmissionRejected({
          email: contact.email,
          lastName: contact.lastName,
          businessName: submission.business_name,
          amount: submission.amount_spent,
          adminNote: nextAdminNotes,
        });
      })().catch((notificationError) => {
        console.error('Failed to send review result email:', notificationError);
      });
    } catch (err) {
      console.error('Error updating submission review state:', err);
      setError('Failed to update the submission review state in Supabase.');
    }
  };

  const handleDelete = async () => {
    if (!selectedSubmission) return;
    const firebaseDocId = selectedSubmission.firebase_doc_id;
    setIsDeleting(true);
    try {
      await deleteSubmissionFromSupabase(selectedSubmission.id);

      if (firebaseDocId) {
        try {
          await deleteDoc(doc(db, 'submissions', firebaseDocId));
        } catch (firebaseError) {
          console.warn('Firebase delete mirror failed after Supabase delete:', firebaseError);
        }
      }

      setSubmissions((current) => current.filter((item) => item.id !== selectedSubmission.id));
      setSelectedSubmission(null);
      setShowDeleteConfirm(false);
      setAdminNotes('');
      setError(null);
    } catch (err) {
      console.error('Error deleting submission:', err);
      setError('Failed to delete the submission from Supabase.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredSubmissions = submissions.filter((sub) => {
    const matchesStatus = filterStatus === 'all' || sub.status === filterStatus;
    const matchesSearch =
      sub.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (sub.user_name ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <Layout title="Review Submissions">
      <div className="max-w-7xl mx-auto">
        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-3 text-red-400">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">{error}</p>
            </div>
            <pre className="text-[10px] bg-black/20 p-2 rounded overflow-auto max-h-40">{error}</pre>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
            <FilterButton active={filterStatus === 'all'} onClick={() => setFilterStatus('all')}>All</FilterButton>
            <FilterButton active={filterStatus === 'pending'} onClick={() => setFilterStatus('pending')}>Pending</FilterButton>
            <FilterButton active={filterStatus === 'approved'} onClick={() => setFilterStatus('approved')}>Approved</FilterButton>
            <FilterButton active={filterStatus === 'rejected'} onClick={() => setFilterStatus('rejected')}>Rejected</FilterButton>
          </div>

          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by business or member..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field w-full px-4"
            />
          </div>
        </div>

        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5">
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Member</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Business</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Date</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Amount</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">Status</th>
                  <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredSubmissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-sigma-blue/20 rounded-full flex items-center justify-center text-sigma-blue font-bold text-xs">
                          {sub.user_name?.[0]}
                        </div>
                        <span className="text-sm font-bold text-white">{sub.user_name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{sub.business_name}</span>
                        {sub.duplicate_flag && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      </div>
                      <span className="text-[10px] text-slate-500">{sub.category}</span>
                    </td>
                    <td className="p-4 text-sm text-slate-400">{new Date(sub.receipt_date).toLocaleDateString()}</td>
                    <td className="p-4 text-sm font-bold text-white">${sub.amount_spent.toLocaleString()}</td>
                    <td className="p-4">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          sub.status === 'approved'
                            ? 'bg-emerald-400/20 text-emerald-400'
                            : sub.status === 'rejected'
                              ? 'bg-red-400/20 text-red-400'
                              : 'bg-amber-400/20 text-amber-400'
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => openSubmission(sub)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && filteredSubmissions.length === 0 && (
            <div className="p-20 text-center">
              <p className="text-slate-500 italic">No submissions found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedSubmission && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-sigma-dark border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">Review Submission</h3>
                <button onClick={() => setSelectedSubmission(null)} className="p-2 text-slate-400 hover:text-white">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    {selectedSubmission.duplicate_flag && (
                      <div className="bg-amber-500/10 border border-amber-500/50 p-4 rounded-2xl flex items-start gap-3 text-amber-500 text-sm">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div>
                          <p className="font-bold">Possible Duplicate</p>
                          <p className="text-xs">This member has another submission with the same business, amount, and date.</p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-6">
                      <DetailItem label="Member" value={selectedSubmission.user_name} />
                      <DetailItem label="Business" value={selectedSubmission.business_name} />
                      <DetailItem label="Amount" value={`$${selectedSubmission.amount_spent.toLocaleString()}`} />
                      <DetailItem label="Date" value={new Date(selectedSubmission.receipt_date).toLocaleDateString()} />
                      <DetailItem label="Category" value={selectedSubmission.category} />
                      <DetailItem label="Sigma-Owned" value={selectedSubmission.black_owned_status.toUpperCase()} />
                      <DetailItem label="Members Attended" value={selectedSubmission.sigma_members_attended} />
                      <DetailItem
                        label="Location"
                        value={`${selectedSubmission.business_address ? `${selectedSubmission.business_address}, ` : ''}${selectedSubmission.city || 'N/A'}, ${selectedSubmission.state || 'N/A'}${selectedSubmission.zip_code ? ` ${selectedSubmission.zip_code}` : ''}`}
                      />
                    </div>

                    <div>
                      <label className="label-text">Member Notes</label>
                      <p className="text-sm text-slate-400 bg-white/5 p-4 rounded-xl border border-white/5">
                        {selectedSubmission.notes || 'No notes provided.'}
                      </p>
                    </div>

                    <div>
                      <label className="label-text">Admin Notes (Internal)</label>
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        className="input-field w-full h-24 resize-none px-4"
                        placeholder="Reason for rejection or internal notes..."
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="label-text">Receipt Image</label>
                    <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center min-h-[400px]">
                      {selectedSubmission.receipt_file_url ? (
                        <img
                          src={selectedSubmission.receipt_file_url}
                          alt="Receipt"
                          className="max-w-full max-h-[600px] object-contain"
                        />
                      ) : (
                        <div className="text-center p-10">
                          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                          <p className="text-slate-500 italic">No receipt image available for this submission.</p>
                        </div>
                      )}
                    </div>
                    <a
                      href={selectedSubmission.receipt_file_url || '#'}
                      target={selectedSubmission.receipt_file_url ? '_blank' : '_self'}
                      rel="noopener noreferrer"
                      className={`btn-secondary w-full ${!selectedSubmission.receipt_file_url ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={(e) => {
                        if (!selectedSubmission.receipt_file_url) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <ExternalLink className="w-5 h-5" />
                      {selectedSubmission.receipt_file_url ? 'Open Original File' : 'No File Available'}
                    </a>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/5 bg-white/5 flex gap-4">
                {selectedSubmission.status !== 'pending' && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-secondary bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete Submission
                  </button>
                )}

                {selectedSubmission.status !== 'rejected' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedSubmission, 'rejected')}
                    className="btn-secondary flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                  >
                    <XCircle className="w-5 h-5" />
                    Reject Submission
                  </button>
                )}

                {selectedSubmission.status !== 'approved' && (
                  <button
                    onClick={() => handleStatusUpdate(selectedSubmission, 'approved')}
                    className="btn-primary flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Approve Submission
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-sigma-dark border border-white/10 rounded-3xl w-full max-w-md p-8 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Delete Submission?</h3>
              <p className="text-slate-400 mb-8">
                This action cannot be undone. This submission will be permanently removed from the system.
              </p>
              <div className="flex gap-4">
                <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary flex-1" disabled={isDeleting}>
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="btn-primary flex-1 bg-red-600 hover:bg-red-700 shadow-red-900/20"
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}

function FilterButton({ children, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
        active
          ? 'bg-sigma-blue text-white shadow-lg shadow-sigma-blue/20'
          : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function DetailItem({ label, value }: any) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}
