# Business Rankings And Audit

## Live audit baseline: October 5, 2026

Read-only SQL audit of Supabase project `gwstquyzlpngwghjmtcj`:

- 105 submissions, 96 approved; approved 2026 total $21,919.01.
- 94 distinct submitted names; 49 receipts missing city or state.
- No missing receipt dates or member IDs; no stored duplicate flags.
- Existing `businesses` table has no records. It is left untouched.
- Seven punctuation/case variants: Go Black Own LLC / Go Black Own, LLC;
  Hair by Marion / Hair By Marion; Headliners Barber Shop / Headliners Barbershop;
  kUS / Kus; KUS merch / KUS Merch; KUS Strong / KUSStrong;
  Marry me Kitchen / Marry Me Kitchen.
- Legacy ownership answers: 42 yes, 63 no. The form asked Sigma ownership;
  none of these are automatically treated as Black ownership verification.
- Submitted-name examples are draft, not final rankings: Marry Me Kitchen,
  Newark $4,010.45 plus variant Marry me Kitchen $476.10; they remain separate
  until an admin verifies identity and branch.

## Operator workflow

Open `/admin/businesses`. The report defaults to the current calendar year;
all approved receipts count by receipt date. Unmatched entries are grouped by
exact original name and location, not fuzzy name. Select a receipt subset to
create an unverified branch or attach it to an existing registry record.
Repeat for confirmed variants; different branches stay separate.
Use Return Selected to Unmatched to reverse a wrong match. All reviews are
recorded in `business_review_history`; original details stay on submissions.

Ownership review is separate: a verified/not-Black determination requires a
source note. Sigma ownership has its own unknown/yes/no value. The report
includes unverified and not-Black businesses but clearly labels eligibility.
It does not select or announce award winners.

Export Rankings CSV is enabled only when counts and cents reconcile to the
database snapshot and approved receipts have valid dates, amounts, and member
IDs. CSV quotes all fields and neutralizes spreadsheet formula prefixes.
Export Audit includes review suggestions and source IDs; it is admin-only.

## Deployment and validation

1. Run `supabase/audits/business_audit.sql` read-only for baseline totals.
2. Apply `supabase/migrations/20261005_000005_business_rankings.sql` once.
   It is additive; no historical business matches or verification backfills.
3. Run `supabase/tests/business_rankings.sql`. This transaction rolls back all
   test links, registry records, verification changes, and inserted receipts.
4. Run `npm run lint`, `npm run build`, and
   `TZ=America/New_York node --import tsx --test tests/*.test.ts`.
5. Verify the custom-domain route, reconciliation card, audit suggestions,
   empty-year behavior, original reports, and downloaded CSV after deployment.

Rollback: revert the frontend release, leaving additive tables/column in place
to preserve review history. Do not drop data or restore an older receipt dump.
The member receipt form is unchanged. Registry/history have admin-only RLS;
RPCs check the existing admin role and reject stale match/review writes.
The snapshot uses a single database transaction and returns minimal reporting
data, avoiding receipt file access and client pagination limits.

Directory publishing, phone/website fields, public business listings, and
receipt-form business selection are intentionally deferred.
