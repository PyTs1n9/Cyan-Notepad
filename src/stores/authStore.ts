import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/utils/supabase";

interface AuthActionResult {
  ok: boolean;
  needsEmailConfirmation?: boolean;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<boolean>;
  clearError: () => void;
}

let authListenerRegistered = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  initialized: false,
  loading: false,
  error: null,

  initialize: async () => {
    if (get().initialized || get().loading) return;
    if (!isSupabaseConfigured || !supabase) {
      set({ initialized: true, loading: false });
      return;
    }

    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.getSession();
    set({
      user: data.session?.user ?? null,
      session: data.session,
      initialized: true,
      loading: false,
      error: error?.message ?? null,
    });

    if (!authListenerRegistered) {
      authListenerRegistered = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session,
          initialized: true,
          loading: false,
          error: null,
        });
      });
    }
  },

  signIn: async (email, password) => {
    if (!supabase) return { ok: false };
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      return { ok: false };
    }
    set({ user: data.user, session: data.session, loading: false, error: null });
    return { ok: true };
  },

  signUp: async (email, password) => {
    if (!supabase) return { ok: false };
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ loading: false, error: error.message });
      return { ok: false };
    }

    const needsEmailConfirmation = !data.session;
    set({
      user: data.session?.user ?? null,
      session: data.session,
      loading: false,
      error: null,
    });
    return { ok: true, needsEmailConfirmation };
  },

  signOut: async () => {
    if (!supabase) return false;
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }
    set({ user: null, session: null, loading: false, error: null });
    return true;
  },

  clearError: () => set({ error: null }),
}));
