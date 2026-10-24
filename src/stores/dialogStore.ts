import { create } from "zustand";

/**
 * In-app dialog for confirmations and short notices.
 *
 * The alternative is `@tauri-apps/plugin-dialog`'s `ask`/`message`, which opens
 * a native Windows TaskDialog — a grey system box with 是/否 buttons that looks
 * nothing like the app and cannot be themed. File pickers still use the native
 * dialog (a file browser cannot be restyled); only the chrome-less prompts moved
 * here.
 */
export type AppDialogTone = "info" | "warning" | "danger";

export interface AppDialogOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  /** Omitted for a notice with a single button. */
  cancelLabel?: string;
  tone?: AppDialogTone;
}

interface DialogRequest extends AppDialogOptions {
  id: number;
}

/**
 * Long-running task indicator. Rendered by the same host as the dialogs but in
 * its own card: the settings panel is a fixed-height scroll container, so an
 * inline bar there can be clipped or scrolled out of view.
 */
export interface AppProgress {
  title: string;
  label: string;
  files: number;
  totalFiles: number;
  bytes: number;
  totalBytes: number;
}

interface DialogState {
  request: DialogRequest | null;
  resolve: ((value: boolean) => void) | null;
  progress: AppProgress | null;
  open: (options: AppDialogOptions) => Promise<boolean>;
  close: (value: boolean) => void;
  beginProgress: (options: { title: string; label: string }) => void;
  updateProgress: (patch: Partial<Omit<AppProgress, "title">>) => void;
  endProgress: () => void;
}

let nextId = 1;

export const useDialogStore = create<DialogState>((set, get) => ({
  request: null,
  resolve: null,
  progress: null,

  open: (options) => new Promise<boolean>((resolve) => {
    // Dialogs never stack: a second request resolves the first one as cancelled
    // so no caller is left awaiting a promise that can never settle.
    get().resolve?.(false);
    set({ request: { ...options, id: nextId++ }, resolve });
  }),

  close: (value) => {
    const { resolve } = get();
    set({ request: null, resolve: null });
    resolve?.(value);
  },

  beginProgress: ({ title, label }) => {
    set({
      progress: { title, label, files: 0, totalFiles: 0, bytes: 0, totalBytes: 0 },
    });
  },

  updateProgress: (patch) => {
    const current = get().progress;
    if (!current) return;
    set({ progress: { ...current, ...patch } });
  },

  endProgress: () => set({ progress: null }),
}));

export function confirmDialog(options: AppDialogOptions): Promise<boolean> {
  return useDialogStore.getState().open({ tone: "warning", ...options });
}

export async function alertDialog(options: AppDialogOptions): Promise<void> {
  await useDialogStore.getState().open({ tone: "danger", ...options });
}

export const beginProgress = (options: { title: string; label: string }) =>
  useDialogStore.getState().beginProgress(options);
export const updateProgress = (patch: Partial<Omit<AppProgress, "title">>) =>
  useDialogStore.getState().updateProgress(patch);
export const endProgress = () => useDialogStore.getState().endProgress();
