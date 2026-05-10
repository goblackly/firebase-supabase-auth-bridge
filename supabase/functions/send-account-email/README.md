# send-account-email

Supabase Edge Function for public account emails:

- member welcome email after registration
- admin alert when a new member registers

## Required secrets

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ADMIN_EMAIL` optional, defaults to `info@goblackly.com`
- `APP_URL` optional, defaults to `https://blackspend.pbskus.net`

## Deploy

```bash
npx supabase functions deploy send-account-email --project-ref gwstquyzlpngwghjmtcj --no-verify-jwt
```

This function is intentionally public so brand-new registrations can send email
before any authenticated Supabase role claim is guaranteed.
