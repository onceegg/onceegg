"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type CompositionEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import styles from "./jot.module.css";
import { loadJotState, saveJotState } from "./jot-storage";
import {
  EMPTY_JOT_STATE,
  JOT_COLORS,
  JOT_PALETTE,
  type JotNote,
  type JotState,
} from "./jot-types";

const CANVAS_DOUBLE_TAP_MS = 280;
const NOTE_DOUBLE_TAP_MS = 235;
const REMOVE_DISTANCE = 72;
const REMOVE_VELOCITY = -0.45;
const VELOCITY_SAMPLE_MAX_AGE = 80;
const FONT_SIZE = 18;
const FONT_TRACKING_EM = 0.04;

type Point = [number, number];

type CanvasPointer = {
  pointerId: number;
  x: number;
  y: number;
  moved: boolean;
};

type NotePointer = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  moved: boolean;
  swiping: boolean;
};

type TapeProperties = CSSProperties & {
  "--jot-paper-color": string;
  "--jot-ink-color": string;
  "--jot-tape-width": string;
  "--jot-text-inset": string;
  "--jot-paper-shape": string;
  "--jot-paper-x": string;
  "--jot-paper-y": string;
  "--jot-tape-offset": string;
  "--jot-tape-tilt": string;
  "--jot-swipe-x": string;
};

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function makeHorizontalEdge(
  random: () => number,
  startX: number,
  endX: number,
  baseY: number,
) {
  const points: Point[] = [[startX, baseY + (random() - 0.5) * 1.2]];
  let x = startX;
  let drift = (random() - 0.5) * 1.4;

  while (x < endX - 8) {
    x = Math.min(endX, x + 9 + random() * 17);
    drift = clamp(drift + (random() - 0.5) * 1.7, -2.5, 2.5);
    points.push([x, baseY + drift]);
  }

  return points;
}

function makeVerticalEdge(
  random: () => number,
  startY: number,
  endY: number,
  baseX: number,
) {
  const points: Point[] = [[baseX + (random() - 0.5) * 1.6, startY]];
  let y = startY;
  let drift = (random() - 0.5) * 2.2;

  while (y < endY - 3) {
    y = Math.min(endY, y + 3.6 + random() * 5.4);
    drift = clamp(drift + (random() - 0.5) * 2.6, -4.4, 4.4);
    const notch = random() < 0.24 ? (random() - 0.5) * 5.2 : 0;
    points.push([baseX + drift + notch, y]);
  }

  return points;
}

function makeTornPolygon(seed: number) {
  const random = seededRandom(seed);
  const top = makeHorizontalEdge(random, 10, 350, 5.3);
  const right = makeVerticalEdge(random, top.at(-1)?.[1] ?? 5.3, 66.7, 350);
  const bottom = makeHorizontalEdge(random, 10, 350, 66.7).reverse();
  const left = makeVerticalEdge(
    random,
    top[0][1],
    bottom.at(-1)?.[1] ?? 66.7,
    10,
  ).reverse();

  return [...top, ...right, ...bottom, ...left]
    .map(([x, y]) => `${((x / 360) * 100).toFixed(2)}% ${((y / 72) * 100).toFixed(2)}%`)
    .join(", ");
}

function getTextUnits(value: string) {
  return Array.from(value).reduce((total, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (/\s/.test(character)) return total + 0.5;
    if (codePoint <= 0x7f) return total + 0.6;
    if (codePoint > 0xffff) return total + 1.16;
    return total + 1;
  }, 0);
}

function fitText(value: string, maxUnits: number) {
  let fitted = "";
  for (const character of Array.from(value.replace(/[\r\n]/g, ""))) {
    const nextValue = fitted + character;
    if (getTextUnits(nextValue) > maxUnits) break;
    fitted = nextValue;
  }
  return fitted;
}

