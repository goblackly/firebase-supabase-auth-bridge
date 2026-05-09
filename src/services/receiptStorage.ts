import { supabase } from '../supabase';

const SUPABASE_RECEIPTS_PREFIX = 'supabase://receipts/';
const RECEIPT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^A-Za-z0-9._-]/g, '_');
}

export function toSupabaseReceiptReference(path: string): string {
  return `${SUPABASE_RECEIPTS_PREFIX}${path}`;
}

export function isSupabaseReceiptReference(value?: string | null): boolean {
  return Boolean(value && value.startsWith(SUPABASE_RECEIPTS_PREFIX));
}

export async function uploadReceiptToSupabase(userId: string, file: File): Promise<string> {
  const filePath = `${userId}/${Date.now()}_${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from('receipts').upload(filePath, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return toSupabaseReceiptReference(filePath);
}

export async function resolveReceiptUrl(value?: string | null): Promise<string> {
  if (!value) {
    return '';
  }

  if (!isSupabaseReceiptReference(value)) {
    return value;
  }

  const filePath = value.slice(SUPABASE_RECEIPTS_PREFIX.length);
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(filePath, RECEIPT_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('Failed to create Supabase signed URL for receipt:', error);
    return '';
  }

  return data.signedUrl;
}
