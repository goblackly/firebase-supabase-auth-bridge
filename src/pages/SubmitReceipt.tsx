import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationService } from '../services/notificationService';
import { syncSubmissionToSupabase, syncUserProfileToSupabase } from '../services/supabaseBridge';
import { uploadReceiptToSupabase } from '../services/receiptStorage';
import { formatFileSize, mapReceiptSubmissionError, prepareReceiptFile } from '../services/receiptUpload';
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
  const [fileProcessing, setFileProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');

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
  const [previewIsImage, setPreviewIsImage] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) {
      return;
    }

    setFileProcessing(true);
    setError('');
    setUploadNotice('');

    try {
      const { file: preparedFile, notice } = await prepareReceiptFile(file);
      setReceiptFile(preparedFile);
      setUploadNotice(notice ?? '');

      if (preparedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewIsImage(true);
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(preparedFile);
      } else {
        setPreviewIsImage(false);
        setPreviewUrl(null);
      }
    } catch (err: any) {
      setReceiptFile(null);
      setPreviewUrl(null);
      setPreviewIsImage(false);
      setError(err?.message || 'We could not prepare that file for upload.');
    } finally {
      setFileProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!profile?.uid) {
      setError('Your profile is still loading. Please refresh and try again.');
      return;
    }
    if (!receiptFile) {
      setError('Please upload a receipt image.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let fileUrl = '';
      console.log('Starting storage upload...');
      const uploadPromise = uploadReceiptToSupabase(profile.uid, receiptFile);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timed out. Please check your connection.')), 45000)
      );

      fileUrl = await Promise.race([uploadPromise, timeoutPromise]) as string;
      console.log('Storage upload successful:', fileUrl);

      const submissionData = {
        user_id: profile.uid,
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (profile) {
        try {
          await syncUserProfileToSupabase({
            uid: profile.uid,
            auth_user_id: user.id,
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
            firebase_uid: profile.uid,
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
          uid: user.id,
          auth_user_id: user.id,
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
          firebase_uid: user.id,
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

      const memberName = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Black Spend Member';
      const memberEmail = profile?.email ?? user.email ?? '';
      const memberLastName = profile?.last_name ?? '';
      const amount = parseFloat(formData.amountSpent);

      void Promise.allSettled([
        notificationService.notifyAdminNewSubmission({
          memberName,
          businessName: formData.businessName,
          amount,
        }),
        memberEmail
          ? notificationService.notifyMemberSubmissionReceived({
              email: memberEmail,
              lastName: memberLastName,
              businessName: formData.businessName,
              amount,
            })
          : Promise.resolve(),
      ]);

      setSuccess(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err: any) {
      console.error('Submission error:', err);
      setError(mapReceiptSubmissionError(err));
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

          {uploadNotice && (
            <div className="bg-amber-500/10 border border-amber-500/40 p-4 rounded-xl flex items-start gap-3 text-amber-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{uploadNotice}</p>
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
                {receiptFile ? (
                  <div className="relative inline-block">
                    {previewIsImage && previewUrl ? (
                      <img src={previewUrl} alt="Receipt Preview" className="max-h-64 rounded-xl shadow-lg" />
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-sigma-dark/60 p-5 text-left min-w-[260px] shadow-lg">
                        <p className="text-white font-semibold break-all">{receiptFile.name}</p>
                        <p className="text-slate-400 text-sm mt-2">{formatFileSize(receiptFile.size)}</p>
                        <p className="text-slate-500 text-xs mt-1">PDF ready to upload</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => { setReceiptFile(null); setPreviewUrl(null); setPreviewIsImage(false); setUploadNotice(''); }}
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
                    <p className="text-xs text-slate-600 mt-2">Large mobile photos will be optimized automatically before upload.</p>
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
              disabled={loading || fileProcessing}
              className="btn-primary flex-[2]"
            >
              {loading || fileProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {fileProcessing ? 'Preparing file...' : 'Submitting...'}
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
