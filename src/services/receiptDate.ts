// Receipt dates are calendar dates, not UTC timestamps.
export function receiptPeriod(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return { year, month };
}

export function formatReceiptDate(value: string): string {
  const period = receiptPeriod(value);
  if (!period) return 'Invalid receipt date';
  return `${period.month}/${Number(value.slice(8, 10))}/${period.year}`;
}

export function localCalendarDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
