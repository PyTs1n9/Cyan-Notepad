/**
 * Chat-driven note writes (permission mode "full").
 *
 * The model never touches the filesystem directly: it requests tool calls,
 * this module resolves them against the single write path below. Every write
 * snapshots the pre-edit state first, so a message-level undo can roll the
 * note back even after a restart (snapshots live in `data/ai/snapshots/`).
 *
 * Write path (shared by apply and undo):
 *   noteStore.updateNote → saveNoteContent → notify sticky windows →
 *   notify the main editor to reload (it may hold an open buffer).
 */
import { emit } from "@tauri-apps/api/event";
import { useNoteStore } from "@/stores/noteStore";
import {
  deleteNoteSnapshot,
  loadNoteContent,
  loadNoteSnapshot,
  saveNoteContent,
  saveNoteSnapshot,
  type NoteSnapshot,
} from "@/utils/storage";
import type { ChatTool, ChatToolCall } from "./chat/types";

/** Main editor listens to this and reloads when the note is open there. */
export const NOTE_EXTERNAL_SAVE_EVENT = "note:external-save";

/** One recorded note write; attached to the assistant message for undo. */
export interface AiNoteEdit {
  noteId: string;
  noteTitle: string;
  /** Snapshot of the pre-edit state; empty when the snapshot failed. */
  snapshotPath: string;
  undone?: boolean;
}

export interface NoteToolResult {
  /** Tool result fed back to the model as the `tool` message. */
  output: string;
  /** Set when a write landed; recorded for message-level undo. */
  edit?: AiNoteEdit;
}

/**
 * Resolve the authoritative current state of a note. The store's `content`
 * mirrors the live editor buffer for the open note (possibly unsaved); for
 * every other note the disk file is authoritative because the note index
 * carries metadata only.
 */
async function resolveCurrentNote(noteId: string): Promise<NoteSnapshot | null> {
  const state = useNoteStore.getState();
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) return null;
  const content =
    noteId === state.activeNoteId ? note.content : await loadNoteContent(noteId);
  return { title: note.title, content };
}

/** Shared landing point: store + disk + window notifications. */
async function writeNoteState(noteId: string, state: NoteSnapshot): Promise<void> {
  useNoteStore.getState().updateNote(noteId, {
    title: state.title,
    content: state.content,
  });
  await saveNoteContent(noteId, state.content);
  // Open sticky/tile windows follow the note; the main editor reloads its
  // buffer through the external-save event instead of being overwritten
  // from outside its own change pipeline.
  await emit("sticky:note-updated", { noteId, content: state.content });
  await emit(NOTE_EXTERNAL_SAVE_EVENT, { noteId, content: state.content });
}

interface NoteEditRequest {
  content?: string;
  title?: string;
}

async function applyNoteEdit(
  noteId: string,
  edit: NoteEditRequest,
): Promise<NoteToolResult> {
  const current = await resolveCurrentNote(noteId);
  if (!current) return { output: `错误：找不到 id 为 ${noteId} 的笔记` };

  const nextTitle = edit.title !== undefined ? edit.title.trim() : current.title;
  const nextContent = edit.content !== undefined ? edit.content : current.content;
  if (nextTitle === current.title && nextContent === current.content) {
    return { output: "内容与原文相同，未写入。" };
  }

  const snapshotPath = await saveNoteSnapshot(noteId, current);
  await writeNoteState(noteId, { title: nextTitle, content: nextContent });
  const noteTitle = nextTitle || current.title || noteId;
  return {
    output: `已更新笔记《${noteTitle}》。`,
    edit: {
      noteId,
      noteTitle,
      snapshotPath: snapshotPath ?? "",
    },
  };
}

/**
 * Roll one recorded write back to its pre-edit snapshot. Explicit user
 * action: restores unconditionally, even when the note changed since.
 */
export async function undoNoteEdit(edit: AiNoteEdit): Promise<boolean> {
  if (!edit.snapshotPath) return false;
  const snapshot = await loadNoteSnapshot(edit.snapshotPath);
  if (!snapshot) return false;
  await writeNoteState(edit.noteId, snapshot);
  await deleteNoteSnapshot(edit.snapshotPath);
  return true;
}

const READ_NOTE_CHAR_LIMIT = 24000;

/** Tool definitions offered to the model in "full" permission mode. */
export const NOTE_WRITE_TOOLS: ChatTool[] = [
  {
    name: "read_note",
    description:
      "读取一篇笔记的完整正文。修改任何笔记前必须先调用本工具取得原文，在原文基础上修改，避免丢失原有内容。",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "笔记 id，见【笔记目录】" },
      },
      required: ["noteId"],
    },
  },
  {
    name: "update_note_content",
    description:
      "整篇替换一篇笔记的正文（Markdown），修改立即生效。必须先用 read_note 读到原文，再输出在原文基础上修改后的完整正文。",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "笔记 id，见【笔记目录】" },
        content: { type: "string", description: "修改后的完整正文（Markdown）" },
      },
      required: ["noteId", "content"],
    },
  },
  {
    name: "rename_note",
    description: "修改一篇笔记的标题。",
    parameters: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "笔记 id，见【笔记目录】" },
        title: { type: "string", description: "新标题" },
      },
      required: ["noteId", "title"],
    },
  },
];

/** Execute one note tool call and return the result fed back to the model. */
export async function executeNoteTool(call: ChatToolCall): Promise<NoteToolResult> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch {
    return { output: "错误：工具参数不是合法 JSON。" };
  }
  const noteId = typeof args.noteId === "string" ? args.noteId.trim() : "";
  if (!noteId) return { output: "错误：缺少 noteId 参数。" };

  switch (call.name) {
    case "read_note": {
      const current = await resolveCurrentNote(noteId);
      if (!current) return { output: `错误：找不到 id 为 ${noteId} 的笔记` };
      const body =
        current.content.length > READ_NOTE_CHAR_LIMIT
          ? `${current.content.slice(0, READ_NOTE_CHAR_LIMIT)}\n…（正文过长，已截断）`
          : current.content;
      return {
        output: `笔记《${current.title || "无标题"}》完整正文：\n${body}`,
      };
    }
    case "update_note_content": {
      const content = typeof args.content === "string" ? args.content : null;
      if (content === null) return { output: "错误：缺少 content 参数。" };
      return applyNoteEdit(noteId, { content });
    }
    case "rename_note": {
      const title = typeof args.title === "string" ? args.title : null;
      if (title === null) return { output: "错误：缺少 title 参数。" };
      return applyNoteEdit(noteId, { title });
    }
    default:
      return { output: `错误：未知工具 ${call.name}。` };
  }
}

const NOTE_DIRECTORY_LIMIT = 200;

/**
 * Compact note directory (id + title) injected into the system prompt in
 * "full" mode so the model can target tools at a specific note.
 */
export function buildNoteDirectory(): string {
  const notes = useNoteStore.getState().notes;
  const lines = notes
    .slice(0, NOTE_DIRECTORY_LIMIT)
    .map((note) => `- ${note.id}：${note.title.trim() || "（无标题）"}`);
  if (notes.length > NOTE_DIRECTORY_LIMIT) {
    lines.push(`…（共 ${notes.length} 篇，仅列出前 ${NOTE_DIRECTORY_LIMIT} 篇）`);
  }
  return lines.join("\n");
}
