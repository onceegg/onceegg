import {
  EMPTY_JOT_STATE,
  JOT_COLORS,
  type JotColor,
  type JotLane,
  type JotNote,
  type JotState,
} from "./jot-types";

const STORAGE_KEY = "onceegg:jot:v1";
const PREFERENCES_KEY = "onceegg:jot:preferences:v1";
const STORAGE_VERSION = 2;
const colorSet = new Set<string>(JOT_COLORS);

export type JotPreferences = {
  deviceNoticeSeen: boolean;
  gestureHintSeen: boolean;
};

export const DEFAULT_JOT_PREFERENCES: JotPreferences = {
  deviceNoticeSeen: false,
  gestureHintSeen: false,
};

type StoredJot = {
  version: number;
  notes: unknown;
  nextColorIndex: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeNote(value: unknown, fallbackIndex: number): JotNote | null {
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
    lane:
      note.lane === "left" || note.lane === "right"
        ? (note.lane as JotLane)
        : fallbackIndex % 2 === 0
          ? "left"
          : "right",
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
  if (![1, STORAGE_VERSION].includes(parsed.version) || !Array.isArray(parsed.notes)) {
    throw new Error("本地便签格式无法读取");
  }

  const notes: JotNote[] = [];
  parsed.notes.forEach((value) => {
    const note = normalizeNote(value, notes.length);
    if (note) notes.push(note);
  });
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

export function loadJotPreferences(): JotPreferences {
  const storedValue = window.localStorage.getItem(PREFERENCES_KEY);
  if (!storedValue) return { ...DEFAULT_JOT_PREFERENCES };

  const parsed = JSON.parse(storedValue) as Partial<JotPreferences>;
  return {
    deviceNoticeSeen: parsed.deviceNoticeSeen === true,
    gestureHintSeen: parsed.gestureHintSeen === true,
  };
}

export function saveJotPreferences(preferences: JotPreferences) {
  window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
