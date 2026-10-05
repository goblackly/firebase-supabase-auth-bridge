import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingReceiptPicker,
  clearReceiptDraft,
  getReceiptDraftStorageKey,
  loadPendingReceiptPicker,
  loadReceiptDraft,
  restoreReceiptDraft,
  savePendingReceiptPicker,
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

test('migrates legacy drafts to the stable auth ID without resurrecting discarded drafts', () => {
  installWindow(new MemoryStorage());
  const draft = makeDraft();
  draft.formData.businessId = 'business-1';
  draft.formData.businessVersion = '2026-10-05T12:00:00Z';
  saveReceiptDraft('legacy-uid', draft);
  assert.deepEqual(restoreReceiptDraft('auth-id', 'legacy-uid'), draft);
  assert.equal(loadReceiptDraft('legacy-uid'), null);
  clearReceiptDraft('auth-id');
  assert.equal(restoreReceiptDraft('auth-id', 'legacy-uid'), null);
  restoreWindow();
});

test('prefers the current auth-ID draft over an older legacy copy', () => {
  installWindow(new MemoryStorage());
  saveReceiptDraft('legacy-uid', makeDraft());
  const current = makeDraft();
  current.formData.businessName = 'Current business';
  saveReceiptDraft('auth-id', current);
  assert.deepEqual(restoreReceiptDraft('auth-id', 'legacy-uid'), current);
  assert.equal(loadReceiptDraft('legacy-uid'), null);
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

test('saves and clears pending picker handoff state', () => {
  installWindow(new MemoryStorage());

  savePendingReceiptPicker('user-1', {
    source: 'camera',
    openedAt: '2026-05-25T12:30:00.000Z',
  });

  assert.deepEqual(loadPendingReceiptPicker('user-1'), {
    source: 'camera',
    openedAt: '2026-05-25T12:30:00.000Z',
  });

  clearPendingReceiptPicker('user-1');
  assert.equal(loadPendingReceiptPicker('user-1'), null);
  restoreWindow();
});
