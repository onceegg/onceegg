"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";

type WordId = "ideas" | "products" | "experiments" | "artworks" | "notes" | "jot";

type Point = {
  x: number;
  y: number;
};

type Positions = Record<WordId, Point>;

type HorizontalLimits = {
  minimum: number;
  maximum: number;
};

type DragState = {
  id: WordId;
  pointerId: number;
  startX: number;
  startY: number;
  fieldWidth: number;
  fieldHeight: number;
  origin: Point;
  moved: boolean;
};

export type IncubatorNote = {
  slug: string;
  title?: string;
  date: string;
};

type IncubatorProps = {
  notes: IncubatorNote[];
};

const WORDS: Array<{ id: WordId; label: string }> = [
  { id: "ideas", label: "Ideas," },
  { id: "products", label: "products," },
  { id: "experiments", label: "experiments," },
  { id: "artworks", label: "artworks," },
  { id: "notes", label: "and notes" },
  { id: "jot", label: "jot," },
];

const LAYOUTS: Positions[] = [
  {
    ideas: { x: 0.14, y: 0.2 },
    products: { x: 0.67, y: 0.24 },
    experiments: { x: 0.27, y: 0.65 },
    artworks: { x: 0.72, y: 0.78 },
    notes: { x: 0.52, y: 0.45 },
    jot: { x: 0.34, y: 0.88 },
  },
  {
    ideas: { x: 0.64, y: 0.16 },
    products: { x: 0.2, y: 0.38 },
    experiments: { x: 0.68, y: 0.6 },
    artworks: { x: 0.34, y: 0.82 },
    notes: { x: 0.79, y: 0.84 },
    jot: { x: 0.48, y: 0.46 },
  },
  {
    ideas: { x: 0.2, y: 0.76 },
    products: { x: 0.7, y: 0.74 },
    experiments: { x: 0.52, y: 0.22 },
    artworks: { x: 0.32, y: 0.46 },
    notes: { x: 0.78, y: 0.42 },
    jot: { x: 0.52, y: 0.86 },
  },
];

const IDEA_NUDGES: Point[] = [
  { x: 0.045, y: -0.035 },
  { x: -0.035, y: 0.045 },
  { x: 0.055, y: 0.025 },
  { x: -0.04, y: -0.03 },
];

const NOTE_NODE_OFFSETS: Point[] = [
  { x: 0.14, y: -0.08 },
  { x: -0.14, y: 0.07 },
  { x: 0.18, y: 0.08 },
  { x: -0.17, y: -0.09 },
  { x: 0.02, y: -0.17 },
  { x: 0.16, y: 0.17 },
  { x: -0.15, y: 0.18 },
  { x: 0.21, y: -0.03 },
  { x: -0.21, y: 0.01 },
  { x: 0.1, y: -0.2 },
  { x: -0.09, y: -0.19 },
  { x: 0.04, y: 0.22 },
];

const HORIZONTAL_LIMITS: Record<WordId, HorizontalLimits> = {
  ideas: { minimum: 0.07, maximum: 0.9 },
  products: { minimum: 0.08, maximum: 0.86 },
  experiments: { minimum: 0.1, maximum: 0.8 },
  artworks: { minimum: 0.12, maximum: 0.78 },
  notes: { minimum: 0.16, maximum: 0.84 },
  jot: { minimum: 0.1, maximum: 0.9 },
};

