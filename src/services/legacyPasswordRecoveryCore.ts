export type LegacyPasswordClassification =
  | 'preserve-current-supabase-password'
  | 'eligible-for-firebase-password-restore'
  | 'manual-review'
  | 'not-migrated';

export type LegacyPasswordRepairAction = 'retry-supabase-login' | 'reset-password' | 'none';

export type LegacyPasswordRepairResponse = {
  ok: boolean;
  repaired: boolean;
  classification: LegacyPasswordClassification;
  action: LegacyPasswordRepairAction;
  reason?: string;
  publicUserExists?: boolean;
  authUserExists?: boolean;
};

export function isInvalidCredentialsError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  const code = String((error as { code?: string } | null)?.code ?? '').toLowerCase();
  const name = String((error as { name?: string } | null)?.name ?? '').toLowerCase();

  return (
    code.includes('invalid_credentials') ||
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    name.includes('authapierror')
  );
}

export function buildLoginErrorMessage(
  error: unknown,
  repair?: LegacyPasswordRepairResponse | null,
): string {
  const message = String((error as { message?: string } | null)?.message ?? '');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return 'Too many login attempts. Please wait a few minutes and try again.';
  }

  if (repair?.repaired) {
    return 'Your password was restored successfully. Please try signing in again.';
  }

  if (repair?.action === 'reset-password') {
    return 'Your account needs a password refresh after the migration. Please use Forgot Password to finish signing in.';
  }

  if (repair?.classification === 'not-migrated' || isInvalidCredentialsError(error)) {
    return 'Those credentials did not match our records. Please check your password or use Forgot Password.';
  }

  return message || 'Failed to login. Please check your credentials.';
}
