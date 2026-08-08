"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

import {
  FieldEngine,
  type FieldMaterial,
  type FieldSelection,
  type FieldStage,
} from "./field-engine";
import styles from "./field.module.css";

const FIELD_MATERIAL: FieldMaterial = "living";

const LINE_POOL = [
  "This may land well.",
  "Worth a shot.",
  "Stay soft.",
  "Today is going to be a great day.",
  "Let it unfold.",
  "Old ways won't open new doors.",
  "Be you, not them.",
  "Good things take time.",
  "Take your time.",
] as const;

type AnswerPosition = CSSProperties & {
  "--field-answer-x": string;
  "--field-answer-y": string;
};

type AnswerPlacement = {
  horizontal: "left" | "right";
  vertical: "above" | "below";
};

function makeSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967295);
}

function statusText(stage: FieldStage) {
  if (stage === "drawing") return "The field is responding.";
  if (stage === "settling") return "The field is settling.";
  if (stage === "pick") return "Move anywhere, then choose where the particles gather.";
  if (stage === "revealed") return "A line has appeared.";
  return "Move once to wake the field.";
}

export function FieldExperience() {
  const surfaceRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FieldEngine | null>(null);
  const activePointerRef = useRef<number | null>(null);
  const activePointerModeRef = useRef<"drawing" | "pick" | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [sceneSeed] = useState(makeSeed);
  const [stage, setStage] = useState<FieldStage>("idle");
  const [selectedPoint, setSelectedPoint] = useState<FieldSelection | null>(null);
  const [answerPlacement, setAnswerPlacement] = useState<AnswerPlacement>({
    horizontal: "right",
    vertical: "below",
  });
  const [line, setLine] = useState<string | null>(null);

  const handleSettled = useCallback(() => {
    setStage("pick");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const engine = new FieldEngine(canvas, sceneSeed, {
      material: FIELD_MATERIAL,
      reducedMotion: motionQuery.matches,
      onSettled: handleSettled,
    });
    engineRef.current = engine;

    const resizeObserver = new ResizeObserver(() => engine.resize());
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, [handleSettled, sceneSeed]);

  function getLocalPoint(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function beginGesture(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const point = getLocalPoint(event);
    lastPointRef.current = point;

    if (stage === "pick") {
      activePointerRef.current = event.pointerId;
      activePointerModeRef.current = "pick";
      event.currentTarget.setPointerCapture(event.pointerId);
      engineRef.current?.setGatherPoint(point.x, point.y);
      return;
    }

    if (stage !== "idle") return;
    activePointerRef.current = event.pointerId;
    activePointerModeRef.current = "drawing";
    event.currentTarget.setPointerCapture(event.pointerId);
    engineRef.current?.beginGesture(point.x, point.y, event.timeStamp);
    setStage("drawing");
  }

  function continueGesture(event: PointerEvent<HTMLElement>) {
    const point = getLocalPoint(event);
    lastPointRef.current = point;

    if (stage === "revealed") {
      engineRef.current?.setGatherPoint(point.x, point.y);
      return;
    }

    if (activePointerModeRef.current === "pick" || stage === "pick") {
      engineRef.current?.setGatherPoint(point.x, point.y);
      return;
    }

    if (
      activePointerRef.current !== event.pointerId ||
      activePointerModeRef.current !== "drawing"
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const coalescedEvents = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const samples = coalescedEvents.length > 0 ? coalescedEvents : [event.nativeEvent];
    for (const sample of samples) {
      const samplePoint = {
        x: sample.clientX - bounds.left,
        y: sample.clientY - bounds.top,
      };
      lastPointRef.current = samplePoint;
      engineRef.current?.addGesturePoint(
        samplePoint.x,
        samplePoint.y,
        sample.timeStamp,
      );
    }
  }

  function finishGesture(event: PointerEvent<HTMLElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    const point = getLocalPoint(event);
    lastPointRef.current = point;
    const pointerMode = activePointerModeRef.current;
    activePointerRef.current = null;
    activePointerModeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pointerMode === "pick") {
      choosePoint(point);
      return;
    }

    if (pointerMode !== "drawing") return;
    engineRef.current?.endGesture(point.x, point.y, event.timeStamp);
    setStage("settling");
  }

  function cancelPointer(event: PointerEvent<HTMLElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    const point = getLocalPoint(event);
    const pointerMode = activePointerModeRef.current;
    activePointerRef.current = null;
    activePointerModeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (pointerMode === "drawing") {
      engineRef.current?.endGesture(point.x, point.y, event.timeStamp);
      setStage("settling");
    } else if (pointerMode === "pick") {
      engineRef.current?.clearGatherPoint();
    }
  }

  function leaveField() {
    if (
      stage === "revealed" ||
      (stage === "pick" && activePointerRef.current === null)
    ) {
      engineRef.current?.clearGatherPoint();
    }
  }

  function choosePoint(point: FieldSelection) {
    if (stage !== "pick") return;
    const surface = surfaceRef.current;
    const surfaceWidth = surface?.clientWidth ?? window.innerWidth;
    const surfaceHeight = surface?.clientHeight ?? window.innerHeight;
    const safeMargin = Math.min(
      64,
      Math.max(40, Math.min(surfaceWidth, surfaceHeight) * 0.05),
    );
    const safePoint = {
      x: Math.min(surfaceWidth - safeMargin, Math.max(safeMargin, point.x)),
      y: Math.min(
        surfaceHeight - safeMargin * 1.15,
        Math.max(safeMargin, point.y),
      ),
    };
    const lineIndex =
      (sceneSeed + Math.round(safePoint.x + safePoint.y)) % LINE_POOL.length;
    const chosenLine = LINE_POOL[lineIndex];
    const horizontal = safePoint.x > surfaceWidth * 0.5 ? "left" : "right";
    const vertical = safePoint.y > surfaceHeight * 0.62 ? "above" : "below";

    engineRef.current?.revealAtPoint(
      safePoint.x,
      safePoint.y,
      horizontal === "right" ? 1 : -1,
      vertical === "below" ? 1 : -1,
    );
    setSelectedPoint(safePoint);
    setAnswerPlacement({ horizontal, vertical });
    setLine(chosenLine);
    setStage("revealed");
  }

  function chooseCurrentGathering() {
    const surface = surfaceRef.current;
    const point = lastPointRef.current ?? {
      x: (surface?.clientWidth ?? window.innerWidth) * 0.5,
      y: (surface?.clientHeight ?? window.innerHeight) * 0.5,
    };
    engineRef.current?.setGatherPoint(point.x, point.y);
    choosePoint(point);
  }

  const answerPosition: AnswerPosition | undefined = selectedPoint
    ? {
        "--field-answer-x": `${selectedPoint.x}px`,
        "--field-answer-y": `${selectedPoint.y}px`,
      }
    : undefined;
  const answerHorizontal =
    answerPlacement.horizontal === "left"
      ? styles.answerLeft
      : styles.answerRight;
  const answerVertical =
    answerPlacement.vertical === "above"
      ? styles.answerAbove
      : styles.answerBelow;

  return (
    <main
      ref={surfaceRef}
      className={styles.field}
      data-stage={stage}
      onPointerDown={beginGesture}
      onPointerMove={continueGesture}
      onPointerUp={finishGesture}
      onPointerCancel={cancelPointer}
      onPointerLeave={leaveField}
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

      <p className={styles.gestureHint} aria-hidden={stage !== "idle"}>
        move once
      </p>

      {stage === "pick" && (
        <>
          <button
            className={styles.fieldAction}
            type="button"
            aria-label="Choose the current gathering"
            onClick={chooseCurrentGathering}
          />
          <p className={styles.pickHint}>move, then touch the gathering</p>
        </>
      )}

      {selectedPoint && line && (
        <div
          className={`${styles.answer} ${answerHorizontal} ${answerVertical}`}
          style={answerPosition}
        >
          <p className={styles.line}>{line}</p>
        </div>
      )}

      <p className={styles.srOnly} aria-live="polite">
        {statusText(stage)}
      </p>
    </main>
  );
}
