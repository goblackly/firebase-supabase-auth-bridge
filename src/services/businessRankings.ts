import { receiptPeriod } from './receiptDate';

export type OwnershipStatus = 'unverified' | 'verified_black_owned' | 'not_black_owned';
export interface RegistryBusiness {
  id: string;
  business_name: string;
  business_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  ownership_status: OwnershipStatus;
  sigma_owned: boolean | null;
  verification_note: string | null;
  updated_at: string;
}
export interface BusinessReceipt {
  id: string;
  user_id: string;
  business_id: string | null;
  business_name: string;
  business_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  receipt_date: string;
  amount_spent: number;
  status: string;
  category: string;
  legacy_ownership: string;
  duplicate_flag: boolean;
}
export interface BusinessSnapshot {
  generated_at: string;
  businesses: RegistryBusiness[];
  submissions: BusinessReceipt[];
  year_totals: { year: number; total: number; receipts: number }[];
}
export interface BusinessGroup {
  key: string;
  business: RegistryBusiness | null;
  name: string;
  location: string;
  receipts: BusinessReceipt[];
}
export interface BusinessRank extends BusinessGroup {
  cents: number;
  members: number;
  rank: number;
  tied: boolean;
}
export const ownershipLabels: Record<OwnershipStatus, string> = {
  unverified: 'Unverified', verified_black_owned: 'Verified Black-Owned', not_black_owned: 'Not Black-Owned',
};

// Normalization suggests review only. It must never decide identity or merge receipts.
export function suggestName(name: string): string {
  return name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(?:llc|incorporated|inc|ltd)$/, '');
}
export function rawBusinessKey(r: BusinessReceipt): string {
  return JSON.stringify([r.business_name, r.business_address ?? '', r.city ?? '', r.state ?? '', r.zip_code ?? '']);
}
export function locationLabel(r: Pick<BusinessReceipt, 'business_address' | 'city' | 'state' | 'zip_code'>): string {
  return [r.business_address, r.city, r.state, r.zip_code].filter(Boolean).join(', ') || 'Location not provided';
}
export function groupBusinesses(snapshot: BusinessSnapshot): BusinessGroup[] {
  const registry = new Map(snapshot.businesses.map(b => [b.id, b]));
  const groups = new Map<string, BusinessGroup>();
  for (const r of snapshot.submissions) {
    const business = r.business_id ? registry.get(r.business_id) : null;
    const key = business ? `matched:${business.id}` : `unmatched:${rawBusinessKey(r)}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, business: business ?? null, name: business?.business_name || r.business_name || 'Unnamed business',
        location: locationLabel(business ?? r), receipts: [] };
      groups.set(key, group);
    }
    group.receipts.push(r);
  }
  return [...groups.values()];
}
export function rankBusinesses(snapshot: BusinessSnapshot, year: number): BusinessRank[] {
  const ranks = groupBusinesses(snapshot).map(group => {
    const receipts = group.receipts.filter(r => r.status === 'approved' && receiptPeriod(r.receipt_date)?.year === year);
    return { ...group, receipts, cents: receipts.reduce((n, r) => n + Math.round(Number(r.amount_spent) * 100), 0),
      members: new Set(receipts.map(r => r.user_id).filter(Boolean)).size, rank: 0, tied: false };
  }).filter(r => r.receipts.length > 0)
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name) || a.location.localeCompare(b.location) || a.key.localeCompare(b.key));
  ranks.forEach((r, i) => {
    r.rank = i > 0 && ranks[i - 1].cents === r.cents ? ranks[i - 1].rank : i + 1;
    r.tied = ranks.some((other, j) => j !== i && other.cents === r.cents);
  });
  return ranks;
}
export function reconciliation(snapshot: BusinessSnapshot, year: number) {
  const ranks = rankBusinesses(snapshot, year);
  const expected = snapshot.year_totals.find(t => Number(t.year) === year);
  const cents = ranks.reduce((sum, r) => sum + r.cents, 0);
  const receipts = ranks.reduce((sum, r) => sum + r.receipts.length, 0);
  return { cents, receipts, expectedCents: Math.round(Number(expected?.total ?? 0) * 100),
    matches: cents === Math.round(Number(expected?.total ?? 0) * 100) && receipts === Number(expected?.receipts ?? 0) };
}
export function auditBusinesses(snapshot: BusinessSnapshot) {
  const groups = groupBusinesses(snapshot);
  const invalidDates = snapshot.submissions.filter(r => !receiptPeriod(r.receipt_date));
  const badAmounts = snapshot.submissions.filter(r => !Number.isFinite(Number(r.amount_spent)) || Number(r.amount_spent) < 0);
  const missingMembers = snapshot.submissions.filter(r => !r.user_id);
  const duplicateKeys = new Map<string, BusinessReceipt[]>();
  for (const r of snapshot.submissions) {
    const key = JSON.stringify([r.user_id, r.receipt_date, Math.round(Number(r.amount_spent) * 100), rawBusinessKey(r)]);
    duplicateKeys.set(key, [...(duplicateKeys.get(key) ?? []), r]);
  }
  const duplicateIds = new Set([...duplicateKeys.values()].filter(rs => rs.length > 1).flat().map(r => r.id));
  return { invalidDates, badAmounts, missingMembers, groups: groups.map(g => ({ ...g,
    suggestions: groups.filter(other => other.key !== g.key && suggestName(other.name) !== '' && suggestName(other.name) === suggestName(g.name))
      .map(other => ({ key: other.key, name: other.name, location: other.location })),
    missingLocation: g.receipts.some(r => !r.city?.trim() || !r.state?.trim()),
    duplicateReceipts: g.receipts.filter(r => r.duplicate_flag || duplicateIds.has(r.id)),
    invalidDates: g.receipts.filter(r => !receiptPeriod(r.receipt_date)),
  })) };
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Spreadsheet formula injection is independent of correct CSV quoting.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function rankingsCsv(snapshot: BusinessSnapshot, year: number): string {
  const rows: unknown[][] = [['Year', 'Rank', 'Tied', 'Business', 'Location', 'Total Spend', 'Approved Receipts',
    'Distinct Members', 'Match Status', 'Ownership', 'Award Eligibility', 'Sigma-Owned', 'Duplicate Review']];
  for (const r of rankBusinesses(snapshot, year)) rows.push([year, r.rank, r.tied ? 'Yes' : 'No', r.name, r.location,
    (r.cents / 100).toFixed(2), r.receipts.length, r.members, r.business ? 'Matched' : 'Unmatched',
    ownershipLabels[r.business?.ownership_status ?? 'unverified'],
    r.business?.ownership_status === 'verified_black_owned' ? 'Ownership verified; final admin review required' :
      r.business?.ownership_status === 'not_black_owned' ? 'Not eligible' : 'Pending verification',
    r.business?.sigma_owned == null ? 'Unknown' : r.business.sigma_owned ? 'Yes' : 'No',
    auditBusinesses(snapshot).groups.find(g => g.key === r.key)?.duplicateReceipts.length ?? 0]);
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
