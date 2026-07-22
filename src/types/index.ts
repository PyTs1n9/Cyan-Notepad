export interface Todo {
  id: string;
  listId: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  pinned?: boolean;
  dueDate?: string;
  category?: string;
  createdAt: string;
  order: number;
}

export interface TodoList {
  id: string;
  name: string;
  pinned: boolean;
  order: number;
  createdAt: string;
}

export interface TodoListData {
  lists: TodoList[];
  activeListId: string | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  categoryId?: string | null;
  pinned?: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteCategory {
  id: string;
  name: string;
  order: number;
  createdAt: string;
}

export interface AppFont {
  name: string;
  family: string;
  path: string;
}

export type ViewType = "todo" | "note" | "canvas" | "workspace";

export type {
  CanvasBoard,
  CanvasAnchor,
  CanvasConnectorBinding,
  CanvasConnectorItem,
  CanvasConnectorStyle,
  CanvasDocument,
  CanvasDoodleEraserMark,
  CanvasDoodleEraserShape,
  CanvasDoodleItem,
  CanvasDoodlePoint,
  CanvasImageItem,
  CanvasItem,
  CanvasNodeItem,
  CanvasRichTextFields,
  CanvasRichTextItem,
  CanvasShapeItem,
  CanvasShapeType,
  CanvasTextItem,
  CanvasViewport,
} from "./canvas";
