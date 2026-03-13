import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(
  import.meta.env.VITE_SUPABASE_URL
  || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
  || ''
).trim();

const SUPABASE_ANON_KEY = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || ''
).trim();

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: { eventsPerSecond: 20 },
      },
    })
  : null;

