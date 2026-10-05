import { supabase } from '../supabase';
import type { BusinessSnapshot, RegistryBusiness, OwnershipStatus } from './businessRankings';

export async function fetchBusinessSnapshot(): Promise<BusinessSnapshot> {
  const { data, error } = await supabase.rpc('admin_business_snapshot');
  if (error) throw error;
  if (!data?.submissions || !data?.businesses || !data?.year_totals) throw new Error('Incomplete business report. Please refresh.');
  return data as BusinessSnapshot;
}
export async function confirmBusinessMatch(ids: string[], target: string | null,
  newBusiness: Pick<RegistryBusiness, 'business_name' | 'city' | 'state' | 'business_address' | 'zip_code'> | null,
  expected: string | null) {
  const { error } = await supabase.rpc('confirm_business_match', { p_submission_ids: ids,
    p_business_id: target, p_new_business: newBusiness, p_expected_business_id: expected });
  if (error) throw error;
}
export async function unlinkBusinessMatch(ids: string[], expected: string) {
  const { error } = await supabase.rpc('unlink_business_match', { p_submission_ids: ids, p_expected_business_id: expected });
  if (error) throw error;
}
export async function reviewOwnership(business: RegistryBusiness, status: OwnershipStatus, sigma: boolean | null, note: string) {
  const { error } = await supabase.rpc('review_business_ownership', { p_business_id: business.id, p_status: status,
    p_sigma_owned: sigma, p_note: note, p_expected_updated_at: business.updated_at });
  if (error) throw error;
}
