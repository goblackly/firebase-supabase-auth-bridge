import { createClient } from '@supabase/supabase-js';
import { getFirebaseAccessToken } from './firebase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://gwstquyzlpngwghjmtcj.supabase.co';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_q09kFw2--DBxRGoptt_s2g_l_UHDCUT';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  accessToken: async () => getFirebaseAccessToken(false),
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
