import { config } from '../config.js';
import { createLocalStorageProvider } from './providers/localStorageProvider.js';
import { createSupabaseStorageProvider } from './providers/supabaseStorageProvider.js';

export function createStorageProvider() {
  const mode = String(config.storageProvider || 'local').trim().toLowerCase();
  if (mode === 'supabase') {
    return createSupabaseStorageProvider();
  }
  return createLocalStorageProvider();
}
