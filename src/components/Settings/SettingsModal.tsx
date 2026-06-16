import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Palette, Globe, Save, Trash2, ChevronDown, Droplets, Keyboard, RotateCcw } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { ThemeType, LangType, CustomColors, AppShortcuts } from "@/stores/settingsStore";
import { THEME_COLORS, DEFAULT_SHORTCUTS } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { theme, lang, customColors, savedPresets, shortcuts, setTheme, setLang, setCustomColors, savePreset, loadPreset, deletePreset, setShortcuts } = useSettingsStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [recordingField, setRecordingField] = useState<keyof AppShortcuts | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  // Record shortcut keydown handler
  const handleShortcutKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, field: keyof AppShortcuts) => {
    e.preventDefault();
    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");

    const key = e.key;
    // Only accept non-modifier keys
    if (!["Control", "Alt", "Shift", "Meta"].includes(key)) {
      // Normalize key name
      const normalizedKey = key.length === 1 ? key.toUpperCase() : key;
      parts.push(normalizedKey);
      const shortcut = parts.join("+");
      setShortcuts({ ...shortcuts, [field]: shortcut });
      setRecordingField(null);
    }
  }, [shortcuts, setShortcuts]);

  if (!open) return null;

  const themes: { value: ThemeType; labelKey: "darkTheme" | "blueTheme" | "yellowTheme" | "greenTheme"; preview: string; accent: string }[] = [
    { value: "dark", labelKey: "darkTheme", preview: "#1a1b1e", accent: "#5c7cfa" },
    { value: "blue", labelKey: "blueTheme", preview: "#f0f4f8", accent: "#2563eb" },
    { value: "yellow", labelKey: "yellowTheme", preview: THEME_COLORS.yellow.bgPrimary, accent: THEME_COLORS.yellow.accent },
    { value: "green", labelKey: "greenTheme", preview: THEME_COLORS.green.bgPrimary, accent: THEME_COLORS.green.accent },
  ];

  const langs: { value: LangType; labelKey: "chinese" | "english" }[] = [
    { value: "zh", labelKey: "chinese" },
    { value: "en", labelKey: "english" },
  ];

  const cc: CustomColors = customColors || THEME_COLORS.blue;

  const handleCustomChange = (key: keyof CustomColors, value: string) => {
    setCustomColors({ ...cc, [key]: value });
  };

  const handleSavePreset = () => {
    if (savedPresets.length >= 5) return;
    const name = prompt(t(lang, "presetName"), `${lang === "zh" ? "自定义" : "Custom"} ${savedPresets.length + 1}`);
    if (name) savePreset(name);
  };

  const handleLoadPreset = (index: number) => {
    loadPreset(index);
    setDropdownOpen(false);
  };

  const colorFields: { key: keyof CustomColors; labelKey: "bgPrimary" | "bgSecondary" | "bgSidebar" | "textPrimary" | "accentColor" }[] = [
    { key: "bgPrimary", labelKey: "bgPrimary" },
    { key: "bgSecondary", labelKey: "bgSecondary" },
    { key: "bgSidebar", labelKey: "bgSidebar" },
    { key: "textPrimary", labelKey: "textPrimary" },
    { key: "accent", labelKey: "accentColor" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-bg-primary rounded-xl shadow-2xl border border-border w-[460px] max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">{t(lang, "settingsTitle")}</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme Presets */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette size={16} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">{t(lang, "themeColor")}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {themes.map((th) => (
                <button
                  key={th.value}
                  onClick={() => setTheme(th.value)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 transition-all cursor-pointer
                    ${theme === th.value ? "border-accent bg-accent-light" : "border-border hover:border-text-muted"}`}
                >
                  <div className="relative w-9 h-9 rounded-lg border border-border shadow-sm overflow-hidden">
                    <div className="absolute inset-0" style={{ backgroundColor: th.preview }} />
                    <div className="absolute bottom-0 left-0 right-0 h-2" style={{ backgroundColor: th.accent }} />
                  </div>
                  <span className="text-[10px] text-text-secondary leading-tight">{t(lang, th.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Palette */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Droplets size={16} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">{t(lang, "customPalette")}</span>
              {theme === "custom" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-white ml-auto">
                  {t(lang, "customTheme")}
                </span>
              )}
            </div>
            <div className="grid grid-cols-5 gap-2 mb-3">
              {colorFields.map(({ key, labelKey }) => (
                <label key={key} className="flex flex-col items-center gap-1 cursor-pointer">
                  <div className="relative">
                    <div
                      className="w-8 h-8 rounded-lg border border-border shadow-sm"
                      style={{ backgroundColor: cc[key] }}
                    />
                    <input
                      type="color"
                      value={cc[key]}
                      onChange={(e) => handleCustomChange(key, e.target.value)}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                    />
                  </div>
                  <span className="text-[10px] text-text-muted leading-tight">{t(lang, labelKey)}</span>
                </label>
              ))}
            </div>

            {/* Save Preset + Select Preset Row */}
            <div className="flex gap-2">
              {/* Left: Save Preset */}
              <button
                onClick={handleSavePreset}
                disabled={savedPresets.length >= 5}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                  border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary
                  disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer min-w-0"
              >
                <Save size={12} className="flex-shrink-0" />
                <span className="truncate">{savedPresets.length >= 5 ? t(lang, "presetFull") : t(lang, "savePreset")}</span>
              </button>

              {/* Right: Select Preset Dropdown */}
              <div className="relative flex-1 min-w-0" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium
                    border border-border text-text-secondary hover:bg-bg-hover hover:text-text-primary
                    transition-colors cursor-pointer"
                >
                  <span className="truncate">{t(lang, "selectPreset")}</span>
                  {savedPresets.length > 0 && (
                    <span className="flex-shrink-0 text-[10px] px-1 py-0.5 rounded-full bg-accent-light text-accent">
                      {savedPresets.length}
                    </span>
                  )}
                  <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown Panel */}
                {dropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border
                    rounded-lg shadow-lg z-10 overflow-hidden">
                    {savedPresets.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-text-muted">
                        {t(lang, "noPresets")}
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {savedPresets.map((preset, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-bg-hover transition-colors
                              border-b border-border last:border-b-0"
                          >
                            {/* Color preview dots */}
                            <div className="flex gap-0.5 flex-shrink-0">
                              {[preset.colors.bgPrimary, preset.colors.bgSecondary, preset.colors.accent].map((c, i) => (
                                <div key={i} className="w-3.5 h-3.5 rounded-full border border-border" style={{ backgroundColor: c }} />
                              ))}
                            </div>
                            <button
                              onClick={() => handleLoadPreset(index)}
                              className="flex-1 text-left text-xs text-text-primary truncate hover:text-accent cursor-pointer transition-colors"
                            >
                              {preset.name}
                            </button>
                            <button
                              onClick={() => deletePreset(index)}
                              className="p-1 rounded text-text-muted hover:text-danger hover:bg-bg-hover transition-colors cursor-pointer flex-shrink-0"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Language */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe size={16} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">{t(lang, "language")}</span>
            </div>
            <div className="flex gap-2">
              {langs.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLang(l.value)}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer border-2
                    ${lang === l.value
                      ? "border-accent bg-accent-light text-accent"
                      : "border-border text-text-secondary hover:border-text-muted hover:bg-bg-hover"}`}
                >
                  {t(lang, l.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Keyboard size={16} className="text-accent" />
              <span className="text-sm font-medium text-text-primary">{t(lang, "shortcutsSection")}</span>
            </div>
            <div className="space-y-2">
              {([
                { field: "toggleWindow" as keyof AppShortcuts, labelKey: "shortcutToggleWindow" as const },
              ]).map(({ field, labelKey }) => (
                <div key={field} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-28 flex-shrink-0">{t(lang, labelKey)}</span>
                  <input
                    type="text"
                    readOnly
                    value={recordingField === field ? t(lang, "pressShortcut") : shortcuts[field]}
                    onFocus={() => setRecordingField(field)}
                    onBlur={() => setRecordingField(null)}
                    onKeyDown={(e) => handleShortcutKeyDown(e, field)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-mono text-center outline-none transition-colors cursor-pointer
                      border ${recordingField === field
                        ? "border-accent bg-accent-light text-accent"
                        : "border-border bg-bg-secondary text-text-primary hover:border-text-muted"}`}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setShortcuts(DEFAULT_SHORTCUTS)}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              <RotateCcw size={11} />
              <span>{t(lang, "resetShortcuts")}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors cursor-pointer"
          >
            {t(lang, "close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
