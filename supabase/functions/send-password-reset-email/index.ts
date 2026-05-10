import { createClient } from 'npm:@supabase/supabase-js@2';
import { cert, getApps, initializeApp } from 'npm:firebase-admin/app';
import { getAuth } from 'npm:firebase-admin/auth';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getAppUrl() {
  return (Deno.env.get('APP_URL') ?? 'https://blackspend.pbskus.net').replace(/\/+$/, '');
}

function buildGreeting(lastName?: string) {
  const trimmed = (lastName ?? '').trim();
  return trimmed ? `Hi Bro. ${escapeHtml(trimmed)},` : 'Hi Bro.,';
}

function getFirebaseAdminAuth() {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID');
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL');
  const privateKey = Deno.env.get('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin credentials');
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return getAuth();
}

async function fetchLastName(email: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return '';
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await adminClient
    .from('users')
    .select('last_name')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    console.warn('Failed to fetch last name for password reset email:', error);
    return '';
  }

  return String(data?.last_name ?? '').trim();
}

function buildEmail(email: string, lastName: string, resetLink: string) {
  const greeting = buildGreeting(lastName);

  return {
    to: email,
    subject: 'Reset your Black Spend Initiative password',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px; color: #14213d; line-height: 1.6;">
        <h2 style="color: #0f4fd6; margin: 0 0 20px;">Reset your Black Spend Initiative password</h2>
        <p style="margin: 0 0 16px;">${greeting}</p>
        <p style="margin: 0 0 16px;">We received a request to reset your password.</p>
        <p style="margin: 0 0 16px;">Use the button below to choose a new password.</p>
        <p style="margin: 28px 0;">
          <a
            href="${resetLink}"
            style="display: inline-block; background: #0f4fd6; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 700;"
          >Reset Password</a>
        </p>
        <p style="margin: 0 0 16px;">If you did not request this, you can ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #667085; margin: 0;">Black Spend Initiative<br />Kappa Upsilon Sigma Chapter</p>
      </div>
    `,
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

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!resendApiKey || !resendFromEmail) {
    return new Response(JSON.stringify({ error: 'Missing email configuration' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  let payload: { email?: string };

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const email = String(payload.email ?? '').trim().toLowerCase();

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    const firebaseAuth = getFirebaseAdminAuth();
    const resetLink = await firebaseAuth.generatePasswordResetLink(email, {
      url: `${getAppUrl()}/reset-password`,
      handleCodeInApp: false,
    });
    const lastName = await fetchLastName(email);
    const outboundEmail = buildEmail(email, lastName, resetLink);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: outboundEmail.to,
        subject: outboundEmail.subject,
        html: outboundEmail.html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendData);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: resendData }), {
        status: 502,
        headers: corsHeaders,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('user-not-found')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    console.error('Password reset email error:', error);
    return new Response(JSON.stringify({ error: 'Failed to prepare password reset email' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: corsHeaders,
  });
});
