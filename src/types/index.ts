export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  category?: string;
  createdAt: string;
  order: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AppFont {
  name: string;
  family: string;
  path: string;
}

export type ViewType = "todo" | "note";
