import { createClient } from '@supabase/supabase-js';
import { apiEnv } from './env';

export const supabaseAdmin = createClient(
  apiEnv.SUPABASE_URL,
  apiEnv.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
