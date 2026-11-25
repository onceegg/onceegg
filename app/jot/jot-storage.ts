import {
  EMPTY_JOT_STATE, JOT_COLORS, type CompletionRecord, type JotNote, type JotState,
} from "./jot-types";

export const STORAGE_KEY = "onceegg:jot:v1";
const PREFERENCES_KEY = "onceegg:jot:preferences:v1";
const STORAGE_VERSION = 4;
const colors = new Set<string>(JOT_COLORS);

export type JotPreferences = { deviceNoticeSeen: boolean; gestureHintSeen: boolean };
export const DEFAULT_JOT_PREFERENCES: JotPreferences = { deviceNoticeSeen: false, gestureHintSeen: false };

function isTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function decodeNote(note: JotNote): JotNote {
  if (!note || typeof note.id !== "string" || !note.id || typeof note.text !== "string"
    || !colors.has(note.color) || typeof note.isCompleted !== "boolean"
    || !isTime(note.createdAt) || !isTime(note.updatedAt)
    || (note.completedAt != null && !isTime(note.completedAt))) {
    throw new Error("本地便签格式无法读取");
  }
  return { ...note, text: note.text.replace(/[\r\n]/g, ""), completedAt: note.isCompleted ? note.completedAt ?? null : null };
}

export function loadJotState(): JotState {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return EMPTY_JOT_STATE;
  const data = JSON.parse(raw);
  if (!data || ![1, 2, 3, STORAGE_VERSION].includes(data.version) || !Array.isArray(data.notes)) {
    throw new Error("本地便签格式无法读取");
  }
  const notes: JotNote[] = data.notes.map(decodeNote);
  if (new Set(notes.map(note => note.id)).size !== notes.length) throw new Error("便签编号重复");
  let history: CompletionRecord[];
  if (data.version < STORAGE_VERSION) {
    // Array position now holds manual order, including reserved slots for completed notes.
    notes.sort((a, b) => a.createdAt - b.createdAt);
    history = notes.filter(note => note.isCompleted).map(note => ({
      noteId: note.id, text: note.text, color: note.color, completedAt: note.completedAt ?? note.updatedAt,
    }));
  } else {
    history = data.history;
    if (!Array.isArray(history) || history.some(record => !record || typeof record.noteId !== "string"
      || typeof record.text !== "string" || !colors.has(record.color) || !isTime(record.completedAt))
      || new Set(history.map(record => record.noteId)).size !== history.length) {
      throw new Error("本地完成记录无法读取");
    }
  }
  return { notes, history, nextColorIndex: isTime(data.nextColorIndex) ? Math.max(0, Math.floor(data.nextColorIndex)) : notes.length };
}

export function saveJotState(state: JotState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...state }));
}

export function loadJotPreferences(): JotPreferences {
  const raw = window.localStorage.getItem(PREFERENCES_KEY);
  const parsed = raw ? JSON.parse(raw) : {};
  return { deviceNoticeSeen: parsed.deviceNoticeSeen === true, gestureHintSeen: parsed.gestureHintSeen === true };
}

export function saveJotPreferences(preferences: JotPreferences) {
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
