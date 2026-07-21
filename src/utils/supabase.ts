import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const authStorageKey = "cyan-notepad-auth";

export const APP_DEEP_LINK_SCHEME = "cyan-notepad";
export const PASSWORD_RECOVERY_REDIRECT_URL = `${APP_DEEP_LINK_SCHEME}://auth/recovery`;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: authStorageKey,
      },
    })
  : null;

export function hasStoredAuthSession(): boolean {
  if (typeof window === "undefined") return false;

  try {
    return Boolean(window.localStorage.getItem(authStorageKey));
  } catch {
    return false;
  }
}
