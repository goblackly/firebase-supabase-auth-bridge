import { createClient } from 'npm:@supabase/supabase-js@2';

export async function authenticatedCaller(request: Request) {
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Unauthorized');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error('Unauthorized');
  const { data: profile, error: profileError } = await client.from('users').select('*').eq('auth_user_id', data.user.id).single();
  if (profileError || !profile) throw new Error('Member profile required');
  return { client, profile, user: data.user, fullAdmin: profile.role === 'admin' && profile.account_mode === 'normal' };
}

export async function receiptEmailContext(request: Request, type: string, submissionId?: string) {
  const caller = await authenticatedCaller(request);
  if (!submissionId) throw new Error('Submission ID required');
  const { data: receipt, error } = await caller.client.from('submissions').select('*').eq('id', submissionId).single();
  if (error || !receipt) throw new Error('Receipt unavailable');
  const review = ['member-submission-approved', 'member-submission-rejected'].includes(type);
  if (review) {
    if (!caller.fullAdmin && !(caller.profile.account_mode === 'demo_admin' && receipt.is_demo)) throw new Error('Review access required');
    if (receipt.status !== (type.endsWith('approved') ? 'approved' : 'rejected')) throw new Error('Receipt status does not match email');
  } else if (receipt.auth_user_id !== caller.user.id) throw new Error('Own receipt required');
  const { data: member, error: memberError } = await caller.client.from('users').select('email,last_name,account_mode').eq('auth_user_id', receipt.auth_user_id).single();
  if (memberError || !member) throw new Error('Recipient unavailable');
  return { receipt, member, suppress: receipt.is_demo && type === 'admin-new-submission' };
}