function getNoteId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `jot-${crypto.randomUUID()}`;
  }
  return `jot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortNotes(notes: JotNote[]) {
  return [...notes].sort((first, second) => {
    if (first.isCompleted !== second.isCompleted) {
      return first.isCompleted ? 1 : -1;
    }
    if (first.isCompleted) {
      return (first.completedAt ?? first.updatedAt) - (second.completedAt ?? second.updatedAt);
    }
    return first.createdAt - second.createdAt;
  });
}

type TapeNoteProps = {
  note: JotNote;
  viewportWidth: number;
  isEditing: boolean;
  isNew: boolean;
  onEdit: () => void;
  onChange: (text: string) => void;
  onFinishEditing: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onInteractionStart: () => void;
};

function TapeNote({
  note,
  viewportWidth,
  isEditing,
  isNew,
  onEdit,
  onChange,
  onFinishEditing,
  onToggle,
  onRemove,
  onInteractionStart,
}: TapeNoteProps) {
  const seed = useMemo(() => hashString(note.id), [note.id]);
  const naturalWidthRatio = 0.838 + ((seed >>> 4) % 27) / 1000;
  const widthRatio =
    naturalWidthRatio * (viewportWidth > 720 ? 5 / 6 : 1);
  const tapeWidth = viewportWidth * widthRatio;
  const textInset = clamp(tapeWidth * 0.06, 32, 64);
  const maxTextUnits = Math.max(
    4,
    Math.floor(
      (tapeWidth - textInset * 2) /
        (FONT_SIZE * (1 + FONT_TRACKING_EM)),
    ),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerRef = useRef<NotePointer | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapAtRef = useRef(0);
  const removeTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const [translationX, setTranslationX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const resetSwipe = useCallback(() => {
    pointerRef.current = null;
    setIsDragging(false);
    setTranslationX(0);
  }, []);

  const resetInterruptedSwipe = useCallback(() => {
    if (pointerRef.current === null) return;
    resetSwipe();
  }, [resetSwipe]);

  useEffect(() => {
    if (!isEditing) return;
    const frame = window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditing]);

  useEffect(
    () => () => {
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") resetInterruptedSwipe();
    };

    window.addEventListener("blur", resetInterruptedSwipe);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", resetInterruptedSwipe);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetInterruptedSwipe]);

  function handleTextChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.currentTarget.value;
    onChange(isComposingRef.current ? nextValue.replace(/[\r\n]/g, "") : fitText(nextValue, maxTextUnits));
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    isComposingRef.current = false;
    onChange(fitText(event.currentTarget.value, maxTextUnits));
  }

  function beginPointer(event: PointerEvent<HTMLDivElement>) {
    if (isEditing || isRemoving || event.button !== 0) return;
    event.stopPropagation();

    const stalePointer = pointerRef.current;
    if (stalePointer && event.currentTarget.hasPointerCapture(stalePointer.pointerId)) {
      event.currentTarget.releasePointerCapture(stalePointer.pointerId);
    }
    resetSwipe();
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    onInteractionStart();
    pointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      moved: false,
      swiping: false,
    };
    setIsDragging(true);
  }

  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    event.stopPropagation();

    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    const now = performance.now();
    const sampleElapsed = Math.max(1, now - pointer.lastAt);
    const sampleVelocityX = (event.clientX - pointer.lastX) / sampleElapsed;
    if (Math.hypot(deltaX, deltaY) > 7) pointer.moved = true;
    if (!pointer.swiping && deltaX < -10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      pointer.swiping = true;
    }
    pointer.velocityX = pointer.velocityX * 0.3 + sampleVelocityX * 0.7;
    pointer.lastX = event.clientX;
    pointer.lastAt = now;

    if (pointer.swiping) setTranslationX(Math.min(0, deltaX));
  }

  function cancelPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointerRef.current?.pointerId !== event.pointerId) return;
    resetSwipe();
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    event.stopPropagation();

    pointerRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = event.clientX - pointer.startX;
    const sampleAge = performance.now() - pointer.lastAt;
    const velocityX = sampleAge <= VELOCITY_SAMPLE_MAX_AGE ? pointer.velocityX : 0;
    if (pointer.swiping) {
      if (deltaX < -REMOVE_DISTANCE || velocityX < REMOVE_VELOCITY) {
        setIsRemoving(true);
        setTranslationX(-Math.max(viewportWidth * 1.2, 460));
        removeTimerRef.current = window.setTimeout(onRemove, 190);
      } else {
        setTranslationX(0);
      }
      return;
    }

    if (pointer.moved) return;
    const now = Date.now();
    if (now - lastTapAtRef.current <= NOTE_DOUBLE_TAP_MS) {
      lastTapAtRef.current = 0;
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      onToggle();
      return;
    }

    lastTapAtRef.current = now;
    tapTimerRef.current = window.setTimeout(() => {
      lastTapAtRef.current = 0;
      tapTimerRef.current = null;
      onEdit();
    }, NOTE_DOUBLE_TAP_MS);
  }

  function handleKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onEdit();
    }
  }

  const palette = JOT_PALETTE[note.color];
  const tapeStyle: TapeProperties = {
    "--jot-paper-color": note.isCompleted ? "#BDB8AF" : palette.surface,
    "--jot-ink-color": note.isCompleted ? "#494640" : palette.ink,
    "--jot-tape-width": `${(widthRatio * 100).toFixed(2)}vw`,
    "--jot-text-inset": `${textInset.toFixed(1)}px`,
    "--jot-paper-shape": `polygon(${makeTornPolygon(seed)})`,
    "--jot-paper-x": `${-((seed >>> 5) % 58)}px`,
    "--jot-paper-y": `${-((seed >>> 13) % 12)}px`,
    "--jot-tape-offset": `${((seed >>> 10) % 11) - 5}px`,
    "--jot-tape-tilt": `${(((seed >>> 17) % 13) - 6) / 22}deg`,
    "--jot-swipe-x": `${translationX}px`,
  };

  return (
    <div
      className={styles.noteSlot}
      data-note-id={note.id}
      data-completed={note.isCompleted || undefined}
    >
      <div
        className={[
          styles.tape,
          note.isCompleted ? styles.isCompleted : "",
          isDragging ? styles.isDragging : "",
          isRemoving ? styles.isRemoving : "",
          isNew ? styles.isNew : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-jot-note
        role={isEditing ? undefined : "button"}
        tabIndex={isEditing ? -1 : 0}
        aria-label={
          isEditing
            ? undefined
            : `${note.text || "空白便签"}，${note.isCompleted ? "已完成" : "未完成"}`
        }
        style={tapeStyle}
        onKeyDown={isEditing ? undefined : handleKeyboard}
        onLostPointerCapture={cancelPointer}
        onPointerCancel={cancelPointer}
        onPointerDown={beginPointer}
        onPointerMove={movePointer}
        onPointerUp={finishPointer}
      >
        <div className={styles.paper}>
          <span className={styles.paperTexture} aria-hidden="true" />
          <span className={styles.paperGrain} aria-hidden="true" />

          {isEditing ? (
            <input
              ref={inputRef}
              className={styles.noteInput}
              value={note.text}
              aria-label={note.isCompleted ? "编辑已完成便签" : "编辑便签"}
              autoComplete="off"
              enterKeyHint="done"
              spellCheck={false}
              onBlur={onFinishEditing}
              onChange={handleTextChange}
              onClick={(event) => event.stopPropagation()}
              onCompositionEnd={handleCompositionEnd}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ) : (
            <span className={styles.noteText}>{note.text}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function JotApp() {
  const [state, setState] = useState<JotState>(EMPTY_JOT_STATE);
  const [isReady, setIsReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newNoteId, setNewNoteId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(390);
  const canvasPointerRef = useRef<CanvasPointer | null>(null);
  const lastCanvasTapAtRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setState(loadJotState());
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : "本地便签没有成功打开");
      } finally {
        setIsReady(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const updateViewportWidth = () => setViewportWidth(window.innerWidth);
    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    try {
      saveJotState(state);
      if (storageError !== null) {
        window.setTimeout(() => setStorageError(null), 0);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "便签没有成功保存";
      window.setTimeout(() => setStorageError(message), 0);
    }
  }, [isReady, state, storageError]);

  useEffect(() => {
    if (!newNoteId) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-note-id="${newNoteId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = window.setTimeout(() => setNewNoteId(null), 360);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [newNoteId]);

  const notes = useMemo(() => sortNotes(state.notes), [state.notes]);

  const createNote = useCallback(() => {
    const id = getNoteId();
    const now = Date.now();
    setState((current) => ({
      notes: [
        ...current.notes,
        {
          id,
          text: "",
          color: JOT_COLORS[current.nextColorIndex % JOT_COLORS.length],
          isCompleted: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
      nextColorIndex: current.nextColorIndex + 1,
    }));
    setNewNoteId(id);
    setEditingId(id);
  }, []);

  const updateNote = useCallback((id: string, text: string) => {
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === id ? { ...note, text, updatedAt: Date.now() } : note,
      ),
    }));
  }, []);

  const toggleNote = useCallback((id: string) => {
    const now = Date.now();
    setEditingId(null);
    setState((current) => ({
      ...current,
      notes: current.notes.map((note) =>
        note.id === id
          ? {
              ...note,
              isCompleted: !note.isCompleted,
              completedAt: note.isCompleted ? null : now,
              updatedAt: now,
            }
          : note,
      ),
    }));
  }, []);

  const removeNote = useCallback((id: string) => {
    setEditingId((current) => (current === id ? null : current));
    setState((current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== id),
    }));
  }, []);

  function handleCanvasPointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as Element).closest("[data-jot-note]")) return;
    canvasPointerRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }

  function handleCanvasPointerMove(event: PointerEvent<HTMLElement>) {
    const pointer = canvasPointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.moved) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 9) {
      pointer.moved = true;
    }
  }

  function handleCanvasPointerUp(event: PointerEvent<HTMLElement>) {
    const pointer = canvasPointerRef.current;
    canvasPointerRef.current = null;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.moved) return;
    if ((event.target as Element).closest("[data-jot-note]")) return;

    setEditingId(null);
    const now = Date.now();
    if (now - lastCanvasTapAtRef.current <= CANVAS_DOUBLE_TAP_MS) {
      lastCanvasTapAtRef.current = 0;
      createNote();
    } else {
      lastCanvasTapAtRef.current = now;
    }
  }

  return (
    <main
      className={styles.jotPage}
      lang="zh-CN"
      aria-label="Jot 本地便签"
      onPointerCancel={() => {
        canvasPointerRef.current = null;
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onScroll={() => {
        lastCanvasTapAtRef.current = 0;
        if (canvasPointerRef.current) canvasPointerRef.current.moved = true;
      }}
    >
      <span
        hidden
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          __html:
            "<!-- THESIS: The note is the control; no toolbar, account, or editor route. OWN-WORLD: OnceEgg watercolor canvas, 23 torn pigment tapes, quiet typewriter ink, down-right shadow. STORY: Double-tap blank space to write, tap to edit, double-tap to complete, swipe left to tear away. FIRST VIEWPORT: A paper field holding nine 85%-wide tapes per screen; unfinished notes lead and dimmed complete notes settle below. FORM: A single tactile note wall extending OnceEgg's paper constellation. -->",
        }}
      />

      <div className={styles.notes}>
        {notes.map((note) => (
          <TapeNote
            key={note.id}
            note={note}
            viewportWidth={viewportWidth}
            isEditing={editingId === note.id}
            isNew={newNoteId === note.id}
            onEdit={() => setEditingId(note.id)}
            onChange={(text) => updateNote(note.id, text)}
            onFinishEditing={() =>
              setEditingId((current) => (current === note.id ? null : current))
            }
            onToggle={() => toggleNote(note.id)}
            onRemove={() => removeNote(note.id)}
            onInteractionStart={() => {
              lastCanvasTapAtRef.current = 0;
            }}
          />
        ))}

        {notes.length === 0 ? (
          <div className={styles.emptyState} aria-live="polite">
            <span>{isReady ? "双击空白处" : "正在铺纸…"}</span>
          </div>
        ) : null}

        {notes.length > 0 ? <div className={styles.footerSpace} aria-hidden="true" /> : null}
      </div>

      {storageError ? (
        <p className={styles.storageError} role="status">
          本地便签没有成功保存：{storageError}
        </p>
      ) : null}
    </main>
  );
}
