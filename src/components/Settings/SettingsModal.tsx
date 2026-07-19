import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Clock,
  Droplets,
  Eye,
  FolderOpen,
  Globe,
  Keyboard,
  Palette,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import type {
  AppShortcuts,
  AutoSaveInterval,
  CustomColors,
  LangType,
  ThemeType,
} from "@/stores/settingsStore";
import {
  DEFAULT_SHORTCUTS,
  MAX_STICKY_OPACITY,
  MIN_STICKY_OPACITY,
  THEME_COLORS,
} from "@/stores/settingsStore";
import { t } from "@/utils/i18n";
import { pauseShortcuts, resumeShortcuts } from "@/utils/shortcutManager";
import { getDataDirectory, getImageTrashDirectory } from "@/utils/storage";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsSection = "basic" | "theme" | "language";

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const {
    theme,
    lang,
    customColors,
    savedPresets,
    shortcuts,
    autoSaveInterval,
    stickyOpacity,
    setTheme,
    setLang,
    setCustomColors,
    savePreset,
    loadPreset,
    deletePreset,
    setShortcuts,
    setAutoSaveInterval,
    setStickyOpacity,
  } = useSettingsStore();

  const [activeSection, setActiveSection] = useState<SettingsSection>("basic");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [autoSaveDropdownOpen, setAutoSaveDropdownOpen] = useState(false);
  const [recordingField, setRecordingField] = useState<keyof AppShortcuts | null>(null);
  const [dataDirectory, setDataDirectory] = useState<string | null>(null);
  const [imageCacheDirectory, setImageCacheDirectory] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const autoSaveDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recordingField) {
      pauseShortcuts();
    } else {
      resumeShortcuts();
    }
  }, [recordingField]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    getDataDirectory()
      .then((path) => {
        if (active) setDataDirectory(path);
      })
      .catch((error) => {
        console.error("Failed to resolve data directory:", error);
      });
    getImageTrashDirectory()
      .then((path) => {
        if (active) setImageCacheDirectory(path);
      })
      .catch((error) => {
        console.error("Failed to resolve image cache directory:", error);
      });

    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!dropdownOpen) return;

    const handler = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!autoSaveDropdownOpen) return;

    const handler = (event: MouseEvent) => {
      if (autoSaveDropdownRef.current && !autoSaveDropdownRef.current.contains(event.target as Node)) {
        setAutoSaveDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [autoSaveDropdownOpen]);

  const handleShortcutKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLInputElement>,
    field: keyof AppShortcuts,
  ) => {
    event.preventDefault();
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");

    const key = event.key;
    if (!["Control", "Alt", "Shift", "Meta"].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      setShortcuts({ ...shortcuts, [field]: parts.join("+") });
      setRecordingField(null);
    }
  }, [shortcuts, setShortcuts]);

  if (!open) return null;

  const themes: {
    value: ThemeType;
    labelKey: "darkTheme" | "blueTheme" | "yellowTheme" | "greenTheme";
    preview: string;
    accent: string;
  }[] = [
    { value: "dark", labelKey: "darkTheme", preview: "#1a1b1e", accent: "#5c7cfa" },
    { value: "blue", labelKey: "blueTheme", preview: "#f0f4f8", accent: "#2563eb" },
    { value: "yellow", labelKey: "yellowTheme", preview: THEME_COLORS.yellow.bgPrimary, accent: THEME_COLORS.yellow.accent },
    { value: "green", labelKey: "greenTheme", preview: THEME_COLORS.green.bgPrimary, accent: THEME_COLORS.green.accent },
  ];

  const langs: { value: LangType; labelKey: "chinese" | "english" }[] = [
    { value: "zh", labelKey: "chinese" },
    { value: "en", labelKey: "english" },
  ];

  const autoSaveOptions: {
    value: AutoSaveInterval;
    labelKey: "autoSaveOff" | "autoSave10s" | "autoSave30s" | "autoSave1m";
  }[] = [
    { value: 0, labelKey: "autoSaveOff" },
    { value: 10000, labelKey: "autoSave10s" },
    { value: 30000, labelKey: "autoSave30s" },
    { value: 60000, labelKey: "autoSave1m" },
  ];

  const selectedAutoSaveOption = autoSaveOptions.find(
    (option) => option.value === autoSaveInterval,
  ) ?? autoSaveOptions[0];
  const cc: CustomColors = customColors || THEME_COLORS.blue;

  const colorFields: {
    key: keyof CustomColors;
    labelKey: "bgPrimary" | "bgSecondary" | "bgSidebar" | "textPrimary" | "accentColor";
  }[] = [
    { key: "bgPrimary", labelKey: "bgPrimary" },
    { key: "bgSecondary", labelKey: "bgSecondary" },
    { key: "bgSidebar", labelKey: "bgSidebar" },
    { key: "textPrimary", labelKey: "textPrimary" },
    { key: "accent", labelKey: "accentColor" },
  ];

  const sections = [
    { id: "basic" as const, label: t(lang, "settingsBasic"), icon: SlidersHorizontal },
    { id: "theme" as const, label: t(lang, "settingsTheme"), icon: Palette },
    { id: "language" as const, label: t(lang, "language"), icon: Globe },
  ];

  const sectionTitle = sections.find((section) => section.id === activeSection)?.label;

  const handleSectionChange = (section: SettingsSection) => {
    setActiveSection(section);
    setDropdownOpen(false);
    setAutoSaveDropdownOpen(false);
    setRecordingField(null);
  };

  const handleCustomChange = (key: keyof CustomColors, value: string) => {
    setCustomColors({ ...cc, [key]: value });
  };

  const handleOpenDataDirectory = async () => {
    try {
      const path = dataDirectory ?? await getDataDirectory();
      setDataDirectory(path);
      try {
        await revealItemInDir(path);
      } catch (revealError) {
        console.warn("Failed to reveal data directory; trying the default opener:", revealError);
        await openPath(path);
      }
    } catch (error) {
      console.error("Failed to open data directory:", error);
    }
  };

  const handleOpenImageCacheDirectory = async () => {
    try {
      const path = imageCacheDirectory ?? await getImageTrashDirectory();
      setImageCacheDirectory(path);
      await openPath(path);
    } catch (error) {
      console.error("Failed to open image cache directory:", error);
    }
  };

  const handleSavePreset = () => {
    if (savedPresets.length >= 5) return;
    const name = prompt(
      t(lang, "presetName"),
      `${t(lang, "customTheme")} ${savedPresets.length + 1}`,
    );
    if (name) savePreset(name);
  };

  const handleLoadPreset = (index: number) => {
    loadPreset(index);
    setDropdownOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative flex h-[min(680px,calc(100vh-32px))] w-[min(900px,calc(100vw-32px))] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-bg-primary shadow-2xl"
      >
        <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-border px-5">
          <h1 id="settings-title" className="text-base font-semibold text-text-primary">
            {t(lang, "settingsTitle")}
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, "close")}
            title={t(lang, "close")}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="w-36 flex-shrink-0 border-r border-border bg-bg-sidebar/55 p-3 sm:w-48">
            <nav aria-label={t(lang, "settingsTitle")} className="space-y-1">
              {sections.map(({ id, label, icon: Icon }) => {
                const selected = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSectionChange(id)}
                    aria-current={selected ? "page" : undefined}
                    className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-accent
                      ${selected
                        ? "bg-bg-active text-text-primary shadow-sm"
                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
                  >
                    <Icon
                      size={16}
                      className={`flex-shrink-0 transition-colors ${selected ? "text-accent" : "text-text-muted group-hover:text-accent"}`}
                    />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl p-5 sm:p-7">
              <h2 className="mb-5 text-lg font-semibold text-text-primary">{sectionTitle}</h2>

              {activeSection === "basic" && (
                <div className="overflow-visible rounded-xl border border-border bg-bg-secondary/35">
                  <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                        <Clock size={16} />
                      </div>
                      <span className="truncate text-sm font-medium text-text-primary">
                        {t(lang, "autoSaveSection")}
                      </span>
                    </div>

                    <div className="relative" ref={autoSaveDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setAutoSaveDropdownOpen(!autoSaveDropdownOpen)}
                        aria-expanded={autoSaveDropdownOpen}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover cursor-pointer"
                      >
                        <span className="truncate">{t(lang, selectedAutoSaveOption.labelKey)}</span>
                        <ChevronDown
                          size={14}
                          className={`flex-shrink-0 transition-transform ${autoSaveDropdownOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {autoSaveDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-bg-primary shadow-lg">
                          {autoSaveOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setAutoSaveInterval(option.value);
                                setAutoSaveDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors cursor-pointer
                                ${autoSaveInterval === option.value
                                  ? "bg-accent-light text-accent"
                                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"}`}
                            >
                              {t(lang, option.labelKey)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                        <Keyboard size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-primary">
                          {t(lang, "shortcutsSection")}
                        </div>
                        <div className="truncate text-xs text-text-muted">
                          {t(lang, "shortcutToggleWindow")}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={recordingField === "toggleWindow" ? t(lang, "pressShortcut") : shortcuts.toggleWindow}
                        onFocus={() => setRecordingField("toggleWindow")}
                        onBlur={() => setRecordingField(null)}
                        onKeyDown={(event) => handleShortcutKeyDown(event, "toggleWindow")}
                        className={`min-w-0 flex-1 rounded-lg border bg-bg-primary px-3 py-2 text-center font-mono text-xs outline-none transition-colors cursor-pointer
                          ${recordingField === "toggleWindow"
                            ? "border-accent bg-accent-light text-accent"
                            : "border-border text-text-primary hover:border-text-muted"}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShortcuts(DEFAULT_SHORTCUTS)}
                        aria-label={t(lang, "resetShortcuts")}
                        title={t(lang, "resetShortcuts")}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-bg-primary text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary cursor-pointer"
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                        <Eye size={16} />
                      </div>
                      <span className="truncate text-sm font-medium text-text-primary">
                        {t(lang, "stickyOpacity")}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="mb-1 flex justify-end text-xs font-medium tabular-nums text-accent">
                        {stickyOpacity}%
                      </div>
                      <input
                        type="range"
                        min={MIN_STICKY_OPACITY}
                        max={MAX_STICKY_OPACITY}
                        step={1}
                        value={stickyOpacity}
                        onChange={(event) => setStickyOpacity(Number(event.target.value))}
                        aria-label={t(lang, "stickyOpacity")}
                        className="block h-2 w-full cursor-pointer accent-accent"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                        <FolderOpen size={16} />
                      </div>
                      <span className="truncate text-sm font-medium text-text-primary">
                        {t(lang, "dataLocation")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenDataDirectory}
                      title={dataDirectory ?? undefined}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover cursor-pointer"
                    >
                      <span className="truncate">{t(lang, "openDataFolder")}</span>
                      <FolderOpen size={14} className="flex-shrink-0 text-accent" />
                    </button>
                  </div>

                  <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)] sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                        <Trash2 size={16} />
                      </div>
                      <span className="truncate text-sm font-medium text-text-primary">
                        {t(lang, "imageCache")}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenImageCacheDirectory}
                      title={imageCacheDirectory ?? undefined}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover cursor-pointer"
                    >
                      <span className="truncate">{t(lang, "openImageCache")}</span>
                      <FolderOpen size={14} className="flex-shrink-0 text-accent" />
                    </button>
                  </div>
                </div>
              )}

              {activeSection === "theme" && (
                <div className="space-y-5">
                  <section>
                    <div className="mb-3 flex items-center gap-2">
                      <Palette size={16} className="text-accent" />
                      <h3 className="text-sm font-medium text-text-primary">{t(lang, "themeColor")}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                      {themes.map((item) => (
                        <button
                          key={item.value}
                          type="button"
                          onClick={() => setTheme(item.value)}
                          className={`flex min-w-0 items-center gap-3 rounded-xl border-2 p-3 text-left transition-all cursor-pointer
                            ${theme === item.value
                              ? "border-accent bg-accent-light"
                              : "border-border bg-bg-secondary/35 hover:border-text-muted hover:bg-bg-hover"}`}
                        >
                          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg border border-border shadow-sm">
                            <div className="absolute inset-0" style={{ backgroundColor: item.preview }} />
                            <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: item.accent }} />
                          </div>
                          <span className="min-w-0 truncate text-xs font-medium text-text-secondary">
                            {t(lang, item.labelKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-bg-secondary/35 p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <Droplets size={16} className="text-accent" />
                      <h3 className="text-sm font-medium text-text-primary">{t(lang, "customPalette")}</h3>
                      {theme === "custom" && (
                        <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] text-white">
                          {t(lang, "customTheme")}
                        </span>
                      )}
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {colorFields.map(({ key, labelKey }) => (
                        <label
                          key={key}
                          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-bg-hover"
                        >
                          <div className="relative flex-shrink-0">
                            <div
                              className="h-9 w-9 rounded-lg border border-border shadow-sm"
                              style={{ backgroundColor: cc[key] }}
                            />
                            <input
                              type="color"
                              value={cc[key]}
                              onChange={(event) => handleCustomChange(key, event.target.value)}
                              aria-label={t(lang, labelKey)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </div>
                          <span className="min-w-0 truncate text-[11px] text-text-muted">
                            {t(lang, labelKey)}
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleSavePreset}
                        disabled={savedPresets.length >= 5}
                        className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                      >
                        <Save size={13} className="flex-shrink-0" />
                        <span className="truncate">
                          {savedPresets.length >= 5 ? t(lang, "presetFull") : t(lang, "savePreset")}
                        </span>
                      </button>

                      <div className="relative min-w-0 flex-1" ref={dropdownRef}>
                        <button
                          type="button"
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                          aria-expanded={dropdownOpen}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary cursor-pointer"
                        >
                          <span className="truncate">{t(lang, "selectPreset")}</span>
                          {savedPresets.length > 0 && (
                            <span className="rounded-full bg-accent-light px-1.5 py-0.5 text-[10px] text-accent">
                              {savedPresets.length}
                            </span>
                          )}
                          <ChevronDown
                            size={13}
                            className={`flex-shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                          />
                        </button>

                        {dropdownOpen && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-bg-primary shadow-lg">
                            {savedPresets.length === 0 ? (
                              <div className="px-3 py-4 text-center text-xs text-text-muted">
                                {t(lang, "noPresets")}
                              </div>
                            ) : (
                              savedPresets.map((preset, index) => (
                                <div
                                  key={`${preset.name}-${index}`}
                                  className="flex items-center gap-2 border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-bg-hover"
                                >
                                  <div className="flex flex-shrink-0 gap-0.5">
                                    {[preset.colors.bgPrimary, preset.colors.bgSecondary, preset.colors.accent].map((color, colorIndex) => (
                                      <div
                                        key={`${color}-${colorIndex}`}
                                        className="h-3.5 w-3.5 rounded-full border border-border"
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleLoadPreset(index)}
                                    className="min-w-0 flex-1 truncate text-left text-xs text-text-primary transition-colors hover:text-accent cursor-pointer"
                                  >
                                    {preset.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deletePreset(index)}
                                    aria-label={`${t(lang, "deletePreset")} ${preset.name}`}
                                    className="flex-shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-danger cursor-pointer"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {activeSection === "language" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {langs.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setLang(item.value)}
                      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all cursor-pointer
                        ${lang === item.value
                          ? "border-accent bg-accent-light text-accent"
                          : "border-border bg-bg-secondary/35 text-text-secondary hover:border-text-muted hover:bg-bg-hover"}`}
                    >
                      <Globe size={17} className="flex-shrink-0" />
                      <span className="truncate text-sm font-medium">{t(lang, item.labelKey)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
};

export default SettingsModal;
