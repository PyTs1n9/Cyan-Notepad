import { invoke, isTauri } from "@tauri-apps/api/core";

const LOGIN_PREFERENCES_KEY = "cyan-notepad-login-preferences";

export interface LoginPreferences {
  configured: boolean;
  rememberPassword: boolean;
  autoLogin: boolean;
  encryptedCredentials: string | null;
}

export interface SavedLoginCredentials {
  email: string;
  password: string;
}

const defaultPreferences: LoginPreferences = {
  configured: false,
  rememberPassword: false,
  autoLogin: false,
  encryptedCredentials: null,
};

export function loadLoginPreferences(): LoginPreferences {
  if (typeof window === "undefined") return defaultPreferences;

  try {
    const raw = window.localStorage.getItem(LOGIN_PREFERENCES_KEY);
    if (!raw) return defaultPreferences;
    const value = JSON.parse(raw) as Partial<LoginPreferences>;
    const rememberPassword = value.rememberPassword === true;
    return {
      configured: true,
      rememberPassword,
      autoLogin: rememberPassword && value.autoLogin === true,
      encryptedCredentials: rememberPassword && typeof value.encryptedCredentials === "string"
        ? value.encryptedCredentials
        : null,
    };
  } catch {
    return defaultPreferences;
  }
}

function writeLoginPreferences(preferences: Omit<LoginPreferences, "configured">): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOGIN_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Login still works when WebView storage is unavailable; only remembering is skipped.
  }
}

export function saveLoginPreferenceSelection(rememberPassword: boolean, autoLogin: boolean): void {
  const current = loadLoginPreferences();
  writeLoginPreferences({
    rememberPassword,
    autoLogin: rememberPassword && autoLogin,
    encryptedCredentials: rememberPassword ? current.encryptedCredentials : null,
  });
}

export async function saveLoginCredentials(
  email: string,
  password: string,
  autoLogin: boolean,
): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    const encryptedCredentials = await invoke<string>("encrypt_login_credentials", {
      email,
      password,
    });
    writeLoginPreferences({
      rememberPassword: true,
      autoLogin,
      encryptedCredentials,
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadSavedLoginCredentials(): Promise<SavedLoginCredentials | null> {
  const preferences = loadLoginPreferences();
  if (!preferences.rememberPassword || !preferences.encryptedCredentials || !isTauri()) return null;

  try {
    const credentials = await invoke<SavedLoginCredentials>("decrypt_login_credentials", {
      encryptedCredentials: preferences.encryptedCredentials,
    });
    if (typeof credentials.email !== "string" || typeof credentials.password !== "string") return null;
    return credentials;
  } catch {
    return null;
  }
}

export function disableAutoLogin(): void {
  const current = loadLoginPreferences();
  if (!current.configured) return;
  writeLoginPreferences({
    rememberPassword: current.rememberPassword,
    autoLogin: false,
    encryptedCredentials: current.encryptedCredentials,
  });
}
