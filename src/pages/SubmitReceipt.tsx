import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { notificationService } from '../services/notificationService';
import { attachFirebaseDocIdToSubmission, syncSubmissionToSupabase, syncUserProfileToSupabase } from '../services/supabaseBridge';
import { uploadReceiptToSupabase } from '../services/receiptStorage';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import {
  Camera,
  Upload,
  MapPin,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';

const CATEGORIES = [
  'Restaurant',
  'Retail',
  'Services',
  'Entertainment',
  'Travel',
  'Other'
];

export default function SubmitReceipt() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    receiptDate: new Date().toISOString().split('T')[0],
    businessName: '',
    amountSpent: '',
    sigmaMembers: '1',
    category: 'Restaurant',
    blackOwned: 'yes',
    city: '',
    state: '',
    businessAddress: '',
    zipCode: '',
    notes: '',
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!receiptFile) {
      setError('Please upload a receipt image.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let fileUrl = '';
      console.log('Starting storage upload...');
      const uploadPromise = uploadReceiptToSupabase(user.uid, receiptFile);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timed out. Please check your connection.')), 20000)
      );

      fileUrl = await Promise.race([uploadPromise, timeoutPromise]) as string;
      console.log('Storage upload successful:', fileUrl);

      const submissionData = {
        user_id: user.uid,
        user_name: `${profile?.first_name} ${profile?.last_name}`.trim(),
        receipt_date: formData.receiptDate,
        business_name: formData.businessName,
        amount_spent: parseFloat(formData.amountSpent),
        sigma_members_attended: parseInt(formData.sigmaMembers),
        receipt_file_url: fileUrl,
        category: formData.category,
        black_owned_status: formData.blackOwned,
        city: formData.city,
        state: formData.state,
        business_address: formData.businessAddress,
        zip_code: formData.zipCode,
        notes: formData.notes,
        status: 'pending',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      };

      if (profile) {
        try {
          await syncUserProfileToSupabase({
            uid: user.uid,
            email: profile.email ?? user.email ?? '',
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone,
            role: profile.role,
            chapter_role: profile.chapter_role,
            crossing_year: profile.crossing_year,
            photo_url: profile.photo_url,
          });

          await syncSubmissionToSupabase({
            firebase_uid: user.uid,
            user_name: submissionData.user_name,
            receipt_date: submissionData.receipt_date,
            business_name: submissionData.business_name,
            amount_spent: submissionData.amount_spent,
            sigma_members_attended: submissionData.sigma_members_attended,
            receipt_file_url: submissionData.receipt_file_url,
            category: submissionData.category,
            black_owned_status: submissionData.black_owned_status as 'yes' | 'no',
            city: submissionData.city,
            state: submissionData.state,
            business_address: submissionData.business_address,
            zip_code: submissionData.zip_code,
            notes: submissionData.notes,
            status: 'pending',
          });
        } catch (syncError) {
          throw syncError;
        }
      } else if (user.email) {
        await syncUserProfileToSupabase({
          uid: user.uid,
          email: user.email,
          first_name: profile?.first_name ?? '',
          last_name: profile?.last_name ?? '',
          phone: profile?.phone,
          role: profile?.role ?? (user.email === 'info@goblackly.com' ? 'admin' : 'member'),
          chapter_role: profile?.chapter_role,
          crossing_year: profile?.crossing_year,
          photo_url: profile?.photo_url,
        });

        await syncSubmissionToSupabase({
          firebase_uid: user.uid,
          user_name: submissionData.user_name,
          receipt_date: submissionData.receipt_date,
          business_name: submissionData.business_name,
          amount_spent: submissionData.amount_spent,
          sigma_members_attended: submissionData.sigma_members_attended,
          receipt_file_url: submissionData.receipt_file_url,
          category: submissionData.category,
          black_owned_status: submissionData.black_owned_status as 'yes' | 'no',
          city: submissionData.city,
          state: submissionData.state,
          business_address: submissionData.business_address,
          zip_code: submissionData.zip_code,
          notes: submissionData.notes,
          status: 'pending',
        });
      } else {
        throw new Error('Cannot sync submission to Supabase without a loaded user profile or email.');
      }

      try {
        console.log('Saving to Firestore...');
        const submissionRef = await addDoc(collection(db, 'submissions'), submissionData);
        console.log('Firestore save successful');

        if (submissionRef.id) {
          try {
            await attachFirebaseDocIdToSubmission(user.uid, submissionData.receipt_file_url, submissionRef.id);
          } catch (syncError) {
            console.warn('Supabase submission update with firebase_doc_id deferred:', syncError);
          }
        }
      } catch (firestoreError) {
        console.warn('Firestore submission mirror deferred:', firestoreError);
      }

      await notificationService.notifyAdminNewSubmission({
        userName: `${profile?.first_name} ${profile?.last_name}`,
        businessName: formData.businessName,
        amount: parseFloat(formData.amountSpent)
      });

      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err: any) {
      console.error('Submission error:', err);
      let errorMessage = err.message || 'An error occurred during submission.';

      if (err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('row-level security')) {
        errorMessage = 'Permission denied: Unable to upload to receipt storage. Please verify the Supabase storage policies for this user.';
      } else if (err.message?.includes('timed out')) {
        errorMessage = 'Upload timed out. The file might be too large or your connection is slow.';
      }

      setError(errorMessage);

      if (err.message?.includes('permission')) {
        try {
          handleFirestoreError(err, OperationType.CREATE, 'submissions');
        } catch (e) {
          // ignore re-throw
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/20"
          >
            <CheckCircle2 className="w-12 h-12 text-white" />
          </motion.div>
          <h2 className="text-3xl font-bold text-white mb-2">Submission Successful!</h2>
          <p className="text-slate-400">Your receipt has been submitted for review.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Submit Receipt">
      <div className="max-w-3xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-start gap-3 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <div className="glass-card p-8">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-sigma-blue" />
              Receipt Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label-text">Receipt Date</label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={formData.receiptDate}
                    onChange={(e) => setFormData({ ...formData, receiptDate: e.target.value })}
                    className="input-field w-full px-4"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Business Name</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="input-field w-full px-4"
                    placeholder="e.g. Joe's BBQ"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Amount Spent</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amountSpent}
                    onChange={(e) => setFormData({ ...formData, amountSpent: e.target.value })}
                    className="input-field w-full px-4"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Sigma Members Attended</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.sigmaMembers}
                    onChange={(e) => setFormData({ ...formData, sigmaMembers: e.target.value })}
                    className="input-field w-full px-4"
                  />
                </div>
              </div>

              <div>
                <label className="label-text">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input-field w-full px-4"
                >
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>

              <div>
                <label className="label-text">Sigma-Owned Business?</label>
                <select
                  value={formData.blackOwned}
                  onChange={(e) => setFormData({ ...formData, blackOwned: e.target.value })}
                  className="input-field w-full px-4"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-card p-8">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Camera className="w-5 h-5 text-sigma-blue" />
              Upload Receipt
            </h3>

            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                  previewUrl ? 'border-sigma-blue bg-sigma-blue/5' : 'border-white/10 hover:border-white/20'
                }`}
              >
                {previewUrl ? (
                  <div className="relative inline-block">
                    <img src={previewUrl} alt="Receipt Preview" className="max-h-64 rounded-xl shadow-lg" />
                    <button
                      type="button"
                      onClick={() => { setReceiptFile(null); setPreviewUrl(null); }}
                      className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer block">
                    <Upload className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-white font-bold mb-1">Click to upload or drag and drop</p>
                    <p className="text-sm text-slate-500">PNG, JPG or PDF (max. 5MB)</p>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card p-8">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sigma-blue" />
              Location & Notes
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="md:col-span-2">
                <label className="label-text">Business Address</label>
                <input
                  type="text"
                  value={formData.businessAddress}
                  onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                  className="input-field w-full px-4"
                  placeholder="e.g. 123 Main St"
                />
              </div>
              <div>
                <label className="label-text">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="input-field w-full px-4"
                  placeholder="e.g. Philadelphia"
                />
              </div>
              <div>
                <label className="label-text">State</label>
                <input
                  type="text"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="input-field w-full px-4"
                  placeholder="e.g. PA"
                />
              </div>
              <div>
                <label className="label-text">Zip Code</label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  className="input-field w-full px-4"
                  placeholder="e.g. 19104"
                />
              </div>
            </div>

            <div>
              <label className="label-text">Notes / Description</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="input-field w-full h-32 resize-none px-4"
                placeholder="Any additional details about this spend..."
              />
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex-[2]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Receipt'
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

function XCircle(props: any) {
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
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
