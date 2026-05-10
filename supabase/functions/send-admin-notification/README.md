# send-admin-notification

Supabase Edge Function for authenticated app-event emails:

- admin alert for new receipt submission
- member confirmation for receipt submitted
- member approval email
- member rejection email

## Required secrets

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ADMIN_EMAIL` optional, defaults to `info@goblackly.com`
- `APP_URL` optional, defaults to `https://blackspend.pbskus.net`

## Deploy

```bash
npx supabase functions deploy send-admin-notification --project-ref gwstquyzlpngwghjmtcj
```

JWT verification should stay enabled for this function.
