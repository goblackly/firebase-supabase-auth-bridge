export type UserRole = 'member' | 'admin';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';
export type BlackOwnedStatus = 'yes' | 'no';

export interface UserProfile {
  uid: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role: UserRole;
  chapter_role?: string;
  crossing_year?: string;
  photo_url?: string;
  created_at: any; // Firestore Timestamp
}

export interface Submission {
  id: string;
  firebase_doc_id?: string;
  user_id: string;
  user_name?: string; // Denormalized for display
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
  status: SubmissionStatus;
  duplicate_flag?: boolean;
  admin_notes?: string;
  created_at: any;
  updated_at: any;
}

export interface Business {
  id: string;
  business_name: string;
  city?: string;
  state?: string;
  business_address?: string;
  zip_code?: string;
  category?: string;
  black_owned_verified?: boolean;
  created_at: any;
}

export interface YearlyGoal {
  id: string;
  year: number;
  goal_amount: number;
}

export interface MonthlyGoal {
  id: string;
  month: number;
  year: number;
  goal_amount: number;
}
