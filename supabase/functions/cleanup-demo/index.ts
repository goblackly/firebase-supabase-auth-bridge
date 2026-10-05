import { createClient } from 'npm:@supabase/supabase-js@2';
import { authenticatedCaller } from '../_shared/demoSafety.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return new Response('{}', { status: 405, headers });
  try {
    const { client, fullAdmin, user } = await authenticatedCaller(request);
    if (!fullAdmin) throw new Error('Full administrator required');
    const { userId } = await request.json();
    const { data: member, error } = await client.from('users').select('firebase_uid,account_mode').eq('auth_user_id', userId).single();
    if (error || !member || member.account_mode === 'normal') throw new Error('Demo account required');
    const actingClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY')!, {
      global: { headers: { Authorization: request.headers.get('Authorization')! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: archived, error: archiveError } = await actingClient.rpc('archive_demo_receipts', { p_user: userId });
    if (archiveError) throw archiveError;
    let removed = 0;
    // Include previously archived receipts so an interrupted cleanup is safe to retry.
    for (let offset = 0; ; offset += 500) {
      const { data: receipts, error: readError } = await client.from('submissions').select('receipt_file_url')
        .eq('auth_user_id', userId).eq('is_demo', true).not('demo_archived_at', 'is', null).range(offset, offset + 499);
      if (readError) throw readError;
      const paths = [...new Set((receipts ?? []).map(r => String(r.receipt_file_url)))];
      for (const uri of paths) {
        const prefix = `supabase://receipts/${member.firebase_uid}/`;
        if (!uri.startsWith(prefix)) throw new Error('Unexpected file owner; operator review required');
        const { count, error: referenceError } = await client.from('submissions').select('id', { count: 'exact', head: true })
          .eq('receipt_file_url', uri).eq('is_demo', false);
        if (referenceError || count) throw new Error('File has a real receipt reference; cleanup stopped');
        const { error: removeError } = await client.storage.from('receipts').remove([uri.slice('supabase://receipts/'.length)]);
        if (removeError) throw removeError;
        removed++;
      }
      if ((receipts?.length ?? 0) < 500) break;
    }
    const { error: auditError } = await client.from('business_review_history').insert({ actor_id: user.id,
      action: 'demo_files_cleanup', details: { user: userId, archived, files_removed: removed } });
    if (auditError) throw auditError;
    return new Response(JSON.stringify({ archived, filesRemoved: removed }), { headers });
  } catch (error) {
    console.error('demo-cleanup-failed', error instanceof Error ? error.message : 'Unknown error');
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Cleanup failed; archived records remain safe. Retry cleanup.' }), { status: 400, headers });
  }
});
