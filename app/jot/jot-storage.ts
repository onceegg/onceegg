import {
  EMPTY_JOT_STATE,
  JOT_COLORS,
  type JotColor,
  type JotNote,
  type JotState,
} from "./jot-types";

const STORAGE_KEY = "onceegg:jot:v1";
const STORAGE_VERSION = 1;
const colorSet = new Set<string>(JOT_COLORS);

type StoredJot = {
  version: number;
  notes: unknown;
  nextColorIndex: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeNote(value: unknown): JotNote | null {
  if (!value || typeof value !== "object") return null;

  const note = value as Partial<JotNote>;
  if (
    typeof note.id !== "string" ||
    typeof note.text !== "string" ||
    typeof note.color !== "string" ||
    !colorSet.has(note.color) ||
    typeof note.isCompleted !== "boolean" ||
    !isFiniteNumber(note.createdAt) ||
    !isFiniteNumber(note.updatedAt)
  ) {
    return null;
  }

  const completedAt = isFiniteNumber(note.completedAt) ? note.completedAt : null;

  return {
    id: note.id,
    text: note.text.replace(/[\r\n]/g, ""),
    color: note.color as JotColor,
    isCompleted: note.isCompleted,
    completedAt: note.isCompleted ? completedAt : null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export function loadJotState(): JotState {
  const storedValue = window.localStorage.getItem(STORAGE_KEY);
  if (!storedValue) return { ...EMPTY_JOT_STATE, notes: [] };

  const parsed = JSON.parse(storedValue) as StoredJot;
  if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.notes)) {
    throw new Error("本地便签格式无法读取");
  }

  const notes = parsed.notes
    .map(normalizeNote)
    .filter((note): note is JotNote => note !== null);
  const nextColorIndex = isFiniteNumber(parsed.nextColorIndex)
    ? Math.max(0, Math.floor(parsed.nextColorIndex))
    : notes.length;

  return { notes, nextColorIndex };
}

export function saveJotState(state: JotState) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      notes: state.notes,
      nextColorIndex: state.nextColorIndex,
    }),
  );
}
