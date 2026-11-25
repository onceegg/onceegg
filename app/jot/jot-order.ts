import type { JotState } from "./jot-types";

export function reorderPending(state: JotState, id: string, destinationId: string): JotState {
  const pending = state.notes.filter(note => !note.isCompleted);
  const from = pending.findIndex(note => note.id === id);
  const to = pending.findIndex(note => note.id === destinationId);
  if (from < 0 || to < 0 || from === to) return state;
  pending.splice(to, 0, pending.splice(from, 1)[0]);
  let index = 0;
  return { ...state, notes: state.notes.map(note => note.isCompleted ? note : pending[index++]) };
}

export function completeNote(state: JotState, id: string, completedAt: number): JotState {
  const note = state.notes.find(item => item.id === id);
  if (!note || note.isCompleted) return state;
  const record = { noteId: id, text: note.text, color: note.color, completedAt };
  return {
    ...state,
    notes: state.notes.map(item => item.id === id ? { ...note, isCompleted: true, completedAt, updatedAt: completedAt } : item),
    history: [...state.history.filter(item => item.noteId !== id), record],
  };
}

export function reopenNote(state: JotState, id: string): JotState {
  const record = state.history.find(item => item.noteId === id);
  if (!record) return state;
  const now = Date.now();
  const notes = state.notes.some(note => note.id === id)
    ? state.notes.map(note => note.id === id ? { ...note, isCompleted: false, completedAt: null, updatedAt: now } : note)
    : [...state.notes, { id, text: record.text, color: record.color, isCompleted: false, completedAt: null, createdAt: now, updatedAt: now }];
  return { ...state, notes, history: state.history.filter(item => item.noteId !== id) };
}
