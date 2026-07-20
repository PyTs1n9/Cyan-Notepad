import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/utils/supabase";

interface AuthActionResult {
  ok: boolean;
  needsEmailConfirmation?: boolean;
}

export interface ProfileUpdate {
  displayName?: string;
  avatarUrl?: string | null;
  avatarCache?: string | null;
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
  updateProfile: (profile: ProfileUpdate) => Promise<boolean>;
  updatePassword: (password: string) => Promise<boolean>;
  clearError: () => void;
}

let authListenerRegistered = false;

async function syncWorkspaceProfile(user: User): Promise<string | null> {
  if (!supabase) return null;

  const metadata = user.user_metadata as Record<string, unknown>;
  const metadataName = typeof metadata.display_name === "string"
    ? metadata.display_name.trim()
    : "";
  const displayName = metadataName || user.email?.split("@")[0] || "User";
  const profileUpdates: { display_name: string; avatar_url?: string | null } = {
    display_name: displayName,
  };

  if (typeof metadata.avatar_url === "string" || metadata.avatar_url === null) {
    profileUpdates.avatar_url = metadata.avatar_url;
  }

  const { error } = await supabase
    .from("profiles")
    .update(profileUpdates)
    .eq("id", user.id);
  return error?.message ?? null;
}

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
    const sessionUser = data.session?.user ?? null;
    const profileError = sessionUser ? await syncWorkspaceProfile(sessionUser) : null;
    set({
      user: sessionUser,
      session: data.session,
      initialized: true,
      loading: false,
      error: error?.message ?? profileError,
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
    const profileError = await syncWorkspaceProfile(data.user);
    set({ user: data.user, session: data.session, loading: false, error: profileError });
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
    const profileError = data.session?.user
      ? await syncWorkspaceProfile(data.session.user)
      : null;
    set({
      user: data.session?.user ?? null,
      session: data.session,
      loading: false,
      error: profileError,
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

  updateProfile: async ({ displayName, avatarUrl, avatarCache }) => {
    if (!supabase) return false;
    const currentUser = get().user;
    if (!currentUser) return false;

    set({ loading: true, error: null });
    const nextMetadata = {
      ...currentUser.user_metadata,
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
      ...(avatarCache !== undefined ? { avatar_cache: avatarCache } : {}),
    };
    const { data, error } = await supabase.auth.updateUser({ data: nextMetadata });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }

    const profileUpdates = {
      ...(displayName !== undefined ? { display_name: displayName } : {}),
      ...(avatarUrl !== undefined ? { avatar_url: avatarUrl } : {}),
    };
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdates)
        .eq("id", currentUser.id);
      if (profileError) {
        set({ user: data.user, loading: false, error: profileError.message });
        return false;
      }
    }

    set({ user: data.user, loading: false, error: null });
    return true;
  },

  updatePassword: async (password) => {
    if (!supabase || !get().user) return false;
    set({ loading: true, error: null });
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }
    set({ user: data.user, loading: false, error: null });
    return true;
  },

  clearError: () => set({ error: null }),
}));
