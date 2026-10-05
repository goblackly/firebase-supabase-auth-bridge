# Business Directory And Live Demo Rollout

## Status

Implementation is on `codex/live-business-directory-demo`. Frontend release is pending.
The directory/demo migration and conservative complete-address follow-up were
applied through the Supabase browser SQL editor. All five required Edge Functions
are deployed; password recovery and account creation were updated in the browser.
Historical linking completed for complete exact branch identities, with an
in-transaction assertion that original receipt fields remained unchanged.
After linking, 38 approved receipts have business references; approved 2026
spending remains 97 receipts and $21,938.20.
Do not deploy the frontend before the database migration and Edge Functions.
The read-only production baseline on October 5, 2026 was 97 approved 2026
receipts totaling $21,938.20, with zero canonical business records. Refresh
this baseline at rollout because brothers can submit and approve receipts.

## Rollout Order

1. Confirm the restricted demo access: real aggregate reporting, participant
   names and business information only, never real receipt files or private contacts.
2. Apply `20261006_000006_directory_demo.sql` transactionally. Verify storage
   bucket `receipts` is private; a public bucket bypasses authenticated read policies.
3. Deploy `admin-create-user`, `send-account-email`, `send-admin-notification`,
   `send-password-reset-email`, and `cleanup-demo`, including `_shared/demoSafety.ts`.
   Preserve existing server secrets. Never expose service-role keys in Vite variables.
4. Compare approved totals and counts grouped by receipt year before and after.
   No financial fields are intentionally changed by this migration.
5. Run the read-only historical preview. Apply only complete exact identities
   after reviewing it. Missing street addresses remain unmatched. Confirm
   totals again and inspect the business directory inclusion set.
   Address identifiers must contain both letters and a number and cannot repeat
   the business name. Populated but incomplete addresses stay in review.
6. Deploy the app to the existing Black Spend Vercel project. Verify the custom
   domain, not only deployment readiness or its preview URL.
7. Create the two dedicated accounts through full-admin Demo Accounts with their
   restricted modes at creation. Set credentials privately using an invitation
   at an email address the operator can receive.
   Sign out/in after a designation. Do not distribute credentials before tests.

## Acceptance Checklist

- Real member selects an existing branch; contact/location fields populate.
- New business requires name, city and state; shared phones never merge branches.
- Two concurrent complete exact creations reuse one canonical business.
- Similar names, different addresses and missing addresses stay separate.
- A changed selected business requests reselection without losing the draft.
- Android camera/files handoff restores business fields and requires file reselection.
- Approved real receipts appear in directory; pending, rejected and demo receipts do not.
- Ownership is unverified until separately reviewed; Sigma ownership is independent.
- Rankings and chapter reports reconcile, including unmatched and duplicate candidates.
- Approval after month/year end remains attributed to the receipt date.
- CSV downloads quote commas/newlines/quotes and protect spreadsheet formula cells.
- Demo member can submit only for their own account; demo admin can review only demo receipts.
- Direct demo API calls cannot change real receipts, accounts, roles, goals or business records.
- Demo reads cannot access real storage files, contact information or notes.
- Demo approvals do not change real spending, participation counts or leaderboards.
- Demo emails are labeled and sent only to their demo recipient; chapter alerts are suppressed.
- Full admin can archive demo receipts and remove only their files; cleanup is retryable.
- Historical linking and consolidation preserve raw details; consolidation Undo survives reload.

## Recovery

Business consolidation logs source, target and affected receipt IDs in
`business_review_history`. `undo_business_consolidation` restores unchanged
references and fails safely if another review has changed them. Historical
links log each old/new reference; admins can unlink them without touching
amounts, dates or statuses. Cleanup archives receipts rather than deleting
their audit trail; file removal is irreversible and the UI requires explicit
confirmation. Real-file references stop cleanup.

Roll back the frontend independently if necessary; retain the additive schema
and audit history rather than dropping production columns or tables.

## Validation Boundaries

Local PostgreSQL tests cover migration execution, exact matching, branch
separation, missing-address separation, demo RLS, real totals, consolidation
undo, archiving, and anonymous denial. Browser/device handoff, actual concurrent
transactions, live email delivery, production permissions and CSV downloads
still require the live acceptance checks. Dependency audit reported 17
vulnerabilities during development installation; remediation is not verified.
