const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type MemberWelcomePayload = {
  type: 'member-welcome';
  payload: {
    email: string;
    lastName: string;
  };
};

type AdminNewUserPayload = {
  type: 'admin-new-user';
  payload: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

type NotificationPayload = MemberWelcomePayload | AdminNewUserPayload;

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

function wrapEmail(params: {
  title: string;
  greeting?: string;
  body: string[];
  ctaLabel: string;
  ctaUrl: string;
}) {
  const bodyHtml = params.body.map((line) => `<p style="margin: 0 0 16px;">${line}</p>`).join('');

  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #14213d; line-height: 1.6;">
      <h2 style="color: #0f4fd6; margin: 0 0 20px;">${params.title}</h2>
      ${params.greeting ? `<p style="margin: 0 0 16px;">${params.greeting}</p>` : ''}
      ${bodyHtml}
      <p style="margin: 28px 0;">
        <a
          href="${params.ctaUrl}"
          style="display: inline-block; background: #0f4fd6; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 700;"
        >${params.ctaLabel}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #667085; margin: 0;">Black Spend Initiative<br />Kappa Upsilon Sigma Chapter</p>
    </div>
  `;
}

function buildEmail(payload: NotificationPayload, adminEmail: string) {
  const appUrl = getAppUrl();

  if (payload.type === 'member-welcome') {
    return {
      to: payload.payload.email.trim(),
      subject: 'Welcome to the Black Spend Initiative',
      html: wrapEmail({
        title: 'Welcome to the Black Spend Initiative',
        greeting: buildGreeting(payload.payload.lastName),
        body: [
          'Welcome to the Black Spend Initiative. Your account is ready, and you can now sign in to submit receipts and track your impact.',
          'Use the button below to get started.',
        ],
        ctaLabel: 'Sign In',
        ctaUrl: `${appUrl}/login`,
      }),
    };
  }

  const firstName = escapeHtml(payload.payload.firstName.trim());
  const lastName = escapeHtml(payload.payload.lastName.trim());
  const email = escapeHtml(payload.payload.email.trim());

  return {
    to: adminEmail,
    subject: 'New member registration',
    html: wrapEmail({
      title: 'New member registration',
      body: [
        'A new member has registered for the Black Spend Initiative.',
        `<strong>Name:</strong> ${firstName} ${lastName}<br /><strong>Email:</strong> ${email}`,
        'Log in to the admin dashboard to review or manage this account.',
      ],
      ctaLabel: 'Open Admin Dashboard',
      ctaUrl: `${appUrl}/admin/users`,
    }),
  };
}

function validatePayload(payload: NotificationPayload) {
  if (payload.type === 'member-welcome') {
    return Boolean(payload.payload.email?.trim());
  }

  return Boolean(
    payload.payload.firstName?.trim() &&
    payload.payload.lastName?.trim() &&
    payload.payload.email?.trim()
  );
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
  const adminEmail = Deno.env.get('ADMIN_EMAIL') ?? 'info@goblackly.com';

  if (!resendApiKey || !resendFromEmail) {
    return new Response(JSON.stringify({ error: 'Missing email configuration' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  let payload: NotificationPayload;

  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  if (!payload?.type || !validatePayload(payload)) {
    return new Response(JSON.stringify({ error: 'Invalid notification payload' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const email = buildEmail(payload, adminEmail);

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: email.to,
      subject: email.subject,
      html: email.html,
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

  return new Response(JSON.stringify({ ok: true, data: resendData }), {
    status: 200,
    headers: corsHeaders,
  });
});
