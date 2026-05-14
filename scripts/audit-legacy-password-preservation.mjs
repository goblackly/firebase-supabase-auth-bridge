import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIREBASE_EXPORT_PATH = process.env.FIREBASE_EXPORT_PATH
  || path.join('/Users/kyleamaker/Documents/Codex/2026-05-08/files-mentioned-by-the-user-screenshot', 'firebase-auth-users.json');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gwstquyzlpngwghjmtcj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.APP_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUTPUT_PATH = process.env.OUTPUT_PATH
  || path.join(ROOT, 'reports', `legacy-password-audit-${new Date().toISOString().slice(0, 10)}.json`);

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set APP_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY before running this audit.');
}

function isoMs(value) {
  return value ? Date.parse(value) : NaN;
}

function hasMeaningfulPostCutoverActivity(authUser) {
  const createdMs = isoMs(authUser.created_at);
  const updatedMs = isoMs(authUser.updated_at);
  const confirmedMs = isoMs(authUser.email_confirmed_at);
  const graceWindowMs = 5 * 60 * 1000;

  return (
    Boolean(authUser.last_sign_in_at) ||
    (Number.isFinite(updatedMs) && Number.isFinite(createdMs) && updatedMs - createdMs > graceWindowMs) ||
    (Number.isFinite(confirmedMs) && Number.isFinite(createdMs) && confirmedMs - createdMs > graceWindowMs)
  );
}

function classify(publicUser, authUser) {
  if (!publicUser || !authUser) {
    return 'manual-review';
  }

  if (publicUser.firebase_uid === authUser.id) {
    return 'not-migrated';
  }

  if (hasMeaningfulPostCutoverActivity(authUser)) {
    return 'preserve-current-supabase-password';
  }

  return 'eligible-for-firebase-password-restore';
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function listSupabaseAuthUsers() {
  const payload = await fetchJson(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  return payload.users ?? [];
}

async function listPublicUsers() {
  return await fetchJson(
    `${SUPABASE_URL}/rest/v1/users?select=auth_user_id,firebase_uid,email,role,created_at&limit=1000`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
}

async function main() {
  const firebaseExport = JSON.parse(await fs.readFile(FIREBASE_EXPORT_PATH, 'utf8'));
  const firebaseUsers = firebaseExport.users ?? [];
  const [authUsers, publicUsers] = await Promise.all([listSupabaseAuthUsers(), listPublicUsers()]);

  const authByEmail = new Map(
    authUsers.map((user) => [String(user.email ?? '').toLowerCase(), user]),
  );
  const publicByEmail = new Map(
    publicUsers.map((user) => [String(user.email ?? '').toLowerCase(), user]),
  );

  const detailed = firebaseUsers.map((firebaseUser) => {
    const email = String(firebaseUser.email ?? '').toLowerCase();
    const authUser = authByEmail.get(email) ?? null;
    const publicUser = publicByEmail.get(email) ?? null;
    const classification = classify(publicUser, authUser);

    return {
      email,
      firebase_uid: firebaseUser.localId,
      supabase_auth_user_id: authUser?.id ?? null,
      public_user_firebase_uid: publicUser?.firebase_uid ?? null,
      public_user_auth_user_id: publicUser?.auth_user_id ?? null,
      classification,
      has_supabase_auth_user: Boolean(authUser),
      has_public_user: Boolean(publicUser),
      has_signed_in_after_cutover: Boolean(authUser?.last_sign_in_at),
      supabase_created_at: authUser?.created_at ?? null,
      supabase_updated_at: authUser?.updated_at ?? null,
      supabase_last_sign_in_at: authUser?.last_sign_in_at ?? null,
    };
  });

  const summary = detailed.reduce((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});

  const unmatchedPublicUsers = publicUsers
    .filter((user) => !authByEmail.has(String(user.email ?? '').toLowerCase()))
    .map((user) => ({
      email: user.email,
      firebase_uid: user.firebase_uid,
      auth_user_id: user.auth_user_id,
    }));

  const unmatchedAuthUsers = authUsers
    .filter((user) => !publicByEmail.has(String(user.email ?? '').toLowerCase()))
    .map((user) => ({
      email: user.email,
      id: user.id,
    }));

  const report = {
    generated_at: new Date().toISOString(),
    firebase_export_path: FIREBASE_EXPORT_PATH,
    summary: {
      firebase_export_count: firebaseUsers.length,
      supabase_auth_count: authUsers.length,
      public_users_count: publicUsers.length,
      classifications: summary,
      unmatched_public_users: unmatchedPublicUsers.length,
      unmatched_auth_users: unmatchedAuthUsers.length,
    },
    unmatched_public_users: unmatchedPublicUsers,
    unmatched_auth_users: unmatchedAuthUsers,
    users: detailed,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    output: OUTPUT_PATH,
    summary: report.summary,
  }, null, 2));
}

await main();
