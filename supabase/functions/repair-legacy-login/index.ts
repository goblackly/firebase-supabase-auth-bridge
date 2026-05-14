import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type RepairRequest = {
  email?: string;
  password?: string;
  supabaseErrorCode?: string;
};

type PublicUserRow = {
  auth_user_id: string | null;
  firebase_uid: string;
  email: string;
  role: 'member' | 'admin';
};

type AuthUserSummary = {
  id: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
};

type LegacyPasswordClassification =
  | 'preserve-current-supabase-password'
  | 'eligible-for-firebase-password-restore'
  | 'manual-review'
  | 'not-migrated';

function getSupabaseConfig() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration');
  }

  return { supabaseUrl, serviceRoleKey };
}

function getFirebaseWebApiKey() {
  return Deno.env.get('FIREBASE_WEB_API_KEY') || 'AIzaSyAk6CrvSXBBiZmcFYyXWF_kZkus556I6wI';
}

function isoMs(value?: string | null) {
  return value ? Date.parse(value) : NaN;
}

function hasMeaningfulPostCutoverActivity(authUser: AuthUserSummary) {
  const createdMs = isoMs(authUser.created_at);
  const updatedMs = isoMs(authUser.updated_at);
  const confirmedMs = isoMs(authUser.email_confirmed_at);
  const graceWindowMs = 5 * 60 * 1000;

  return (
    Boolean(authUser.last_sign_in_at) ||
    (Number.isFinite(updatedMs) && Number.isFinite(createdMs) && updatedMs - createdMs > graceWindowMs) ||
    (Number.isFinite(confirmedMs) && Number.isFinite(createdMs) && confirmedMs - createdMs > graceWindowMs)
  );
}

function classifyLegacyPasswordState(
  publicUser: PublicUserRow | null,
  authUser: AuthUserSummary | null,
): LegacyPasswordClassification {
  if (!publicUser || !authUser) {
    return 'manual-review';
  }

  if (publicUser.firebase_uid === authUser.id) {
    return 'not-migrated';
  }

  if (hasMeaningfulPostCutoverActivity(authUser)) {
    return 'preserve-current-supabase-password';
  }

  return 'eligible-for-firebase-password-restore';
}

async function verifyFirebasePassword(email: string, password: string) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${getFirebaseWebApiKey()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    return {
      ok: false,
      errorCode: payload?.error?.message ?? 'FIREBASE_AUTH_FAILED',
      localId: null,
    };
  }

  return {
    ok: true,
    errorCode: null,
    localId: String(payload.localId ?? ''),
  };
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
    const payload = (await request.json()) as RepairRequest;
    const email = String(payload.email ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: publicUser, error: publicUserError } = await adminClient
      .from('users')
      .select('auth_user_id, firebase_uid, email, role')
      .ilike('email', email)
      .maybeSingle();

    if (publicUserError) {
      throw publicUserError;
    }

    const { data: authUsersData, error: authUsersError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authUsersError) {
      throw authUsersError;
    }

    const authUser = (authUsersData?.users ?? []).find(
      (user) => String(user.email ?? '').toLowerCase() === email,
    );

    const classification = classifyLegacyPasswordState(
      (publicUser as PublicUserRow | null) ?? null,
      (authUser as AuthUserSummary | undefined) ?? null,
    );

    console.warn('repair-legacy-login classification', {
      email,
      supabaseErrorCode: payload.supabaseErrorCode ?? null,
      classification,
      publicUserExists: Boolean(publicUser),
      authUserExists: Boolean(authUser),
    });

    if (classification === 'not-migrated') {
      return new Response(
        JSON.stringify({
          ok: true,
          repaired: false,
          classification,
          action: 'none',
          publicUserExists: Boolean(publicUser),
          authUserExists: Boolean(authUser),
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    if (classification !== 'eligible-for-firebase-password-restore' || !publicUser || !authUser) {
      return new Response(
        JSON.stringify({
          ok: true,
          repaired: false,
          classification,
          action: 'reset-password',
          publicUserExists: Boolean(publicUser),
          authUserExists: Boolean(authUser),
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    const firebaseVerification = await verifyFirebasePassword(email, password);

    if (!firebaseVerification.ok) {
      console.warn('repair-legacy-login firebase verification failed', {
        email,
        errorCode: firebaseVerification.errorCode,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          repaired: false,
          classification,
          action: 'none',
          reason: firebaseVerification.errorCode,
          publicUserExists: true,
          authUserExists: true,
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    if (firebaseVerification.localId && firebaseVerification.localId !== publicUser.firebase_uid) {
      return new Response(
        JSON.stringify({
          ok: true,
          repaired: false,
          classification: 'manual-review',
          action: 'reset-password',
          reason: 'firebase_uid_mismatch',
          publicUserExists: true,
          authUserExists: true,
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });

    if (updateError) {
      throw updateError;
    }

    if (publicUser.auth_user_id !== authUser.id) {
      const { error: attachError } = await adminClient
        .from('users')
        .update({
          auth_user_id: authUser.id,
          updated_at: new Date().toISOString(),
        })
        .eq('firebase_uid', publicUser.firebase_uid);

      if (attachError) {
        throw attachError;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        repaired: true,
        classification,
        action: 'retry-supabase-login',
        publicUserExists: true,
        authUserExists: true,
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('repair-legacy-login error:', error);
    return new Response(JSON.stringify({ error: 'Failed to repair legacy login.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
