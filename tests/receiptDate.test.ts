import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReceiptDate, receiptPeriod, localCalendarDate } from '../src/services/receiptDate';

test('month allocation uses receipt date despite later approval', () => {
  const submission = { receipt_date: '2026-08-31', updated_at: '2026-11-01T12:00:00Z' };
  assert.deepEqual(receiptPeriod(submission.receipt_date), { year: 2026, month: 8 });
  assert.equal(formatReceiptDate('2026-10-01'), '10/1/2026');
  assert.deepEqual(receiptPeriod('2027-01-01'), { year: 2027, month: 1 });
});

test('invalid calendar dates cannot be silently rolled forward', () => {
  assert.equal(receiptPeriod('2026-02-30'), null);
  assert.equal(receiptPeriod('2026-13-01'), null);
  assert.equal(receiptPeriod(''), null);
});

test('default input date follows local calendar', () => {
  assert.equal(localCalendarDate(new Date(2026, 8, 30, 23, 59)), '2026-09-30');
});