function copyLayout(layout: Positions): Positions {
  return {
    ideas: { ...layout.ideas },
    products: { ...layout.products },
    experiments: { ...layout.experiments },
    artworks: { ...layout.artworks },
    notes: { ...layout.notes },
    jot: { ...layout.jot },
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function constrainPoint(id: WordId, point: Point): Point {
  const limits = HORIZONTAL_LIMITS[id];

  return {
    x: clamp(point.x, limits.minimum, limits.maximum),
    y: clamp(point.y, 0.1, 0.88),
  };
}

function getNodePosition(anchor: Point, index: number): Point {
  const offset = NOTE_NODE_OFFSETS[index % NOTE_NODE_OFFSETS.length];

  return {
    x: clamp(anchor.x + offset.x, 0.08, 0.92),
    y: clamp(anchor.y + offset.y, 0.08, 0.92),
  };
}

function getIndexPosition(anchor: Point): Point {
  return {
    x: clamp(anchor.x - 0.09, 0.1, 0.9),
    y: clamp(anchor.y + 0.1, 0.1, 0.9),
  };
}

function formatNodeDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year.slice(-2)}`;
}

export function Incubator({ notes }: IncubatorProps) {
  const router = useRouter();
  const [positions, setPositions] = useState<Positions>(() =>
    copyLayout(LAYOUTS[0]),
  );
  const [activeWord, setActiveWord] = useState<WordId | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [eggHatchCycle, setEggHatchCycle] = useState(0);
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const layoutIndexRef = useRef(0);
  const ideaNudgeIndexRef = useRef(0);

  function nudgeIdeas() {
    const nudge = IDEA_NUDGES[ideaNudgeIndexRef.current % IDEA_NUDGES.length];
    ideaNudgeIndexRef.current += 1;

    setPositions((current) => ({
      ...current,
      ideas: constrainPoint("ideas", {
        x: current.ideas.x + nudge.x,
        y: current.ideas.y + nudge.y,
      }),
    }));
  }

  function snapProducts() {
    setPositions((current) => ({
      ...current,
      products: constrainPoint("products", {
        x: Math.round(current.products.x * 8) / 8,
        y: Math.round(current.products.y * 6) / 6,
      }),
    }));
  }

  function cycleExperiment() {
    layoutIndexRef.current = (layoutIndexRef.current + 1) % LAYOUTS.length;
    setPositions(copyLayout(LAYOUTS[layoutIndexRef.current]));
  }

  function gatherAroundArtworks() {
    setPositions((current) => {
      const anchor = current.artworks;

      return {
        artworks: current.artworks,
        ideas: constrainPoint("ideas", {
          x: current.ideas.x + (anchor.x - current.ideas.x) * 0.1,
          y: current.ideas.y + (anchor.y - current.ideas.y) * 0.1,
        }),
        products: constrainPoint("products", {
          x: current.products.x + (anchor.x - current.products.x) * 0.1,
          y: current.products.y + (anchor.y - current.products.y) * 0.1,
        }),
        experiments: constrainPoint("experiments", {
          x:
            current.experiments.x +
            (anchor.x - current.experiments.x) * 0.1,
          y:
            current.experiments.y +
            (anchor.y - current.experiments.y) * 0.1,
        }),
        notes: constrainPoint("notes", {
          x: current.notes.x + (anchor.x - current.notes.x) * 0.1,
          y: current.notes.y + (anchor.y - current.notes.y) * 0.1,
        }),
        jot: constrainPoint("jot", {
          x: current.jot.x + (anchor.x - current.jot.x) * 0.1,
          y: current.jot.y + (anchor.y - current.jot.y) * 0.1,
        }),
      };
    });
  }

  function activateWord(id: WordId) {
    if (id === "notes") {
      setNotesOpen((current) => !current);
      return;
    }

    if (id === "jot") {
      router.push("/jot");
      return;
    }

    setNotesOpen(false);

    if (id === "ideas") {
      nudgeIdeas();
    } else if (id === "products") {
      snapProducts();
    } else if (id === "experiments") {
      cycleExperiment();
    } else {
      gatherAroundArtworks();
    }
  }

  function settleWord(id: WordId) {
    if (id === "ideas") {
      nudgeIdeas();
    } else if (id === "products") {
      snapProducts();
    }
  }

  function handlePointerDown(
    id: WordId,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    const field = fieldRef.current;

    if (!field || event.button !== 0) {
      return;
    }

    const fieldBounds = field.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      fieldWidth: fieldBounds.width,
      fieldHeight: fieldBounds.height,
      origin: positions[id],
      moved: false,
    };
    setActiveWord(id);
  }

  function handlePointerMove(
    id: WordId,
    event: PointerEvent<HTMLButtonElement>,
  ) {
    const drag = dragRef.current;

    if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) {
      return;
    }

    const distanceX = event.clientX - drag.startX;
    const distanceY = event.clientY - drag.startY;
    const resistance = id === "artworks" ? 0.58 : 1;

    if (Math.hypot(distanceX, distanceY) > 3) {
      drag.moved = true;
    }

    setPositions((current) => ({
      ...current,
      [id]: constrainPoint(id, {
        x: drag.origin.x + (distanceX / drag.fieldWidth) * resistance,
        y: drag.origin.y + (distanceY / drag.fieldHeight) * resistance,
      }),
    }));
  }

  function handlePointerEnd(
    id: WordId,
    event: PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) {
    const drag = dragRef.current;

    if (!drag || drag.id !== id || drag.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    setActiveWord(null);

    if (cancelled) {
      return;
    }

    if (drag.moved) {
      settleWord(id);
    } else {
      activateWord(id);
    }
  }

  function handleKeyboardMove(
    id: WordId,
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (id === "notes" && event.key === "Escape") {
      setNotesOpen(false);
      return;
    }

    const movement = id === "artworks" ? 0.025 : 0.04;
    const movementByKey: Partial<Record<string, Point>> = {
      ArrowLeft: { x: -movement, y: 0 },
      ArrowRight: { x: movement, y: 0 },
      ArrowUp: { x: 0, y: -movement },
      ArrowDown: { x: 0, y: movement },
    };
    const delta = movementByKey[event.key];

    if (!delta) {
      return;
    }

    event.preventDefault();
    setPositions((current) => ({
      ...current,
      [id]: constrainPoint(id, {
        x: current[id].x + delta.x,
        y: current[id].y + delta.y,
      }),
    }));
  }

  function handleKeyboardActivation(
    id: WordId,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (event.detail === 0) {
      activateWord(id);
    }
  }

  const indexPosition = getIndexPosition(positions.notes);

  return (
    <div className="incubator">
      <div className="wordmark">
        <h1 className="wordmarkTitle" id="site-title">
          OnceEgg
        </h1>
        <button
          className={`wordmarkEggButton${eggHatchCycle > 0 ? " isHatched" : ""}`}
          type="button"
          aria-label="Hatch the OnceEgg egg"
          onClick={() => setEggHatchCycle((cycle) => cycle + 1)}
        >
          <svg
            className="wordmarkEgg"
            key={eggHatchCycle}
            viewBox="0 0 100 130"
            aria-hidden="true"
          >
            <path
              className="wordmarkEggBody"
              d="M50 2 C74 2 96 46 96 82 C96 111 75 128 50 128 C25 128 4 111 4 82 C4 46 26 2 50 2 Z"
            />
            <path
              className="wordmarkEggCrack wordmarkEggCrack1"
              pathLength={1}
              d="M38 26 L49 42"
            />
            <path
              className="wordmarkEggCrack wordmarkEggCrack2"
              pathLength={1}
              d="M49 42 L41 56"
            />
            <path
              className="wordmarkEggCrack wordmarkEggCrack3"
              pathLength={1}
              d="M41 56 L55 72"
            />
          </svg>
        </button>
      </div>

      <div
        className="incubatorField"
        ref={fieldRef}
        role="group"
        aria-label="Ideas, products, experiments, artworks, notes, and Jot."
      >
        <p className="visuallyHidden" id="incubator-instructions">
          Drag the words, or use the arrow keys to rearrange them. Activate a
          word to see how it behaves. Notes reveals recent diary entries. Jot
          opens a private local note wall.
        </p>

        <div
          className={`noteConstellation${notesOpen ? " isOpen" : ""}`}
          id="incubator-notes"
          role="group"
          aria-label="Recent notes"
          aria-hidden={!notesOpen}
        >
          {notes.map((note, index) => {
            const nodePosition = getNodePosition(positions.notes, index);

            return (
              <Link
                className="noteDateNode"
                data-node-variant={index % 4}
                href={`/notes/${note.slug}`}
                key={note.slug}
                style={{
                  left: `${nodePosition.x * 100}%`,
                  top: `${nodePosition.y * 100}%`,
                }}
                tabIndex={notesOpen ? 0 : -1}
                aria-label={
                  note.title
                    ? `${formatNodeDate(note.date)} — ${note.title}`
                    : formatNodeDate(note.date)
                }
              >
                <span className="noteDateNodeInner">
                  <span className="noteDateDot" aria-hidden="true" />
                  <time dateTime={note.date}>{formatNodeDate(note.date)}</time>
                </span>
              </Link>
            );
          })}

          <Link
            className="noteConstellationIndex"
            href="/notes"
            style={{
              left: `${indexPosition.x * 100}%`,
              top: `${indexPosition.y * 100}%`,
            }}
            tabIndex={notesOpen ? 0 : -1}
          >
            all notes
          </Link>
        </div>

        {WORDS.map(({ id, label }) => (
          <button
            className={[
              "incubatorWord",
              activeWord === id ? "isActive" : "",
              id === "notes" && notesOpen ? "hasOpenNotes" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-word={id}
            key={id}
            type="button"
            style={{
              left: `${positions[id].x * 100}%`,
              top: `${positions[id].y * 100}%`,
            }}
            aria-controls={id === "notes" ? "incubator-notes" : undefined}
            aria-describedby="incubator-instructions"
            aria-expanded={id === "notes" ? notesOpen : undefined}
            onClick={(event) => handleKeyboardActivation(id, event)}
            onKeyDown={(event) => handleKeyboardMove(id, event)}
            onPointerCancel={(event) => handlePointerEnd(id, event, true)}
            onPointerDown={(event) => handlePointerDown(id, event)}
            onPointerMove={(event) => handlePointerMove(id, event)}
            onPointerUp={(event) => handlePointerEnd(id, event)}
          >
            <span className="incubatorWordSurface">
              <span className="incubatorWordLabel">{label}</span>
              {id === "notes" && <span className="orangePeriod">.</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
