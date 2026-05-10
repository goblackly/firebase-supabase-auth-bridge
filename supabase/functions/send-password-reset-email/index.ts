import { createClient } from 'npm:@supabase/supabase-js@2';

type EmailType = 'password-reset' | 'admin-created-account';

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

function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchLastName(email: string) {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient
    .from('users')
    .select('last_name')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    console.warn('Failed to fetch last name for account email:', error);
    return '';
  }

  return String(data?.last_name ?? '').trim();
}

async function generateActionLink(email: string, type: EmailType) {
  const adminClient = getAdminClient();
  const redirectTo = `${getAppUrl()}/reset-password`;
  const authType = 'recovery';

  const { data, error } = await adminClient.auth.admin.generateLink({
    type: authType,
    email,
    options: {
      redirectTo,
    },
  });

  if (error) {
    throw error;
  }

  const actionLink = data?.properties?.action_link;

  if (!actionLink) {
    throw new Error('Supabase did not return an action link');
  }

  return actionLink;
}

function buildEmail(email: string, lastName: string, actionLink: string, type: EmailType) {
  const greeting = buildGreeting(lastName);

  if (type === 'admin-created-account') {
    return {
      to: email,
      subject: 'Your Black Spend Initiative account is ready',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #14213d; line-height: 1.6;">
          <h2 style="color: #0f4fd6; margin: 0 0 20px;">Your Black Spend Initiative account is ready</h2>
          <p style="margin: 0 0 16px;">${greeting}</p>
          <p style="margin: 0 0 16px;">An administrator created your Black Spend Initiative account.</p>
          <p style="margin: 0 0 16px;">Use the button below to set your password and finish getting started.</p>
          <p style="margin: 28px 0;">
            <a
              href="${actionLink}"
              style="display: inline-block; background: #0f4fd6; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 700;"
            >Set Password</a>
          </p>
          <p style="margin: 0 0 16px;">Once your password is set, you can sign in and begin submitting receipts and tracking your impact.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="font-size: 12px; color: #667085; margin: 0;">Black Spend Initiative<br />Kappa Upsilon Sigma Chapter</p>
        </div>
      `,
    };
  }

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
            href="${actionLink}"
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

  let payload: { email?: string; type?: EmailType };

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const email = String(payload.email ?? '').trim().toLowerCase();
  const emailType: EmailType = payload.type === 'admin-created-account' ? 'admin-created-account' : 'password-reset';

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    const actionLink = await generateActionLink(email, emailType);
    const lastName = await fetchLastName(email);
    const outboundEmail = buildEmail(email, lastName, actionLink, emailType);

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

    if (message.includes('User not found')) {
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
