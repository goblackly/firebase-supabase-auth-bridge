const ONE_MB = 1024 * 1024;
export const MAX_RECEIPT_FILE_SIZE_BYTES = 5 * ONE_MB;
const IMAGE_COMPRESSION_TARGET_BYTES = 4.5 * ONE_MB;
const IMAGE_COMPRESSION_MAX_DIMENSION = 2200;
const MIN_IMAGE_QUALITY = 0.55;
const INITIAL_IMAGE_QUALITY = 0.82;

type FileLike = {
  name: string;
  type: string;
  size: number;
};

type CompressionResult = {
  file: File;
  notice?: string;
};

function isPdf(file: FileLike): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImage(file: FileLike): boolean {
  return file.type.startsWith('image/');
}

function isSupportedReceiptFile(file: FileLike): boolean {
  return isPdf(file) || isImage(file);
}

export function formatFileSize(bytes: number): string {
  if (bytes >= ONE_MB) {
    return `${(bytes / ONE_MB).toFixed(bytes >= 10 * ONE_MB ? 0 : 1)} MB`;
  }

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function getReceiptFileValidationError(file: FileLike): string | null {
  if (!isSupportedReceiptFile(file)) {
    return 'Please upload a JPG, PNG, HEIC, WEBP, GIF, or PDF receipt file.';
  }

  if (isPdf(file) && file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    return `PDF receipts must be 5 MB or smaller. Your file is ${formatFileSize(file.size)}.`;
  }

  if (isImage(file) && file.size > 20 * ONE_MB) {
    return `This image is too large to process on mobile. Please choose a file under 20 MB.`;
  }

  return null;
}

function scaleDimensions(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const scale = Math.min(maxDimension / width, maxDimension / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Unable to read this image on your device.'));
      img.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function compressImageFile(file: File): Promise<File> {
  const image = await loadImageFromFile(file);
  const { width, height } = scaleDimensions(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    IMAGE_COMPRESSION_MAX_DIMENSION,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Your browser could not prepare this image for upload.');
  }

  context.drawImage(image, 0, 0, width, height);

  let quality = INITIAL_IMAGE_QUALITY;
  let output = await canvasToBlob(canvas, quality);

  while (output.size > IMAGE_COMPRESSION_TARGET_BYTES && quality > MIN_IMAGE_QUALITY) {
    quality = Math.max(MIN_IMAGE_QUALITY, quality - 0.1);
    output = await canvasToBlob(canvas, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';
  const compressedName = `${baseName}.jpg`;
  return new File([output], compressedName, { type: 'image/jpeg' });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('We could not prepare your image for upload.'));
          return;
        }

        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function prepareReceiptFile(file: File): Promise<CompressionResult> {
  const validationError = getReceiptFileValidationError(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (isPdf(file)) {
    return { file };
  }

  if (file.size <= MAX_RECEIPT_FILE_SIZE_BYTES) {
    return { file };
  }

  const compressedFile = await compressImageFile(file);

  if (compressedFile.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
    throw new Error(
      `We compressed your photo, but it is still too large to upload. Please choose an image under 5 MB.`,
    );
  }

  return {
    file: compressedFile,
    notice: `Large photo optimized for upload. New size: ${formatFileSize(compressedFile.size)}.`,
  };
}

export function mapReceiptSubmissionError(err: unknown): string {
  const errorName = String((err as { name?: string } | null)?.name ?? '').toLowerCase();
  const errorMessage = String((err as { message?: string } | null)?.message ?? '').toLowerCase();

  if (errorMessage.includes('timed out') || errorMessage.includes('network')) {
    return 'The upload took too long on this connection. Please try again on a stronger or less slow connection, or use a smaller image.';
  }

  if (errorName.includes('storageapierror') || errorMessage.includes('storage')) {
    return 'We could not upload your receipt image. Please try again, switch to a smaller file, or check your connection.';
  }

  if (errorMessage.includes('row-level security') || errorMessage.includes('permission')) {
    return 'Your receipt could not be saved right now. Please try again in a moment, and contact support if it keeps happening.';
  }

  return (err as { message?: string } | null)?.message || 'We could not submit your receipt right now. Please try again.';
}
