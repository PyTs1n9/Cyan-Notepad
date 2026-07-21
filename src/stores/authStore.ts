import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import {
  APP_DEEP_LINK_SCHEME,
  hasStoredAuthSession,
  isSupabaseConfigured,
  PASSWORD_RECOVERY_REDIRECT_URL,
  supabase,
} from "@/utils/supabase";
import {
  disableAutoLogin,
  loadLoginPreferences,
  loadSavedLoginCredentials,
  saveLoginCredentials,
  saveLoginPreferenceSelection,
} from "@/utils/authPreferences";

interface AuthActionResult {
  ok: boolean;
  needsEmailConfirmation?: boolean;
}

export const PASSWORD_RECOVERY_LINK_INVALID_ERROR = "password_recovery_link_invalid";
export type PasswordRecoveryStage = "request" | "emailSent" | "reset" | "success";

function extractRecoveryTokenHash(link: string, depth = 0): string | null {
  if (depth > 3 || link.length > 16_384) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(link.trim().replace(/&amp;/gi, "&"));
  } catch {
    return null;
  }

  const type = parsedUrl.searchParams.get("type")?.toLowerCase();
  const tokenHash = parsedUrl.searchParams.get("token_hash")
    ?? parsedUrl.searchParams.get("token");
  if (type === "recovery" && tokenHash) return tokenHash;

  for (const value of parsedUrl.searchParams.values()) {
    const candidates = [value];
    try {
      const decodedValue = decodeURIComponent(value);
      if (decodedValue !== value) candidates.push(decodedValue);
    } catch {
      // URLSearchParams has already decoded normal query values.
    }

    for (const candidate of candidates) {
      if (!/^(?:https?:\/\/|cyan-notepad:\/\/)/i.test(candidate.trim())) continue;
      const nestedTokenHash = extractRecoveryTokenHash(candidate, depth + 1);
      if (nestedTokenHash) return nestedTokenHash;
    }
  }

  return null;
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
  autoLoginLoading: boolean;
  passwordRecoveryPending: boolean;
  passwordRecoveryStage: PasswordRecoveryStage | null;
  passwordRecoveryEmail: string;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  openPasswordRecovery: (email?: string) => void;
  requestPasswordReset: (email: string) => Promise<boolean>;
  handlePasswordRecoveryUrl: (url: string) => Promise<boolean>;
  cancelPasswordRecovery: () => Promise<void>;
  finishPasswordRecovery: () => void;
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
  autoLoginLoading: false,
  passwordRecoveryPending: false,
  passwordRecoveryStage: null,
  passwordRecoveryEmail: "",
  error: null,

  initialize: async () => {
    if (get().initialized || get().loading) return;
    if (!isSupabaseConfigured || !supabase) {
      set({ initialized: true, loading: false, autoLoginLoading: false });
      return;
    }

    const preferences = loadLoginPreferences();
    const storedSession = hasStoredAuthSession();
    const shouldAutoLogin = preferences.configured ? preferences.autoLogin : storedSession;
    const hasSavedCredentials = Boolean(
      preferences.rememberPassword && preferences.encryptedCredentials,
    );

    set({
      loading: true,
      autoLoginLoading: shouldAutoLogin && (storedSession || hasSavedCredentials),
      error: null,
    });

    let session: Session | null = null;
    let authError: string | null = null;
    if (shouldAutoLogin) {
      const { data, error } = await supabase.auth.getSession();
      session = data.session;
      authError = error?.message ?? null;

      if (!session && preferences.autoLogin && hasSavedCredentials) {
        const credentials = await loadSavedLoginCredentials();
        if (credentials) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword(credentials);
          session = signInData.session;
          authError = signInError?.message ?? null;
          if (signInError) disableAutoLogin();
        } else {
          disableAutoLogin();
        }
      }
    } else if (storedSession) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      authError = error?.message ?? null;
    }

    const sessionUser = session?.user ?? null;
    const profileError = sessionUser ? await syncWorkspaceProfile(sessionUser) : null;
    set({
      user: sessionUser,
      session,
      initialized: true,
      loading: false,
      autoLoginLoading: false,
      error: authError ?? profileError,
    });

    if (!authListenerRegistered) {
      authListenerRegistered = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session,
          initialized: true,
          loading: false,
          autoLoginLoading: false,
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

  openPasswordRecovery: (email = "") => {
    set({
      passwordRecoveryPending: true,
      passwordRecoveryStage: "request",
      passwordRecoveryEmail: email,
      loading: false,
      error: null,
    });
  },

  requestPasswordReset: async (email) => {
    if (!supabase) return false;
    const currentRecoveryStage = get().passwordRecoveryStage;
    set({
      loading: true,
      autoLoginLoading: false,
      passwordRecoveryPending: true,
      passwordRecoveryStage: currentRecoveryStage === "emailSent" ? "emailSent" : "request",
      passwordRecoveryEmail: email,
      error: null,
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RECOVERY_REDIRECT_URL,
    });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }
    set({
      loading: false,
      passwordRecoveryStage: "emailSent",
      passwordRecoveryEmail: email,
      error: null,
    });
    return true;
  },

  handlePasswordRecoveryUrl: async (url) => {
    if (!supabase) return false;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return false;
    }
    const isAppRecoveryUrl = parsedUrl.protocol === `${APP_DEEP_LINK_SCHEME}:`
      && parsedUrl.hostname === "auth"
      && parsedUrl.pathname === "/recovery";
    const recoveryTokenHash = isAppRecoveryUrl ? null : extractRecoveryTokenHash(url);
    if (!isAppRecoveryUrl && !recoveryTokenHash) return false;

    disableAutoLogin();
    set({
      loading: true,
      autoLoginLoading: false,
      passwordRecoveryPending: true,
      passwordRecoveryStage: recoveryTokenHash ? "emailSent" : "reset",
      error: null,
    });

    let recoverySession: Session | null = null;
    let recoveryAuthError: string | null = null;

    if (recoveryTokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: recoveryTokenHash,
        type: "recovery",
      });
      recoverySession = data.session;
      recoveryAuthError = error?.message ?? null;
    } else {
      const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ""));
      const recoveryError = parsedUrl.searchParams.get("error_description")
        ?? hashParams.get("error_description");
      if (recoveryError) {
        set({ loading: false, error: recoveryError });
        return true;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const authCode = parsedUrl.searchParams.get("code");
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        recoverySession = data.session;
        recoveryAuthError = error?.message ?? null;
      } else if (authCode) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
        recoverySession = data.session;
        recoveryAuthError = error?.message ?? null;
      } else {
        recoveryAuthError = PASSWORD_RECOVERY_LINK_INVALID_ERROR;
      }
    }

    const recoveryUser = recoverySession?.user ?? null;
    const profileError = recoveryUser ? await syncWorkspaceProfile(recoveryUser) : null;
    set({
      user: recoveryUser,
      session: recoverySession,
      initialized: true,
      loading: false,
      passwordRecoveryPending: true,
      passwordRecoveryStage: recoveryUser
        ? "reset"
        : recoveryTokenHash
          ? "emailSent"
          : "reset",
      passwordRecoveryEmail: recoveryUser?.email ?? get().passwordRecoveryEmail,
      error: recoveryAuthError ?? profileError,
    });
    return true;
  },

  cancelPasswordRecovery: async () => {
    if (supabase) await supabase.auth.signOut({ scope: "local" });
    disableAutoLogin();
    set({
      user: null,
      session: null,
      loading: false,
      passwordRecoveryPending: false,
      passwordRecoveryStage: null,
      passwordRecoveryEmail: "",
      error: null,
    });
  },

  finishPasswordRecovery: () => {
    set({
      passwordRecoveryPending: false,
      passwordRecoveryStage: null,
      passwordRecoveryEmail: "",
      error: null,
    });
  },

  signOut: async () => {
    if (!supabase) return false;
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      set({ loading: false, error: error.message });
      return false;
    }
    disableAutoLogin();
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
    const preferences = loadLoginPreferences();
    if (preferences.rememberPassword && data.user.email) {
      const saved = await saveLoginCredentials(
        data.user.email,
        password,
        preferences.autoLogin,
      );
      if (!saved) saveLoginPreferenceSelection(false, false);
    }
    const passwordRecoveryStage = get().passwordRecoveryStage === "reset"
      ? "success"
      : get().passwordRecoveryStage;
    set({
      user: data.user,
      loading: false,
      passwordRecoveryStage,
      error: null,
    });
    return true;
  },

  clearError: () => set({ error: null }),
}));
