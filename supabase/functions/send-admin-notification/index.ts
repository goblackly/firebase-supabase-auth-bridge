const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type AdminNewSubmissionPayload = {
  type: 'admin-new-submission';
  payload: {
    memberName: string;
    businessName: string;
    amount: number;
  };
};

type MemberSubmissionReceivedPayload = {
  type: 'member-submission-received';
  payload: {
    email: string;
    lastName: string;
    businessName: string;
    amount: number;
  };
};

type MemberSubmissionApprovedPayload = {
  type: 'member-submission-approved';
  payload: {
    email: string;
    lastName: string;
    businessName: string;
    amount: number;
  };
};

type MemberSubmissionRejectedPayload = {
  type: 'member-submission-rejected';
  payload: {
    email: string;
    lastName: string;
    businessName: string;
    amount: number;
    adminNote?: string;
  };
};

type NotificationPayload =
  | AdminNewSubmissionPayload
  | MemberSubmissionReceivedPayload
  | MemberSubmissionApprovedPayload
  | MemberSubmissionRejectedPayload;

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

function buildButton(label: string, href: string) {
  return `
    <p style="margin: 28px 0;">
      <a
        href="${href}"
        style="display: inline-block; background: #0f4fd6; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: 700;"
      >${label}</a>
    </p>
  `;
}

function wrapEmail(params: {
  title: string;
  intro?: string;
  greeting?: string;
  details?: string;
  body: string[];
  ctaLabel: string;
  ctaUrl: string;
}) {
  const bodyHtml = params.body.map((line) => `<p style="margin: 0 0 16px;">${line}</p>`).join('');

  return `
    <div style="font-family: Arial, sans-serif; padding: 24px; color: #14213d; line-height: 1.6;">
      <h2 style="color: #0f4fd6; margin: 0 0 20px;">${params.title}</h2>
      ${params.greeting ? `<p style="margin: 0 0 16px;">${params.greeting}</p>` : ''}
      ${params.intro ? `<p style="margin: 0 0 16px;">${params.intro}</p>` : ''}
      ${params.details ? `<div style="margin: 0 0 16px;">${params.details}</div>` : ''}
      ${bodyHtml}
      ${buildButton(params.ctaLabel, params.ctaUrl)}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="font-size: 12px; color: #667085; margin: 0;">Black Spend Initiative<br />Kappa Upsilon Sigma Chapter</p>
    </div>
  `;
}

function formatAmount(amount: number) {
  return `$${Number(amount || 0).toLocaleString()}`;
}

function buildEmail(payload: NotificationPayload, adminEmail: string) {
  const appUrl = getAppUrl();

  if (payload.type === 'admin-new-submission') {
    const memberName = escapeHtml(payload.payload.memberName.trim());
    const businessName = escapeHtml(payload.payload.businessName.trim());
    const amount = formatAmount(payload.payload.amount);

    return {
      to: adminEmail,
      subject: 'New receipt submission awaiting review',
      html: wrapEmail({
        title: 'New receipt submission awaiting review',
        intro: 'A new receipt has been submitted and is ready for review.',
        details: `
          <ul style="list-style: none; padding: 0; margin: 0 0 16px;">
            <li><strong>Member:</strong> ${memberName}</li>
            <li><strong>Business:</strong> ${businessName}</li>
            <li><strong>Amount:</strong> ${amount}</li>
          </ul>
        `,
        body: ['Please review it in the admin dashboard.'],
        ctaLabel: 'Review Submission',
        ctaUrl: `${appUrl}/admin/submissions`,
      }),
    };
  }

  const recipientEmail = escapeHtml(payload.payload.email.trim());
  const businessName = escapeHtml(payload.payload.businessName.trim());
  const amount = formatAmount(payload.payload.amount);
  const greeting = buildGreeting(payload.payload.lastName);

  if (payload.type === 'member-submission-received') {
    return {
      to: recipientEmail,
      subject: 'We received your receipt submission',
      html: wrapEmail({
        title: 'We received your receipt submission',
        greeting,
        body: [
          `Your receipt for <strong>${businessName}</strong> in the amount of <strong>${amount}</strong> has been submitted successfully and is now pending review.`,
          'We’ll email you again once a decision has been made.',
        ],
        ctaLabel: 'View My Submissions',
        ctaUrl: `${appUrl}/my-submissions`,
      }),
    };
  }

  if (payload.type === 'member-submission-approved') {
    return {
      to: recipientEmail,
      subject: 'Your receipt was approved',
      html: wrapEmail({
        title: 'Your receipt was approved',
        greeting,
        body: [
          `Your receipt for <strong>${businessName}</strong> in the amount of <strong>${amount}</strong> has been approved.`,
          'Thank you for contributing to the chapter’s impact.',
        ],
        ctaLabel: 'View My Submissions',
        ctaUrl: `${appUrl}/my-submissions`,
      }),
    };
  }

  const adminNote = (payload.payload.adminNote ?? '').trim();
  const rejectionBody = [
    `Your receipt for <strong>${businessName}</strong> in the amount of <strong>${amount}</strong> was not approved.`,
  ];

  if (adminNote) {
    rejectionBody.push(`<strong>Reason:</strong> ${escapeHtml(adminNote)}`);
  }

  rejectionBody.push('Please review your submission and submit a new receipt if needed.');

  return {
    to: recipientEmail,
    subject: 'Your receipt needs attention',
    html: wrapEmail({
      title: 'Your receipt needs attention',
      greeting,
      body: rejectionBody,
      ctaLabel: 'Review My Submission',
      ctaUrl: `${appUrl}/my-submissions`,
    }),
  };
}

function validatePayload(payload: NotificationPayload) {
  switch (payload.type) {
    case 'admin-new-submission':
      return Boolean(
        payload.payload.memberName?.trim() &&
        payload.payload.businessName?.trim() &&
        Number.isFinite(Number(payload.payload.amount))
      );
    case 'member-submission-received':
    case 'member-submission-approved':
      return Boolean(
        payload.payload.email?.trim() &&
        payload.payload.businessName?.trim() &&
        Number.isFinite(Number(payload.payload.amount))
      );
    case 'member-submission-rejected':
      return Boolean(
        payload.payload.email?.trim() &&
        payload.payload.businessName?.trim() &&
        Number.isFinite(Number(payload.payload.amount))
      );
  }
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
