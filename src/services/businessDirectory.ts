import type { OwnershipStatus } from './businessRankings';

export interface DirectoryBusiness {
  id: string;
  business_name: string;
  business_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  website: string | null;
  category: string | null;
  categories: string[];
  ownership_status: OwnershipStatus;
  sigma_owned: boolean | null;
  updated_at: string;
}

export function safeWebsite(value?: string | null): string | null {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function searchBusinesses(rows: DirectoryBusiness[], query: string, category = ''): DirectoryBusiness[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(b => {
    const haystack = [b.business_name, b.business_address, b.city, b.state, b.phone, b.phone?.replace(/\D/g, '')].join(' ').toLocaleLowerCase();
    return words.every(w => haystack.includes(w)) && (!category || b.categories.includes(category));
  });
}

export async function fetchBusinessCatalog(directory = false): Promise<DirectoryBusiness[]> {
  const { supabase } = await import('../supabase');
  const { data, error } = await supabase.rpc('business_catalog', { p_directory: directory });
  if (error) throw error;
  return data ?? [];
}

export async function submitBusinessReceipt(receipt: Record<string, unknown>, id?: string, version?: string): Promise<string> {
  const { supabase } = await import('../supabase');
  const { data, error } = await supabase.rpc('submit_business_receipt', {
    p_receipt: receipt, p_business_id: id || null, p_business_version: version || null,
  });
  if (error) throw error;
  return data;
}
