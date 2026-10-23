import React, { useCallback, useEffect, useRef } from "react";
import { AlignLeft, Check, Pencil, X } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { t } from "@/utils/i18n";

interface TodoDescriptionCardProps {
  description?: string;
  completed?: boolean;
  /** Controlled by the row's button: true renders the editor instead of the card. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Called with the trimmed text; an empty string means "clear it". */
  onSave: (value: string) => void;
}

/**
 * The body of a task.
 *
 * Two states only: being written (a bordered textarea) and written (a small
 * read-only card you click to edit again). There is deliberately no "empty"
 * state — an always-visible "add a description" line under every row turned a
 * long list into a wall of the same four words, so the entry moved into the
 * row's hover actions instead and this component renders nothing without text.
 */
const TodoDescriptionCard: React.FC<TodoDescriptionCardProps> = ({
  description,
  completed = false,
  editing,
  onEditingChange,
  onSave,
}) => {
  const lang = useSettingsStore((s) => s.lang);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(description ?? "");
  /** Set before the textarea unmounts so a blur cannot save twice. */
  const settledRef = useRef(false);

  const saved = (description ?? "").trim();
  const hasDescription = saved.length > 0;

  const autoGrow = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 260)}px`;
  }, []);

  // Entering edit mode always starts from the saved text, never from whatever
  // was typed and abandoned last time.
  useEffect(() => {
    if (!editing) return;
    const element = textareaRef.current;
    if (!element) return;
    draftRef.current = description ?? "";
    element.value = description ?? "";
    settledRef.current = false;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    autoGrow(element);
  }, [editing, description, autoGrow]);

  const commit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    const next = draftRef.current.trim();
    onEditingChange(false);
    if (next !== saved) onSave(next);
  };

  const cancel = () => {
    settledRef.current = true;
    draftRef.current = description ?? "";
    onEditingChange(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-accent/35 bg-bg-primary/75 p-2 shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent">
          <AlignLeft size={10} />
          {t(lang, "todoDescription")}
        </div>
        <textarea
          ref={textareaRef}
          defaultValue={description ?? ""}
          rows={2}
          placeholder={t(lang, "todoDescriptionPlaceholder")}
          onChange={(event) => {
            draftRef.current = event.target.value;
            autoGrow(event.currentTarget);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-text-primary
            outline-none placeholder:text-text-muted"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] text-text-muted">{t(lang, "descriptionSaveHint")}</span>
          <div className="flex flex-shrink-0 items-center gap-1">
            {/* preventDefault keeps focus in the textarea so the blur handler
                does not fire on the click itself — each button decides. */}
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                cancel();
              }}
              className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-text-secondary
                transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={11} />
              {t(lang, "confirmNo")}
            </button>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                commit();
              }}
              className="flex h-6 items-center gap-1 rounded-md bg-accent px-2 text-[11px] font-medium
                text-white transition-colors hover:bg-accent-hover"
            >
              <Check size={11} />
              {t(lang, "save")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasDescription) return null;

  return (
    <button
      type="button"
      onClick={() => onEditingChange(true)}
      title={t(lang, "editTodoDescription")}
      className="group/desc block w-full rounded-lg border border-transparent border-l-2 border-l-accent/35
        bg-bg-secondary/30 px-2.5 py-1.5 text-left transition-colors
        hover:border-border/60 hover:border-l-accent/60 hover:bg-bg-secondary/55"
    >
      <span className="mb-0.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-text-muted/80">
        <AlignLeft size={10} className="flex-shrink-0" />
        <span className="truncate">{t(lang, "todoDescription")}</span>
        <Pencil
          size={10}
          className="ml-auto flex-shrink-0 opacity-0 transition-opacity group-hover/desc:opacity-70"
        />
      </span>
      <span
        className={`block whitespace-pre-wrap break-words text-[13px] leading-relaxed ${
          completed ? "text-text-muted" : "text-text-secondary"
        }`}
      >
        {description}
      </span>
    </button>
  );
};

export default TodoDescriptionCard;
