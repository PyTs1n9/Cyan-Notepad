/**
 * Requests raised in the todo sidebar that only the main task view can serve:
 * opening a description editor, drafting a subtask, confirming a delete.
 *
 * A single module-level slot instead of a store — exactly one intent can be in
 * flight, it is consumed on the tick it was raised, and none of it is data the
 * app would ever persist.
 */
export type TodoIntent =
  | { kind: "edit-description"; todoId: string }
  | { kind: "add-subtask"; todoId: string }
  | { kind: "delete-todo"; todoId: string };

const TODO_INTENT_EVENT = "qing-notepad:todo-intent";

let pendingIntent: TodoIntent | null = null;

export function requestTodoIntent(intent: TodoIntent): void {
  pendingIntent = intent;
  window.dispatchEvent(new Event(TODO_INTENT_EVENT));
}

/** Subscribes a consumer; the returned function detaches it. */
export function subscribeTodoIntent(listener: (intent: TodoIntent) => void): () => void {
  const handleIntent = () => {
    if (!pendingIntent) return;
    const intent = pendingIntent;
    pendingIntent = null;
    listener(intent);
  };
  window.addEventListener(TODO_INTENT_EVENT, handleIntent);
  return () => window.removeEventListener(TODO_INTENT_EVENT, handleIntent);
}
