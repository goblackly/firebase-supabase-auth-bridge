import { supabase } from '../supabase';
export {
  buildLoginErrorMessage,
  isInvalidCredentialsError,
  type LegacyPasswordClassification,
  type LegacyPasswordRepairAction,
  type LegacyPasswordRepairResponse,
} from './legacyPasswordRecoveryCore';
import type { LegacyPasswordRepairResponse } from './legacyPasswordRecoveryCore';

export async function attemptLegacyPasswordRepair(
  email: string,
  password: string,
  supabaseErrorCode?: string,
): Promise<LegacyPasswordRepairResponse | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.functions.invoke('repair-legacy-login', {
    body: {
      email: normalizedEmail,
      password,
      supabaseErrorCode,
    },
  });

  if (error) {
    console.error('Legacy password repair invocation failed:', error);
    return null;
  }

  return (data ?? null) as LegacyPasswordRepairResponse | null;
}
