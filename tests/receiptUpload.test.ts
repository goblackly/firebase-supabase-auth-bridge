import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECEIPT_FILE_SIZE_BYTES,
  getReceiptFileValidationError,
  mapReceiptSubmissionError,
} from '../src/services/receiptUpload';

function makeFileLike(overrides: Partial<{ name: string; type: string; size: number }>) {
  return {
    name: overrides.name ?? 'receipt.jpg',
    type: overrides.type ?? 'image/jpeg',
    size: overrides.size ?? 1024,
  };
}

test('accepts supported small image files', () => {
  const error = getReceiptFileValidationError(makeFileLike({}));
  assert.equal(error, null);
});

test('rejects oversized pdf files', () => {
  const error = getReceiptFileValidationError(
    makeFileLike({
      name: 'receipt.pdf',
      type: 'application/pdf',
      size: MAX_RECEIPT_FILE_SIZE_BYTES + 1,
    }),
  );

  assert.match(error ?? '', /PDF/i);
  assert.match(error ?? '', /5 MB/i);
});

test('rejects unsupported file types', () => {
  const error = getReceiptFileValidationError(
    makeFileLike({
      name: 'receipt.txt',
      type: 'text/plain',
    }),
  );

  assert.match(error ?? '', /JPG/i);
});

test('maps storage failures to a mobile-friendly retry message', () => {
  const message = mapReceiptSubmissionError({
    name: 'StorageApiError',
    message: 'new row violates row-level security policy',
  });

  assert.match(message, /upload your receipt/i);
  assert.match(message, /try again/i);
});

test('maps timeout failures to connection guidance', () => {
  const message = mapReceiptSubmissionError(new Error('Storage upload timed out. Please check your connection.'));

  assert.match(message, /slow/i);
});
