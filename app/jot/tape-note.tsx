import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { JOT_PALETTE, type JotNote } from "./jot-types";
import { hashString, tornPolygon } from "./tape-shape";
import { startNoteDrag } from "./note-drag";
import styles from "./jot.module.css";

type Props = {
  note: JotNote;
  editing: boolean;
  fresh: boolean;
  onEdit: () => void;
  onFinish: (returnFocus: boolean) => void;
  onChange: (text: string) => boolean;
  onComplete: () => void;
  onRemove: () => void;
  onReorder: (target: string, ids?: string[]) => void;
  onInteract: () => void;
};

type Contact = {
  id: number; x: number; y: number; lastX: number; lastAt: number; velocity: number;
  mode: "tap" | "scroll" | "swipe" | "reorder";
};

function Editor({ text, onChange, onFinish }: { text: string } & Pick<Props, "onChange" | "onFinish">) {
  const [draft, setDraft] = useState(text);
  const input = useRef<HTMLInputElement>(null);
  const unsaved = useRef(false);
  const returnFocus = useRef(false);
  useEffect(() => {
    const element = input.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);
  return <input ref={input} className={styles.noteInput} value={draft} aria-label="编辑便签"
    autoComplete="off" enterKeyHint="done" spellCheck={false}
    onChange={event => {
      const value = event.target.value;
      setDraft(value);
      unsaved.current = !onChange(value);
    }}
    onBlur={() => { if (!unsaved.current || onChange(draft)) onFinish(returnFocus.current); }}
    onKeyDown={event => {
      if (!event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && (event.key === "Enter" || event.key === "Escape")) {
        event.preventDefault(); event.stopPropagation();
        returnFocus.current = true;
        event.currentTarget.blur();
        returnFocus.current = false;
      }
    }} />;
}

export function TapeNote({ note, editing, fresh, onEdit, onFinish, onChange, onComplete, onRemove, onReorder, onInteract }: Props) {
  const row = useRef<HTMLDivElement>(null);
  const tape = useRef<HTMLDivElement>(null);
  const contact = useRef<Contact | null>(null);
  const drag = useRef<ReturnType<typeof startNoteDrag>>(null);
  const holdTimer = useRef(0);
  const tapTimer = useRef(0);
  const removeTimer = useRef(0);
  const lastTap = useRef(0);
  const [swipe, setSwipe] = useState(0);
  const [removing, setRemoving] = useState(false);
  const clip = useId();
  const seed = useMemo(() => hashString(note.id), [note.id]);
  const points = useMemo(() => tornPolygon(seed), [seed]);
  const color = JOT_PALETTE[note.color].surface;
  const texture = "/jot/material/tape-" + color.slice(1).toLowerCase() + ".png";

  function cancel() {
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(tapTimer.current);
    lastTap.current = 0;
    contact.current = null;
    drag.current?.end(false);
    drag.current = null;
    setSwipe(0);
  }

  useEffect(() => {
    const element = tape.current!;
    // Let the browser scroll normally until the long press actually lifts a note.
    function touchMove(event: TouchEvent) {
      if (drag.current && event.cancelable) event.preventDefault();
    }
    function secondTouch(event: TouchEvent) { if (event.touches.length > 1) cancel(); }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault(); event.stopImmediatePropagation(); cancel();
      }
    }
    function interrupted() { if (contact.current || lastTap.current) cancel(); }
    element.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchstart", secondTouch, { passive: true });
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", interrupted);
    window.addEventListener("resize", interrupted);
    document.addEventListener("visibilitychange", interrupted);
    return () => {
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(tapTimer.current);
      window.clearTimeout(removeTimer.current);
      drag.current?.end(false);
      element.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchstart", secondTouch);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", interrupted);
      window.removeEventListener("resize", interrupted);
      document.removeEventListener("visibilitychange", interrupted);
    };
  }, []);

  function lift(pointer: Contact) {
    if (contact.current !== pointer || pointer.mode !== "tap" || !row.current) return;
    drag.current = startNoteDrag(row.current, pointer.y, onReorder);
    if (drag.current) { pointer.mode = "reorder"; lastTap.current = 0; }
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (editing || removing || event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    onInteract();
    window.clearTimeout(tapTimer.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer: Contact = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX,
      lastAt: performance.now(), velocity: 0, mode: "tap" };
    contact.current = pointer;
    if (event.pointerType !== "mouse") holdTimer.current = window.setTimeout(() => lift(pointer), 350);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const pointer = contact.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    const now = performance.now();
    if (pointer.mode === "tap" && Math.hypot(dx, dy) > 7) {
      window.clearTimeout(holdTimer.current);
      lastTap.current = 0;
      if (dx < -7 && -dx > Math.abs(dy) * 1.2) pointer.mode = "swipe";
      else if (event.pointerType === "mouse" && Math.abs(dy) > Math.abs(dx)) lift(pointer);
      if (pointer.mode === "tap") pointer.mode = "scroll";
    }
    pointer.velocity = pointer.velocity * 0.3 + (event.clientX - pointer.lastX) / Math.max(1, now - pointer.lastAt) * 0.7;
    pointer.lastX = event.clientX; pointer.lastAt = now;
    if (pointer.mode === "swipe") setSwipe(Math.min(0, dx));
    drag.current?.move(event.clientY);
  }

  function up(event: PointerEvent<HTMLDivElement>) {
    const pointer = contact.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    event.stopPropagation();
    window.clearTimeout(holdTimer.current);
    contact.current = null;
    if (pointer.mode === "reorder") {
      drag.current?.move(event.clientY);
      drag.current?.end(true);
      drag.current = null;
    } else if (pointer.mode === "swipe") {
      const quick = performance.now() - pointer.lastAt < 80 && pointer.velocity < -0.45;
      if (event.clientX - pointer.x < -72 || quick) {
        setRemoving(true); setSwipe(-window.innerWidth);
        removeTimer.current = window.setTimeout(() => {
          setRemoving(false); setSwipe(0); onRemove();
        }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
      } else setSwipe(0);
    } else if (pointer.mode === "tap") {
      const now = Date.now();
      if (now - lastTap.current <= 235) { lastTap.current = 0; onComplete(); }
      else {
        lastTap.current = now;
        tapTimer.current = window.setTimeout(() => { lastTap.current = 0; onEdit(); }, 235);
      }
    }
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing) return;
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const target = event.key === "ArrowUp" ? row.current?.previousElementSibling : row.current?.nextElementSibling;
      const id = (target as HTMLElement | null)?.dataset.noteId;
      if (id) onReorder(id);
    } else if (event.key === "Enter") onEdit();
    else if (event.key === " ") onComplete();
    else if (event.key === "Delete" || event.key === "Backspace") onRemove();
    else return;
    event.preventDefault(); event.stopPropagation();
  }

  return <div ref={row} className={styles.noteSlot} data-note-id={note.id}>
    <div ref={tape} data-jot-note data-note-focus-target role={editing ? undefined : "button"}
      tabIndex={editing ? -1 : 0} aria-label={editing ? undefined : (note.text || "空白便签") + "，未完成"}
      aria-keyshortcuts={editing ? undefined : "Enter Space Delete Backspace Alt+ArrowUp Alt+ArrowDown"}
      className={styles.tape} data-fresh={fresh || undefined} data-removing={removing || undefined}
      style={{ width: (83.8 + ((seed >>> 4) % 27) / 10) + "%", "--swipe": swipe + "px",
        "--offset": (((seed >>> 10) % 11) - 5) + "px", "--tilt": ((((seed >>> 17) % 13) - 6) / 22) + "deg" } as CSSProperties}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={cancel} onLostPointerCapture={() => { if (contact.current) cancel(); }}
      onContextMenu={event => { if (!editing) event.preventDefault(); }}
      onClick={event => { if (!editing && event.detail === 0) onEdit(); }}
      onKeyDown={keyDown}>
      <svg className={styles.paper} aria-hidden="true" viewBox="0 0 360 80" preserveAspectRatio="none">
        <defs><clipPath id={clip}><polygon points={points} /></clipPath></defs>
        <polygon points={points} fill="#514536" opacity=".025" transform="translate(.3 1.4)" />
        <polygon points={points} fill="#514536" opacity=".045" transform="translate(.15 .6)" />
        <g clipPath={`url(#${clip})`}>
          <polygon points={points} fill={color} />
          <svg x="5" y="3" width="350" height="66" viewBox={`${((seed >>> 5) % 24) / 2} ${((seed >>> 13) % 8) / 2} 320 38`} preserveAspectRatio="none">
            <image href={texture} width="332" height="42" preserveAspectRatio="none" />
          </svg>
        </g>
      </svg>
      <div className={styles.writing}>{editing
        ? <Editor text={note.text} onChange={onChange} onFinish={onFinish} />
        : <span className={styles.noteText}>{note.text}</span>}</div>
    </div>
  </div>;
}
