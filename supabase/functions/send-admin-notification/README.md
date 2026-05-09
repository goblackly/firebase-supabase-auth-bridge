# send-admin-notification

Supabase Edge Function for sending admin emails when:

- a new user registers
- a new receipt submission is created

## Required secrets

Set these in Supabase Edge Function secrets before deploy:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `ADMIN_EMAIL` (optional, defaults to `info@goblackly.com`)

## Deploy

Recommended default:

```bash
npx supabase functions deploy send-admin-notification --project-ref gwstquyzlpngwghjmtcj
```

This keeps JWT verification enabled.

## Important note about brand-new signups

The app currently bridges Firebase Auth into Supabase using Firebase ID tokens.
If a newly registered user does not yet have the required Firebase custom role
claim for Supabase, the registration notification may be best-effort until that
claim is added automatically at signup time.

If you choose to prioritize signup notification delivery over endpoint
protection, you can deploy without JWT verification:

```bash
npx supabase functions deploy send-admin-notification --project-ref gwstquyzlpngwghjmtcj --no-verify-jwt
```

Only use that mode if you accept that the endpoint becomes publicly callable.
