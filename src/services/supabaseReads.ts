import { supabase } from '../supabase';
import type { Submission, UserProfile, YearlyGoal, MonthlyGoal } from '../types';
import { resolveReceiptUrl } from './receiptStorage';

type UserRow = {
  firebase_uid: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: 'member' | 'admin';
  chapter_role: string | null;
  crossing_year: string | null;
  photo_url: string | null;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  firebase_doc_id: string | null;
  firebase_uid: string;
  user_name: string;
  receipt_date: string;
  business_name: string;
  amount_spent: number | string;
  sigma_members_attended: number;
  receipt_file_url: string;
  category: string;
  black_owned_status: 'yes' | 'no';
  city: string | null;
  state: string | null;
  business_address: string | null;
  zip_code: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  duplicate_flag: boolean | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

async function mapSubmission(row: SubmissionRow): Promise<Submission> {
  return {
    id: row.id,
    firebase_doc_id: row.firebase_doc_id ?? undefined,
    user_id: row.firebase_uid,
    user_name: row.user_name,
    receipt_date: row.receipt_date,
    business_name: row.business_name,
    amount_spent: Number(row.amount_spent),
    sigma_members_attended: Number(row.sigma_members_attended),
    receipt_file_url: await resolveReceiptUrl(row.receipt_file_url),
    category: row.category,
    black_owned_status: row.black_owned_status,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    business_address: row.business_address ?? undefined,
    zip_code: row.zip_code ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    duplicate_flag: row.duplicate_flag ?? undefined,
    admin_notes: row.admin_notes ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapUser(row: UserRow): UserProfile {
  return {
    uid: row.firebase_uid,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone ?? undefined,
    role: row.role,
    chapter_role: row.chapter_role ?? undefined,
    crossing_year: row.crossing_year ?? undefined,
    photo_url: row.photo_url ?? undefined,
    created_at: row.created_at,
  };
}

export async function fetchUserSubmissions(firebaseUid: string): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('firebase_uid', firebaseUid)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map((row) => mapSubmission(row as SubmissionRow)));
}

export async function fetchApprovedSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map((row) => mapSubmission(row as SubmissionRow)));
}

export async function fetchAllSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Promise.all((data ?? []).map((row) => mapSubmission(row as SubmissionRow)));
}

export async function fetchUserCount(): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function fetchAllUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapUser(row as UserRow));
}

export async function fetchUserContactByFirebaseUid(firebaseUid: string): Promise<{
  email: string;
  firstName: string;
  lastName: string;
} | null> {
  const { data, error } = await supabase
    .from('users')
    .select('email, first_name, last_name')
    .eq('firebase_uid', firebaseUid)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    email: String(data.email ?? '').trim(),
    firstName: String(data.first_name ?? '').trim(),
    lastName: String(data.last_name ?? '').trim(),
  };
}

export async function fetchYearlyGoal(year: number): Promise<YearlyGoal | null> {
  const { data, error } = await supabase
    .from('yearly_goals')
    .select('*')
    .eq('year', year)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as YearlyGoal | null;
}

export async function fetchMonthlyGoal(year: number, month: number): Promise<MonthlyGoal | null> {
  const { data, error } = await supabase
    .from('monthly_goals')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as MonthlyGoal | null;
}
