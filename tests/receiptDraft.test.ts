import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearReceiptDraft,
  getReceiptDraftStorageKey,
  loadReceiptDraft,
  saveReceiptDraft,
  type ReceiptDraft,
} from '../src/services/receiptDraft';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const originalWindow = globalThis.window;

function installWindow(storage: Storage) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
}

function restoreWindow() {
  if (typeof originalWindow === 'undefined') {
    delete (globalThis as { window?: Window & typeof globalThis }).window;
    return;
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
}

function makeDraft(): ReceiptDraft {
  return {
    formData: {
      receiptDate: '2026-05-25',
      businessName: 'Test Market',
      amountSpent: '25.50',
      sigmaMembers: '2',
      category: 'Retail',
      blackOwned: 'yes',
      city: 'Philadelphia',
      state: 'PA',
      businessAddress: '123 Main St',
      zipCode: '19104',
      notes: 'Draft note',
    },
    fileMetadata: {
      name: 'receipt.jpg',
      type: 'image/jpeg',
      size: 4096,
    },
    updatedAt: '2026-05-25T12:00:00.000Z',
  };
}

test('saves and loads a receipt draft for a user', () => {
  installWindow(new MemoryStorage());

  const draft = makeDraft();
  saveReceiptDraft('user-1', draft);

  assert.deepEqual(loadReceiptDraft('user-1'), draft);
  restoreWindow();
});

test('clears a saved receipt draft', () => {
  installWindow(new MemoryStorage());

  saveReceiptDraft('user-1', makeDraft());
  clearReceiptDraft('user-1');

  assert.equal(loadReceiptDraft('user-1'), null);
  restoreWindow();
});

test('uses isolated storage keys per user', () => {
  installWindow(new MemoryStorage());

  saveReceiptDraft('user-1', makeDraft());
  saveReceiptDraft('user-2', {
    ...makeDraft(),
    formData: {
      ...makeDraft().formData,
      businessName: 'Another Spot',
    },
  });

  assert.equal(getReceiptDraftStorageKey('user-1'), 'black-spend:receipt-draft:user-1');
  assert.equal(loadReceiptDraft('user-2')?.formData.businessName, 'Another Spot');
  restoreWindow();
});

test('returns null for invalid stored draft payloads', () => {
  const storage = new MemoryStorage();
  installWindow(storage);

  storage.setItem(getReceiptDraftStorageKey('user-1'), '{"broken":true}');

  assert.equal(loadReceiptDraft('user-1'), null);
  restoreWindow();
});
