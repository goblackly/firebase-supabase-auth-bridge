import type { UserRole, SubmissionStatus, BlackOwnedStatus } from '../types';
import { supabase } from '../supabase';

export interface SupabaseUserProfilePayload {
  uid: string;
  auth_user_id?: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: UserRole;
  chapter_role?: string;
  crossing_year?: string;
  photo_url?: string;
}

export interface SupabaseSubmissionPayload {
  firebase_doc_id?: string;
  firebase_uid: string;
  user_name: string;
  receipt_date: string;
  business_name: string;
  amount_spent: number;
  sigma_members_attended: number;
  receipt_file_url: string;
  category: string;
  black_owned_status: BlackOwnedStatus;
  city?: string;
  state?: string;
  business_address?: string;
  zip_code?: string;
  notes?: string;
  status?: SubmissionStatus;
  duplicate_flag?: boolean;
  admin_notes?: string;
}

function sanitizeOptionalText(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function syncUserProfileToSupabase(profile: SupabaseUserProfilePayload): Promise<void> {
  const email = profile.email.trim();

  if (!email) {
    throw new Error('Cannot sync user profile to Supabase without an email address.');
  }

  const payload = {
    auth_user_id: sanitizeOptionalText(profile.auth_user_id),
    firebase_uid: profile.uid,
    email,
    first_name: profile.first_name.trim(),
    last_name: profile.last_name.trim(),
    phone: sanitizeOptionalText(profile.phone),
    role: profile.role,
    chapter_role: sanitizeOptionalText(profile.chapter_role),
    crossing_year: sanitizeOptionalText(profile.crossing_year),
    photo_url: sanitizeOptionalText(profile.photo_url),
  } satisfies Record<string, unknown>;

  const { error } = await supabase.from('users').upsert(payload, { onConflict: 'firebase_uid' });

  if (error) {
    throw error;
  }
}

export async function updateUserProfileInSupabase(
  uid: string,
  updates: Partial<Omit<SupabaseUserProfilePayload, 'uid'>>
): Promise<void> {
  const payload = {
    auth_user_id: sanitizeOptionalText(updates.auth_user_id),
    email: updates.email?.trim(),
    first_name: updates.first_name?.trim(),
    last_name: updates.last_name?.trim(),
    phone: sanitizeOptionalText(updates.phone),
    role: updates.role,
    chapter_role: sanitizeOptionalText(updates.chapter_role),
    crossing_year: sanitizeOptionalText(updates.crossing_year),
    photo_url: sanitizeOptionalText(updates.photo_url),
    updated_at: new Date().toISOString(),
  } satisfies Record<string, unknown>;

  const normalizedPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  const { error } = await supabase
    .from('users')
    .update(normalizedPayload)
    .eq('firebase_uid', uid);

  if (error) {
    throw error;
  }
}

export async function syncSubmissionToSupabase(submission: SupabaseSubmissionPayload): Promise<void> {
  const payload = {
    firebase_doc_id: sanitizeOptionalText(submission.firebase_doc_id),
    firebase_uid: submission.firebase_uid,
    user_name: submission.user_name.trim(),
    receipt_date: submission.receipt_date,
    business_name: submission.business_name.trim(),
    amount_spent: submission.amount_spent,
    sigma_members_attended: submission.sigma_members_attended,
    receipt_file_url: submission.receipt_file_url,
    category: submission.category,
    black_owned_status: submission.black_owned_status,
    city: sanitizeOptionalText(submission.city),
    state: sanitizeOptionalText(submission.state),
    business_address: sanitizeOptionalText(submission.business_address),
    zip_code: sanitizeOptionalText(submission.zip_code),
    notes: sanitizeOptionalText(submission.notes),
    status: submission.status ?? 'pending',
    duplicate_flag: submission.duplicate_flag ?? false,
    admin_notes: sanitizeOptionalText(submission.admin_notes),
  } satisfies Record<string, unknown>;

  const { error } = await supabase.from('submissions').insert(payload);

  if (error) {
    throw error;
  }
}

export async function attachFirebaseDocIdToSubmission(
  firebaseUid: string,
  receiptFileUrl: string,
  firebaseDocId: string
): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .update({
      firebase_doc_id: firebaseDocId,
      updated_at: new Date().toISOString(),
    })
    .eq('firebase_uid', firebaseUid)
    .eq('receipt_file_url', receiptFileUrl)
    .is('firebase_doc_id', null);

  if (error) {
    throw error;
  }
}

export async function updateSubmissionReviewInSupabase(
  submissionId: string,
  status: SubmissionStatus,
  adminNotes?: string | null,
  duplicateFlag?: boolean
): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .update({
      status,
      admin_notes: sanitizeOptionalText(adminNotes),
      duplicate_flag: duplicateFlag ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId);

  if (error) {
    throw error;
  }
}

export async function deleteSubmissionFromSupabase(submissionId: string): Promise<void> {
  const { error } = await supabase
    .from('submissions')
    .delete()
    .eq('id', submissionId);

  if (error) {
    throw error;
  }
}

export async function updateGoalInSupabase(
  table: 'yearly_goals' | 'monthly_goals',
  payload: Record<string, unknown>,
  match: Record<string, unknown>
): Promise<any> {
  let query = supabase.from(table).update(payload);

  for (const [key, value] of Object.entries(match)) {
    query = query.eq(key, value);
  }

  const { data, error } = await query.select().single();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertGoalInSupabase(
  table: 'yearly_goals' | 'monthly_goals',
  payload: Record<string, unknown>,
  onConflict: string
): Promise<any> {
  const { data, error } = await supabase
    .from(table)
    .upsert(payload, { onConflict })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
