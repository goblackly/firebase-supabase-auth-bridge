# send-password-reset-email

Supabase Edge Function for branded password reset emails sent through Resend.

This function generates a Firebase password-reset action link on the backend and
emails it using your Black Spend copy and branding.

## Required secrets

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_URL` optional, defaults to `https://blackspend.pbskus.net`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` optional, used to personalize the greeting with the member's last name

## Deploy

```bash
npx supabase functions deploy send-password-reset-email --project-ref gwstquyzlpngwghjmtcj --no-verify-jwt
```

This function is intentionally public because forgot-password must work before a
user is signed in.
