const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type NewUserPayload = {
  type: 'new-user';
  payload: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

type NewSubmissionPayload = {
  type: 'new-submission';
  payload: {
    userName: string;
    businessName: string;
    amount: number;
  };
};

type NotificationPayload = NewUserPayload | NewSubmissionPayload;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildEmail(payload: NotificationPayload) {
  if (payload.type === 'new-user') {
    const firstName = escapeHtml(payload.payload.firstName.trim());
    const lastName = escapeHtml(payload.payload.lastName.trim());
    const email = escapeHtml(payload.payload.email.trim());

    return {
      subject: 'New User Registration - Sigma Spend Initiative',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #002366;">New User Registration</h2>
          <p>A new member has joined the Sigma Spend Initiative:</p>
          <ul style="list-style: none; padding: 0;">
            <li><strong>Name:</strong> ${firstName} ${lastName}</li>
            <li><strong>Email:</strong> ${email}</li>
          </ul>
          <p>You can manage users in the Admin Dashboard.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #666;">Bigger & Better Business - Kappa Upsilon Sigma Chapter</p>
        </div>
      `,
    };
  }

  const userName = escapeHtml(payload.payload.userName.trim());
  const businessName = escapeHtml(payload.payload.businessName.trim());
  const amount = Number(payload.payload.amount || 0);

  return {
    subject: 'New Receipt Submission - Action Required',
    html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #002366;">New Receipt for Review</h2>
        <p>A new receipt has been submitted and is pending approval:</p>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Member:</strong> ${userName}</li>
          <li><strong>Business:</strong> ${businessName}</li>
          <li><strong>Amount:</strong> $${amount.toLocaleString()}</li>
        </ul>
        <p>Please log in to the Admin Dashboard to approve or reject this submission.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Bigger & Better Business - Kappa Upsilon Sigma Chapter</p>
      </div>
    `,
  };
}

function validatePayload(payload: NotificationPayload) {
  if (payload.type === 'new-user') {
    return Boolean(
      payload.payload.firstName?.trim() &&
      payload.payload.lastName?.trim() &&
      payload.payload.email?.trim()
    );
  }

  return Boolean(
    payload.payload.userName?.trim() &&
    payload.payload.businessName?.trim() &&
    Number.isFinite(Number(payload.payload.amount))
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

  const email = buildEmail(payload);

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: adminEmail,
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
