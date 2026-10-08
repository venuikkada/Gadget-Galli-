import { createClient } from '@supabase/supabase-js';

import { config } from './config';

const url = config.supabaseUrl;
const anonKey = config.supabaseAnonKey;

export const isConfigured = !!url && !!anonKey;

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'gg-admin-auth' },
});
