# send-password-reset-email

Supabase Edge Function for branded password reset and account invitation emails sent through Resend.

This function generates a Supabase recovery or invitation link on the backend and
emails it using your Black Spend copy and branding.

## Required secrets

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_URL` optional, defaults to `https://blackspend.pbskus.net`
- `APP_SUPABASE_SERVICE_ROLE_KEY`

## Deploy

```bash
npx supabase functions deploy send-password-reset-email --project-ref gwstquyzlpngwghjmtcj --no-verify-jwt
```

This function is intentionally public because forgot-password must work before a
user is signed in.
