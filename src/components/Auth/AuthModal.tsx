import { useEffect, useState, type FormEvent } from "react";
import { LogIn, LogOut, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { isSupabaseConfigured } from "@/utils/supabase";
import { t } from "@/utils/i18n";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type AuthMode = "signIn" | "signUp";

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const lang = useSettingsStore((state) => state.lang);
  const { user, loading, error, signIn, signUp, signOut, clearError } = useAuthStore();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    clearError();
    setValidationError(null);
    setNotice(null);
  }, [open, clearError]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setValidationError(null);
    setNotice(null);
    clearError();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError(null);
    setNotice(null);

    if (password.length < 6) {
      setValidationError(t(lang, "authPasswordTooShort"));
      return;
    }
    if (mode === "signUp" && password !== confirmPassword) {
      setValidationError(t(lang, "authPasswordMismatch"));
      return;
    }

    const result = mode === "signIn"
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password);

    if (!result.ok) return;
    if (result.needsEmailConfirmation) {
      setNotice(t(lang, "authCheckEmail"));
      setPassword("");
      setConfirmPassword("");
      return;
    }
    onClose();
  };

  const handleSignOut = async () => {
    if (await signOut()) onClose();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4">
      <section
        className="w-full max-w-[390px] overflow-hidden rounded-xl border border-border bg-bg-primary shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
              {user ? <ShieldCheck size={18} /> : <LogIn size={18} />}
            </div>
            <div className="min-w-0">
              <h1 id="auth-title" className="truncate text-sm font-semibold text-text-primary">
                {user ? t(lang, "authAccount") : t(lang, "authWelcome")}
              </h1>
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {user ? t(lang, "authSignedIn") : t(lang, "authSubtitle")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label={t(lang, "close")}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5">
          {!isSupabaseConfigured ? (
            <div className="rounded-lg border border-border bg-bg-secondary/60 p-4">
              <p className="text-sm font-medium text-text-primary">{t(lang, "authNotConfigured")}</p>
              <p className="mt-2 text-xs leading-relaxed text-text-muted">
                {t(lang, "authNotConfiguredHint")}
              </p>
            </div>
          ) : user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-secondary/45 p-3">
                <Mail size={16} className="flex-shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-xs text-text-muted">{t(lang, "authEmail")}</p>
                  <p className="truncate text-sm text-text-primary">{user.email}</p>
                </div>
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={loading}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-primary text-sm font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut size={15} />
                {loading ? t(lang, "authWorking") : t(lang, "authSignOut")}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-2 rounded-lg bg-bg-secondary p-1">
                {(["signIn", "signUp"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => changeMode(item)}
                    className={`h-8 rounded-md text-xs font-medium transition-colors ${
                      mode === item
                        ? "bg-bg-primary text-accent shadow-sm"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {t(lang, item === "signIn" ? "authSignIn" : "authSignUp")}
                  </button>
                ))}
              </div>

              <form className="space-y-3" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                    {t(lang, "authEmail")}
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                    placeholder="name@example.com"
                    className="h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted/60 focus:border-accent focus:bg-bg-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                    {t(lang, "authPassword")}
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                    required
                    placeholder={t(lang, "authPasswordPlaceholder")}
                    className="h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted/60 focus:border-accent focus:bg-bg-primary"
                  />
                </label>
                {mode === "signUp" && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary">
                      {t(lang, "authConfirmPassword")}
                    </span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                      placeholder={t(lang, "authPasswordPlaceholder")}
                      className="h-9 w-full rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted/60 focus:border-accent focus:bg-bg-primary"
                    />
                  </label>
                )}

                {(validationError || error) && (
                  <p className="text-xs leading-relaxed text-danger">{validationError || error}</p>
                )}
                {notice && (
                  <p className="rounded-lg bg-accent-light px-3 py-2 text-xs leading-relaxed text-accent">
                    {notice}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim() || !password}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {mode === "signUp" && !loading ? <UserPlus size={15} /> : <LogIn size={15} />}
                  {loading
                    ? t(lang, "authWorking")
                    : t(lang, mode === "signIn" ? "authSignIn" : "authSignUp")}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
