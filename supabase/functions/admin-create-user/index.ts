import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type AdminCreateUserPayload = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: 'member' | 'admin';
};

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration');
  }

  return { supabaseUrl, serviceRoleKey };
}

function sanitizeOptionalText(value?: string | null) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function generateTemporaryPassword() {
  return `Bsi!${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const authHeader = request.headers.get('Authorization');
    const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: callerData, error: callerError } = await adminClient.auth.getUser(accessToken);

    if (callerError || !callerData.user) {
      return new Response(JSON.stringify({ error: 'Invalid caller session' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('users')
      .select('role, email')
      .eq('auth_user_id', callerData.user.id)
      .maybeSingle();

    if (callerProfileError) {
      throw callerProfileError;
    }

    const isAdmin = callerProfile?.role === 'admin' || callerData.user.email === 'info@goblackly.com';

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const payload = (await request.json()) as AdminCreateUserPayload;
    const email = String(payload.email ?? '').trim().toLowerCase();
    const firstName = String(payload.firstName ?? '').trim();
    const lastName = String(payload.lastName ?? '').trim();
    const phone = sanitizeOptionalText(payload.phone);
    const role = payload.role === 'admin' ? 'admin' : 'member';
    const password = payload.password?.trim() || generateTemporaryPassword();

    if (!email || !firstName || !lastName) {
      return new Response(JSON.stringify({ error: 'Email, first name, and last name are required.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { data: existingUsers } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const existingAuthUser = existingUsers?.users?.find(
      (user) => String(user.email ?? '').toLowerCase() === email
    );

    let authUserId = existingAuthUser?.id;

    if (!authUserId) {
      const { data: createdAuthUser, error: createUserError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createUserError || !createdAuthUser.user) {
        throw createUserError ?? new Error('Failed to create auth user');
      }

      authUserId = createdAuthUser.user.id;
    }

    const { error: upsertError } = await adminClient
      .from('users')
      .upsert(
        {
          auth_user_id: authUserId,
          firebase_uid: authUserId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          role,
        },
        { onConflict: 'firebase_uid' }
      );

    if (upsertError) {
      throw upsertError;
    }

    return new Response(JSON.stringify({ ok: true, user: { id: authUserId, email } }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('admin-create-user error:', error);
    return new Response(JSON.stringify({ error: 'Failed to create member account.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
