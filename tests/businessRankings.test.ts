import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditBusinesses, groupBusinesses, rankBusinesses, rankingsCsv, reconciliation, csvCell,
  type BusinessReceipt, type BusinessSnapshot, type RegistryBusiness } from '../src/services/businessRankings';

const receipt = (id: string, changes: Partial<BusinessReceipt> = {}): BusinessReceipt => ({ id, user_id: 'member-1', business_id: null,
  business_name: 'Kitchen', business_address: '10 Main', city: 'Newark', state: 'NJ', zip_code: '07101',
  receipt_date: '2026-09-30', amount_spent: 10, status: 'approved', category: 'Restaurant', legacy_ownership: 'yes', duplicate_flag: false, ...changes });
const business: RegistryBusiness = { id: 'b1', business_name: 'Canonical Kitchen', business_address: '10 Main', city: 'Newark', state: 'NJ',
  zip_code: '07101', ownership_status: 'unverified', sigma_owned: null, verification_note: null, updated_at: '2026-10-05' };
const snapshot = (submissions: BusinessReceipt[], businesses: RegistryBusiness[] = []): BusinessSnapshot => ({ generated_at: '', submissions, businesses,
  year_totals: [{ year: 2026, total: submissions.filter(r => r.status === 'approved' && r.receipt_date.startsWith('2026')).reduce((n, r) => n + r.amount_spent, 0),
    receipts: submissions.filter(r => r.status === 'approved' && r.receipt_date.startsWith('2026')).length }] });

test('variants and branches never merge until explicitly linked; every cent reconciles', () => {
  const s = snapshot([receipt('1'), receipt('2', { business_name: 'KITCHEN' }), receipt('3', { city: 'Camden', business_address: '99 Main' })]);
  assert.equal(rankBusinesses(s, 2026).length, 3);
  assert.equal(auditBusinesses(s).groups[0].suggestions.length, 2);
  assert.equal(reconciliation(s, 2026).matches, true);
  s.submissions[0].business_id = 'b1'; s.submissions[1].business_id = 'b1'; s.businesses = [business];
  assert.equal(rankBusinesses(s, 2026).length, 2);
  assert.equal(rankBusinesses(s, 2026)[0].cents, 2000);
  assert.equal(s.submissions[1].business_name, 'KITCHEN');
  assert.equal(reconciliation(s, 2026).matches, true);
});
test('year uses receipt date and excludes pending/rejected; member IDs determine unique brothers', () => {
  const s = snapshot([receipt('1'), receipt('2', { user_id: 'member-2' }), receipt('3', { status: 'pending' }),
    receipt('4', { status: 'rejected' }), receipt('5', { receipt_date: '2025-12-31' }), receipt('6', { receipt_date: '2027-01-01' })]);
  const ranks = rankBusinesses(s, 2026);
  assert.equal(ranks[0].cents, 2000); assert.equal(ranks[0].members, 2); assert.equal(ranks[0].receipts.length, 2);
  assert.equal(rankBusinesses(s, 2025)[0].cents, 1000);
  assert.equal(reconciliation(s, 2026).matches, true);
});
test('legacy ownership does not verify businesses, approved duplicates remain included', () => {
  const s = snapshot([receipt('1', { business_id: 'b1', duplicate_flag: true }), receipt('2', { business_id: 'b1' })], [business]);
  assert.equal(rankBusinesses(s, 2026)[0].business?.ownership_status, 'unverified');
  assert.equal(auditBusinesses(s).groups[0].duplicateReceipts.length, 2);
  assert.equal(rankBusinesses(s, 2026)[0].cents, 2000);
  assert.match(rankingsCsv(s, 2026), /Pending verification/);
});
test('ties have shared competition ranks and deterministic name order; currency sums exact cents', () => {
  const s = snapshot([receipt('1', { business_name: 'Z', amount_spent: 0.1 }), receipt('2', { business_name: 'Z', amount_spent: 0.2 }),
    receipt('3', { business_name: 'A', amount_spent: 0.3 }), receipt('4', { business_name: 'B', amount_spent: 0.01 })]);
  const ranks = rankBusinesses(s, 2026);
  assert.deepEqual(ranks.map(r => [r.name, r.rank, r.tied]), [['A', 1, true], ['Z', 1, true], ['B', 3, false]]);
  assert.equal(reconciliation(s, 2026).cents, 61);
});
test('audit flags missing locations, dates, members and invalid amounts', () => {
  const s = snapshot([receipt('1', { city: null, state: null, receipt_date: '2026-02-30', user_id: '', amount_spent: -1 })]);
  const audit = auditBusinesses(s);
  assert.equal(audit.invalidDates.length, 1); assert.equal(audit.badAmounts.length, 1); assert.equal(audit.missingMembers.length, 1);
  assert.equal(audit.groups[0].missingLocation, true); assert.equal(reconciliation(s, 2026).matches, false);
});
test('CSV safely quotes punctuation, multiline values, and spreadsheet formulas', () => {
  assert.equal(csvCell('WCM, "LLC"\nBranch'), '"WCM, ""LLC""\nBranch"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  const s = snapshot([receipt('1', { business_name: 'WCM Digital, LLC' })]);
  assert.match(rankingsCsv(s, 2026), /"WCM Digital, LLC"/);
  assert.match(rankingsCsv(s, 2026), /"10.00"/);
});
test('empty years and orphaned matches do not lose unmatched spending', () => {
  const s = snapshot([receipt('1', { business_id: 'missing' })]);
  assert.equal(groupBusinesses(s)[0].business, null);
  assert.equal(reconciliation(s, 2026).matches, true);
  assert.equal(reconciliation(s, 2024).matches, true);
});
