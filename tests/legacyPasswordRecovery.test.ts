import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginErrorMessage,
  isInvalidCredentialsError,
  type LegacyPasswordRepairResponse,
} from '../src/services/legacyPasswordRecoveryCore';

test('detects invalid credential auth errors', () => {
  assert.equal(
    isInvalidCredentialsError({ name: 'AuthApiError', code: 'invalid_credentials', message: 'Invalid login credentials' }),
    true,
  );
});

test('returns migration-specific reset guidance when repair says reset-password', () => {
  const repair: LegacyPasswordRepairResponse = {
    ok: true,
    repaired: false,
    classification: 'preserve-current-supabase-password',
    action: 'reset-password',
  };

  const message = buildLoginErrorMessage(new Error('Invalid login credentials'), repair);
  assert.match(message, /Forgot Password/i);
});

test('returns generic invalid password guidance for non-migrated users', () => {
  const repair: LegacyPasswordRepairResponse = {
    ok: true,
    repaired: false,
    classification: 'not-migrated',
    action: 'none',
  };

  const message = buildLoginErrorMessage(new Error('Invalid login credentials'), repair);
  assert.match(message, /did not match/i);
});

test('returns rate limit guidance when auth throttles logins', () => {
  const message = buildLoginErrorMessage(new Error('Rate limit exceeded'));
  assert.match(message, /Too many login attempts/i);
});
