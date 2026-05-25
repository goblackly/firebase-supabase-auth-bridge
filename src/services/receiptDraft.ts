export type ReceiptDraftFormData = {
  receiptDate: string;
  businessName: string;
  amountSpent: string;
  sigmaMembers: string;
  category: string;
  blackOwned: string;
  city: string;
  state: string;
  businessAddress: string;
  zipCode: string;
  notes: string;
};

export type ReceiptDraftFileMetadata = {
  name: string;
  type: string;
  size: number;
};

export type ReceiptDraft = {
  formData: ReceiptDraftFormData;
  fileMetadata: ReceiptDraftFileMetadata | null;
  updatedAt: string;
};

export type ReceiptPendingPicker = {
  source: 'camera' | 'files';
  openedAt: string;
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getReceiptDraftStorageKey(userKey: string): string {
  return `black-spend:receipt-draft:${userKey}`;
}

function getPendingPickerStorageKey(userKey: string): string {
  return `black-spend:receipt-picker:${userKey}`;
}

export function saveReceiptDraft(userKey: string, draft: ReceiptDraft): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(getReceiptDraftStorageKey(userKey), JSON.stringify(draft));
}

export function loadReceiptDraft(userKey: string): ReceiptDraft | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(getReceiptDraftStorageKey(userKey));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReceiptDraft>;
    if (!parsed.formData || typeof parsed.updatedAt !== 'string') {
      return null;
    }

    return {
      formData: parsed.formData as ReceiptDraftFormData,
      fileMetadata: parsed.fileMetadata ?? null,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function clearReceiptDraft(userKey: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(getReceiptDraftStorageKey(userKey));
}

export function savePendingReceiptPicker(userKey: string, pendingPicker: ReceiptPendingPicker): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(getPendingPickerStorageKey(userKey), JSON.stringify(pendingPicker));
}

export function loadPendingReceiptPicker(userKey: string): ReceiptPendingPicker | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(getPendingPickerStorageKey(userKey));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ReceiptPendingPicker>;
    if (
      (parsed.source !== 'camera' && parsed.source !== 'files') ||
      typeof parsed.openedAt !== 'string'
    ) {
      return null;
    }

    return {
      source: parsed.source,
      openedAt: parsed.openedAt,
    };
  } catch {
    return null;
  }
}

export function clearPendingReceiptPicker(userKey: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(getPendingPickerStorageKey(userKey));
}
