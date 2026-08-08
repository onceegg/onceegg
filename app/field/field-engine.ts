export type FieldStage =
  | "idle"
  | "drawing"
  | "settling"
  | "pick"
  | "revealed";

export type GesturePoint = {
  x: number;
  y: number;
  t: number;
  speed: number;
  pause: number;
};

export type FieldSelection = {
  x: number;
  y: number;
};

export type FieldMaterial = "pigment" | "living";

type ParticleState = "latent" | "active" | "drifting" | "settled";

type DustParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  baseAlpha: number;
  color: number;
  density: number;
  imprint: number;
  imprintX: number;
  imprintY: number;
  restX: number;
  restY: number;
  activation: number;
  revealAt: number;
  drift: number;
  form: 0 | 1 | 2;
  aspect: number;
  angle: number;
  depth: number;
  mineral: number;
  state: ParticleState;
  grouped: boolean;
  follower: boolean;
  cursorPull: number;
};

type FiberFragment = {
  points: Array<{ x: number; y: number }>;
  alpha: number;
  color: number;
  revealAt: number;
  phase: number;
};

type PigmentWash = {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation: number;
  alpha: number;
  color: number;
  revealAt: number;
  phase: number;
  lobes: number[];
};

type GestureCharacter = {
  pace: number;
  stillness: number;
  curvature: number;
  spread: number;
  reach: number;
};

type CompositionAnchor = {
  x: number;
  y: number;
  radius: number;
  weight: number;
  color: number;
};

type RevealPoint = {
  x: number;
  y: number;
  directionX: -1 | 1;
  directionY: -1 | 1;
};

type CompositionGroup = {
  originX: number;
  originY: number;
  scale: number;
  translateX: number;
  translateY: number;
  targetScale: number;
  targetTranslateX: number;
  targetTranslateY: number;
  adjustStartedAt: number;
  adjustDuration: number;
};

type DepositSurface = HTMLCanvasElement | OffscreenCanvas;
type DepositContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type EngineOptions = {
  material: FieldMaterial;
  reducedMotion: boolean;
  onSettled: () => void;
};

const DUST_COLORS = ["76 91 88", "65 104 117", "151 113 72"];
const FIBER_COLORS = ["88 106 103", "128 116 96", "76 101 108"];
const WASH_COLORS = ["122 146 143", "163 139 105", "112 132 127"];
const DUST_VISIBILITY = 2.58;
const FIBER_VISIBILITY = 1.18;
const WORLD_SCALE = 2;
const DEFAULT_GESTURE_CHARACTER: GestureCharacter = {
  pace: 0.35,
  stillness: 0.2,
  curvature: 0.25,
  spread: 0.4,
  reach: 0.4,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

function hashGrid(x: number, y: number, seed: number) {
  let value = Math.imul(x ^ seed, 374761393) + Math.imul(y ^ (seed >>> 7), 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const amountX = x - left;
  const amountY = y - top;
  const smoothX = amountX * amountX * (3 - 2 * amountX);
  const smoothY = amountY * amountY * (3 - 2 * amountY);

  return lerp(
    lerp(hashGrid(left, top, seed), hashGrid(left + 1, top, seed), smoothX),
    lerp(
      hashGrid(left, top + 1, seed),
      hashGrid(left + 1, top + 1, seed),
      smoothX,
    ),
    smoothY,
  );
}

function densityNoise(x: number, y: number, seed: number) {
  const broad = valueNoise(x / 245, y / 245, seed);
  const detail = valueNoise(x / 112, y / 112, seed ^ 0x9e3779b9);
  const drift =
    0.5 +
    Math.sin(x * 0.0032 + y * 0.0019 + broad * 3.8 + seed * 0.000003) * 0.5;
  return clamp(Math.pow(broad * 0.62 + detail * 0.22 + drift * 0.16, 1.35) * 1.25, 0, 1);
}

function seededRandom(seed: number) {
  let state = seed || 1;

  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function nearestProjection(
  x: number,
  y: number,
  points: GesturePoint[],
) {
  let nearest = {
    distance: Number.POSITIVE_INFINITY,
    x,
    y,
    tangentX: 1,
    tangentY: 0,
  };

  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1];
    const second = points[index];
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const lengthSquared = dx * dx + dy * dy;
    const amount =
      lengthSquared === 0
        ? 0
        : clamp(((x - first.x) * dx + (y - first.y) * dy) / lengthSquared, 0, 1);
    const projectionX = first.x + dx * amount;
    const projectionY = first.y + dy * amount;
    const distance = Math.hypot(x - projectionX, y - projectionY);

    if (distance < nearest.distance) {
      const length = Math.max(0.001, Math.hypot(dx, dy));
      nearest = {
        distance,
        x: projectionX,
        y: projectionY,
        tangentX: dx / length,
        tangentY: dy / length,
      };
    }
  }

  return nearest;
}

function resampleGestureByLength(
  points: GesturePoint[],
  pointCount: number,
) {
  if (points.length <= 1 || pointCount <= 1) return points;
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    distances.push(
      distances[index - 1] +
        Math.hypot(point.x - previous.x, point.y - previous.y),
    );
  }
  const totalLength = distances.at(-1) ?? 0;
  if (totalLength < 0.001) return [points[0]];

  let segmentIndex = 1;
  return Array.from({ length: pointCount }, (_, index): GesturePoint => {
    const targetDistance = (index / (pointCount - 1)) * totalLength;
    while (
      segmentIndex < distances.length - 1 &&
      distances[segmentIndex] < targetDistance
    ) {
      segmentIndex += 1;
    }
    const first = points[Math.max(0, segmentIndex - 1)];
    const second = points[segmentIndex];
    const segmentStart = distances[Math.max(0, segmentIndex - 1)];
    const segmentLength = Math.max(
      0.001,
      distances[segmentIndex] - segmentStart,
    );
    const amount = clamp(
      (targetDistance - segmentStart) / segmentLength,
      0,
      1,
    );
    return {
      x: lerp(first.x, second.x, amount),
      y: lerp(first.y, second.y, amount),
      t: lerp(first.t, second.t, amount),
      speed: lerp(first.speed, second.speed, amount),
      pause: lerp(first.pause, second.pause, amount),
    };
  });
}

function smoothGestureShape(points: GesturePoint[], passes = 2) {
  let smoothed = points.map((point) => ({ ...point }));
  for (let pass = 0; pass < passes; pass += 1) {
    smoothed = smoothed.map((point, index, current) => {
      if (index === 0 || index === current.length - 1) return { ...point };
      const previous = current[index - 1];
      const next = current[index + 1];
      const firstX = point.x - previous.x;
      const firstY = point.y - previous.y;
      const secondX = next.x - point.x;
      const secondY = next.y - point.y;
      const divisor = Math.max(
        0.001,
        Math.hypot(firstX, firstY) * Math.hypot(secondX, secondY),
      );
      const turn = Math.acos(
        clamp((firstX * secondX + firstY * secondY) / divisor, -1, 1),
      );
      const cornerProtection = clamp(turn / (Math.PI * 0.72), 0, 1);
      const blend = lerp(0.17, 0.045, cornerProtection);
      return {
        ...point,
        x: previous.x * blend + point.x * (1 - blend * 2) + next.x * blend,
        y: previous.y * blend + point.y * (1 - blend * 2) + next.y * blend,
      };
    });
  }
  return smoothed;
}

function weightedQuantile(
  entries: Array<{ value: number; weight: number }>,
  quantile: number,
) {
  if (entries.length === 0) return 0;
  const sorted = [...entries].sort((first, second) => first.value - second.value);
  const totalWeight = sorted.reduce((total, entry) => total + entry.weight, 0);
  const target = totalWeight * quantile;
  let accumulated = 0;

  for (const entry of sorted) {
    accumulated += entry.weight;
    if (accumulated >= target) return entry.value;
  }

  return sorted.at(-1)?.value ?? 0;
}

export class FieldEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly random: () => number;
  private readonly seed: number;
  private readonly material: FieldMaterial;
  private readonly reducedMotion: boolean;
  private readonly onSettled: () => void;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private worldWidth = 1;
  private worldHeight = 1;
  private cameraCenterX = 0;
  private cameraCenterY = 0;
  private cameraX = 0;
  private cameraY = 0;
  private particles: DustParticle[] = [];
  private fibers: FiberFragment[] = [];
  private washes: PigmentWash[] = [];
  private composition: CompositionAnchor[] = [];
  private gesture: GesturePoint[] = [];
  private imprintGesture: GesturePoint[] = [];
  private gestureCharacter = DEFAULT_GESTURE_CHARACTER;
  private group: CompositionGroup | null = null;
  private depositSurface: DepositSurface | null = null;
  private depositContext: DepositContext | null = null;
  private depositCommitted = false;
  private gatherPoint: { x: number; y: number } | null = null;
  private gatherActive = false;
  private revealPoint: RevealPoint | null = null;
  private revealStartedAt = 0;
  private stage: FieldStage = "idle";
  private settleStartedAt = 0;
  private lastFrameAt = 0;
  private frame = 0;
  private settledNotified = false;

  constructor(
    canvas: HTMLCanvasElement,
    seed: number,
    { material, reducedMotion, onSettled }: EngineOptions,
  ) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is unavailable");

    this.canvas = canvas;
    this.context = context;
    this.seed = seed;
    this.random = seededRandom(seed);
    this.material = material;
    this.reducedMotion = reducedMotion;
    this.onSettled = onSettled;
    this.resize();
    this.frame = window.requestAnimationFrame(this.render);
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    if (width === this.width && height === this.height) return;

    this.width = width;
    this.height = height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);

    if (this.worldWidth <= 1 || this.worldHeight <= 1) {
      this.worldWidth = Math.ceil(Math.max(1200, width * WORLD_SCALE));
      this.worldHeight = Math.ceil(Math.max(900, height * WORLD_SCALE));
      this.cameraCenterX = this.worldWidth * 0.5;
      this.cameraCenterY = this.worldHeight * 0.5;
      this.createDepositSurface();
      this.createPotentialParticles();
    }

    this.cameraX = this.cameraCenterX - width * 0.5;
    this.cameraY = this.cameraCenterY - height * 0.5;
  }

  destroy() {
    window.cancelAnimationFrame(this.frame);
  }

  beginGesture(x: number, y: number, time: number) {
    if (this.stage !== "idle") return;
    this.stage = "drawing";
    const worldPoint = this.screenToWorld(x, y);
    const point = { ...worldPoint, t: time, speed: 0, pause: 0 };
    this.gesture = [point];
    this.activateNearGesture(point, point);
  }

  addGesturePoint(x: number, y: number, time: number) {
    if (this.stage !== "drawing") return;
    const previous = this.gesture.at(-1);
    if (!previous) return;

    const worldPoint = this.screenToWorld(x, y);
    const distance = Math.hypot(worldPoint.x - previous.x, worldPoint.y - previous.y);
    const elapsed = Math.max(1, time - previous.t);
    if (distance < 2.5 && elapsed < 30) return;

    const point: GesturePoint = {
      ...worldPoint,
      t: time,
      speed: clamp(distance / elapsed, 0, 2.5),
      pause: clamp((elapsed - 55) / 240, 0, 1),
    };
    this.gesture.push(point);
    if (this.gesture.length > 480) {
      const finalIndex = this.gesture.length - 1;
      this.gesture = this.gesture.filter(
        (_, index) => index === 0 || index === finalIndex || index % 2 === 0,
      );
    }
    this.activateNearGesture(previous, point);
  }

  endGesture(x: number, y: number, time: number) {
    if (this.stage !== "drawing") return;
    this.addGesturePoint(x, y, time);

    if (this.gesture.length === 1) {
      const first = this.gesture[0];
      const angle = this.random() * Math.PI * 2;
      const screen = this.worldToScreen(
        first.x + Math.cos(angle) * 12,
        first.y + Math.sin(angle) * 12,
      );
      this.addGesturePoint(screen.x, screen.y, time + 24);
    }

    this.gestureCharacter = this.analyzeGesture();
    const interpretedWorld = this.interpretGesture();
    this.createCompositionGroup(interpretedWorld);
    this.createComposition();
    this.assignParticlesToGroup();
    this.createWashes();
    this.createFibers();
    this.planGroupAdjustment();
    this.stage = "settling";
    this.settleStartedAt = performance.now();
    this.settledNotified = false;
  }

  setGatherPoint(x: number, y: number) {
    if (this.stage !== "pick" && this.stage !== "revealed") return;
    this.gatherPoint = this.screenToGroupLocal(x, y);
    this.gatherActive = true;
  }

  clearGatherPoint() {
    if (this.stage !== "pick" && this.stage !== "revealed") return;
    this.gatherPoint = null;
    this.gatherActive = false;
  }

  revealAtPoint(
    x: number,
    y: number,
    directionX: -1 | 1,
    directionY: -1 | 1,
  ) {
    this.stage = "revealed";
    this.gatherPoint = null;
    this.gatherActive = false;
    const localPoint = this.screenToGroupLocal(x, y);
    this.revealPoint = { ...localPoint, directionX, directionY };
    this.revealStartedAt = performance.now();
    this.eraseDepositForReveal(this.revealPoint);
  }

  getSnapshot() {
    const firstTime = this.gesture[0]?.t ?? 0;
    return {
      seed: this.seed,
      gesture: this.gesture.map((point) => ({
        x: Number(((point.x - this.cameraX) / this.width).toFixed(5)),
        y: Number(((point.y - this.cameraY) / this.height).toFixed(5)),
        t: Math.round(point.t - firstTime),
        speed: Number(point.speed.toFixed(4)),
        pause: Number(point.pause.toFixed(4)),
      })),
    };
  }

  private createDepositSurface() {
    if (typeof OffscreenCanvas !== "undefined") {
      this.depositSurface = new OffscreenCanvas(this.worldWidth, this.worldHeight);
      this.depositContext = this.depositSurface.getContext("2d");
      return;
    }

    const surface = document.createElement("canvas");
    surface.width = this.worldWidth;
    surface.height = this.worldHeight;
    this.depositSurface = surface;
    this.depositContext = surface.getContext("2d");
  }

  private createPotentialParticles() {
    const count = Math.round(
      clamp((this.worldWidth * this.worldHeight) / 90, 28000, 48000),
    );
    const columns = Math.max(
      1,
      Math.ceil(Math.sqrt(count * (this.worldWidth / this.worldHeight))),
    );
    const rows = Math.max(1, Math.ceil(count / columns));
    const stepX = this.worldWidth / columns;
    const stepY = this.worldHeight / rows;

    this.particles = Array.from({ length: count }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = (column + 0.1 + this.random() * 0.8) * stepX;
      const y = (row + 0.1 + this.random() * 0.8) * stepY;
      const density = densityNoise(x, y, this.seed);
      const formRoll = this.random();
      const form: 0 | 1 | 2 = formRoll < 0.002 ? 2 : formRoll < 0.075 ? 1 : 0;
      const baseSize =
        form === 2
          ? 1.7 + this.random() * 2.3
          : form === 1
            ? 0.92 + this.random() * 1.35
            : 0.4 + Math.pow(this.random(), 2.35) * 1.02;
      const materialAlpha = form === 2 ? 1.18 : form === 1 ? 1.08 : 1;
      const baseAlpha =
        (0.062 + Math.pow(this.random(), 1.45) * 0.175) * materialAlpha;
      const colorRoll = this.random();

      return {
        x,
        y,
        vx: 0,
        vy: 0,
        size: baseSize * (0.82 + density * 0.32),
        alpha: 0,
        baseAlpha: baseAlpha * (0.56 + density * 0.84),
        color: colorRoll < 0.62 ? 0 : colorRoll < 0.86 ? 1 : 2,
        density,
        imprint: 0,
        imprintX: x,
        imprintY: y,
        restX: x,
        restY: y,
        activation: 0,
        revealAt: 2,
        drift: this.random() * Math.PI * 2,
        form,
        aspect:
          form === 2
            ? 0.38 + this.random() * 0.4
            : form === 1
              ? 0.55 + this.random() * 0.35
              : 1,
        angle: this.random() * Math.PI,
        depth:
          form === 2
            ? 0.82 + this.random() * 0.18
            : form === 1
              ? 0.46 + this.random() * 0.36
              : this.random() * 0.58,
        mineral: this.random(),
        state: "latent" as const,
        grouped: false,
        follower: false,
        cursorPull: 0,
      };
    });
  }

  private screenToWorld(x: number, y: number) {
    return { x: x + this.cameraX, y: y + this.cameraY };
  }

  private worldToScreen(x: number, y: number) {
    return { x: x - this.cameraX, y: y - this.cameraY };
  }

  private screenToGroupLocal(x: number, y: number) {
    const world = this.screenToWorld(x, y);
    const group = this.group;
    if (!group) return world;
    return {
      x:
        (world.x - group.originX - group.translateX) /
        Math.max(0.001, group.scale),
      y:
        (world.y - group.originY - group.translateY) /
        Math.max(0.001, group.scale),
    };
  }

  private localToScreen(x: number, y: number) {
    const group = this.group;
    if (!group) return this.worldToScreen(x, y);
    return {
      x:
        group.originX +
        group.translateX +
        x * group.scale -
        this.cameraX,
      y:
        group.originY +
        group.translateY +
        y * group.scale -
        this.cameraY,
    };
  }

  private activateNearGesture(first: GesturePoint, second: GesturePoint) {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const directionX = dx / length;
    const directionY = dy / length;
    const normalX = -directionY;
    const normalY = directionX;
    const radius = 108 + second.speed * 58;
    const lengthSquared = dx * dx + dy * dy;

    for (const particle of this.particles) {
      if (
        particle.state !== "latent" &&
        !(particle.state === "active" && !particle.grouped)
      ) {
        continue;
      }
      const amount =
        lengthSquared === 0
          ? 0
          : clamp(
              ((particle.x - first.x) * dx + (particle.y - first.y) * dy) /
                lengthSquared,
              0,
              1,
            );
      const closestX = first.x + dx * amount;
      const closestY = first.y + dy * amount;
      const distance = Math.hypot(particle.x - closestX, particle.y - closestY);
      if (distance >= radius) continue;
      const proximity = Math.pow(1 - distance / radius, 1.45);
      const curl = valueNoise(
        particle.x / 154 + this.seed * 0.00001,
        particle.y / 154,
        this.seed ^ 0x9e3779b9,
      ) - 0.5;
      const newlyActivated = particle.state === "latent";
      particle.state = "active";
      particle.activation = Math.max(particle.activation, proximity);
      particle.revealAt = 0;
      const impulseScale = newlyActivated ? 1 : 0.16;
      const directionalImpulse =
        this.material === "pigment"
          ? 0.16 + second.speed * 0.36
          : 0.34 + second.speed * 0.7;
      const lateralImpulse = this.material === "pigment" ? 1.72 : 0.94;
      particle.vx +=
        (directionX * directionalImpulse * proximity +
          normalX * curl * lateralImpulse * proximity) *
        impulseScale;
      particle.vy +=
        (directionY * directionalImpulse * proximity +
          normalY * curl * lateralImpulse * proximity) *
        impulseScale;
    }
  }

  private sampleGesture(pointCount = 13) {
    if (this.gesture.length <= pointCount) return this.gesture;
    return Array.from({ length: pointCount }, (_, index) => {
      const gestureIndex = Math.round(
        (index / (pointCount - 1)) * (this.gesture.length - 1),
      );
      return this.gesture[gestureIndex];
    });
  }

  private analyzeGesture(): GestureCharacter {
    if (this.gesture.length < 2) return DEFAULT_GESTURE_CHARACTER;
    let totalLength = 0;
    let weightedSpeed = 0;
    let pauseTotal = 0;
    let pausePeak = 0;
    let minimumX = this.gesture[0].x;
    let maximumX = this.gesture[0].x;
    let minimumY = this.gesture[0].y;
    let maximumY = this.gesture[0].y;

    for (let index = 1; index < this.gesture.length; index += 1) {
      const previous = this.gesture[index - 1];
      const point = this.gesture[index];
      const length = Math.hypot(point.x - previous.x, point.y - previous.y);
      totalLength += length;
      weightedSpeed += point.speed * Math.max(1, length);
      pauseTotal += point.pause;
      pausePeak = Math.max(pausePeak, point.pause);
      minimumX = Math.min(minimumX, point.x);
      maximumX = Math.max(maximumX, point.x);
      minimumY = Math.min(minimumY, point.y);
      maximumY = Math.max(maximumY, point.y);
    }

    let turnTotal = 0;
    let turnCount = 0;
    const samples = this.sampleGesture();
    for (let index = 2; index < samples.length; index += 1) {
      const earlier = samples[index - 2];
      const previous = samples[index - 1];
      const point = samples[index];
      const firstX = previous.x - earlier.x;
      const firstY = previous.y - earlier.y;
      const secondX = point.x - previous.x;
      const secondY = point.y - previous.y;
      const divisor = Math.max(
        0.001,
        Math.hypot(firstX, firstY) * Math.hypot(secondX, secondY),
      );
      turnTotal += Math.acos(
        clamp((firstX * secondX + firstY * secondY) / divisor, -1, 1),
      );
      turnCount += 1;
    }

    const duration = Math.max(1, (this.gesture.at(-1)?.t ?? 0) - this.gesture[0].t);
    const diagonal = Math.max(1, Math.hypot(this.width, this.height));
    const boundsDiagonal = Math.hypot(maximumX - minimumX, maximumY - minimumY);
    const segmentCount = Math.max(1, this.gesture.length - 1);

    return {
      pace: clamp(weightedSpeed / Math.max(1, totalLength) / 1.05, 0, 1),
      stillness: clamp(
        (pauseTotal / segmentCount) * 0.58 + pausePeak * 0.42,
        0,
        1,
      ),
      curvature: clamp(
        turnCount > 0
          ? (turnTotal / Math.PI) * 0.46 +
              (turnTotal / turnCount / Math.PI) * 0.72
          : 0,
        0,
        1,
      ),
      spread: clamp((boundsDiagonal / diagonal) * 2.1, 0, 1),
      reach: clamp((totalLength / diagonal) * 1.45 + duration / 9000, 0, 1),
    };
  }

  private interpretGesture() {
    const first = this.gesture[0];
    const last = this.gesture.at(-1) ?? first;
    if (!first) return [];
    let totalLength = 0;
    for (let index = 1; index < this.gesture.length; index += 1) {
      totalLength += Math.hypot(
        this.gesture[index].x - this.gesture[index - 1].x,
        this.gesture[index].y - this.gesture[index - 1].y,
      );
    }
    const sampleCount = Math.round(clamp(totalLength / 17, 17, 46));
    const resampled = resampleGestureByLength(this.gesture, sampleCount);
    const shaped = smoothGestureShape(
      resampled,
      totalLength < 80 ? 1 : 2,
    );
    let minimumX = shaped[0].x;
    let maximumX = shaped[0].x;
    let minimumY = shaped[0].y;
    let maximumY = shaped[0].y;
    for (const point of shaped) {
      minimumX = Math.min(minimumX, point.x);
      maximumX = Math.max(maximumX, point.x);
      minimumY = Math.min(minimumY, point.y);
      maximumY = Math.max(maximumY, point.y);
    }
    const sourceCenterX = (minimumX + maximumX) * 0.5;
    const sourceCenterY = (minimumY + maximumY) * 0.5;
    const sourceSpan = Math.max(
      1,
      maximumX - minimumX,
      maximumY - minimumY,
    );
    const minimumSize = Math.min(this.width, this.height);
    const targetSpan =
      minimumSize *
      (sourceSpan < 28
        ? 0.22
        : 0.4 +
          this.gestureCharacter.curvature * 0.045 +
          this.gestureCharacter.stillness * 0.012);
    const normalizationScale = targetSpan / sourceSpan;
    const destinationCenterX = (minimumX + maximumX) * 0.5;
    const destinationCenterY = (minimumY + maximumY) * 0.5;
    const duration = Math.max(1, last.t - first.t);

    return shaped.map((point, index): GesturePoint => {
      const amount = index / Math.max(1, shaped.length - 1);
      return {
        x:
          destinationCenterX +
          (point.x - sourceCenterX) * normalizationScale,
        y:
          destinationCenterY +
          (point.y - sourceCenterY) * normalizationScale,
        t: first.t + duration * amount,
        speed: point.speed,
        pause: point.pause,
      };
    });
  }

  private createCompositionGroup(interpretedWorld: GesturePoint[]) {
    const origin = interpretedWorld.reduce(
      (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
      { x: 0, y: 0 },
    );
    origin.x /= Math.max(1, interpretedWorld.length);
    origin.y /= Math.max(1, interpretedWorld.length);
    this.imprintGesture = interpretedWorld.map((point) => ({
      ...point,
      x: point.x - origin.x,
      y: point.y - origin.y,
    }));
    this.group = {
      originX: origin.x,
      originY: origin.y,
      scale: 1,
      translateX: 0,
      translateY: 0,
      targetScale: 1,
      targetTranslateX: 0,
      targetTranslateY: 0,
      adjustStartedAt: performance.now(),
      adjustDuration: this.material === "living" ? 1120 : 780,
    };
  }

  private createComposition() {
    if (this.imprintGesture.length === 0) {
      this.composition = [];
      return;
    }
    const minimumSize = Math.min(this.width, this.height);
    const dominantColor =
      this.gestureCharacter.stillness > 0.46
        ? 1
        : this.gestureCharacter.pace > 0.56
          ? 0
          : 2;
    const anchorCount = this.width < 680 ? 2 : 3;
    const anchorAmounts = anchorCount === 2 ? [0.36, 0.73] : [0.25, 0.57, 0.82];

    this.composition = anchorAmounts.map((amount, index) => {
      const pathIndex = Math.min(
        this.imprintGesture.length - 1,
        Math.round(amount * (this.imprintGesture.length - 1)),
      );
      const point = this.imprintGesture[pathIndex];
      const pigmentRadius =
        index === 0
          ? 0.17 + this.gestureCharacter.stillness * 0.028
          : index === 1
            ? 0.115
            : 0.086;
      const livingRadius =
        index === 0
          ? 0.132 + this.gestureCharacter.stillness * 0.018
          : index === 1
            ? 0.108
            : 0.082;
      const radius =
        minimumSize * (this.material === "pigment" ? pigmentRadius : livingRadius);
      return {
        x: point.x,
        y: point.y,
        radius,
        weight:
          this.material === "pigment"
            ? index === 0
              ? 1
              : index === 1
                ? 0.54
                : 0.3
            : index === 0
              ? 0.86
              : index === 1
                ? 0.68
                : 0.46,
        color:
          index === 0 ? dominantColor : dominantColor === 0 ? 2 : 0,
      };
    });
  }

  private assignParticlesToGroup() {
    const group = this.group;
    if (!group) return;
    const minimumSize = Math.min(this.width, this.height);
    const corridorWidth = clamp(
      minimumSize * (this.material === "pigment" ? 0.19 : 0.155),
      76,
      this.material === "pigment" ? 168 : 138,
    );

    for (const particle of this.particles) {
      if (particle.state === "settled" || particle.state === "drifting") continue;
      const localX = particle.x - group.originX;
      const localY = particle.y - group.originY;
      const projection = nearestProjection(localX, localY, this.imprintGesture);
      const pathInfluence = Math.exp(
        -(projection.distance * projection.distance) /
          (2 * corridorWidth * corridorWidth),
      );
      let anchor: CompositionAnchor | null = null;
      let anchorInfluence = 0;
      for (const candidate of this.composition) {
        const distance = Math.hypot(localX - candidate.x, localY - candidate.y);
        const influence =
          Math.exp(-(distance * distance) / (2 * candidate.radius * candidate.radius)) *
          candidate.weight;
        if (influence > anchorInfluence) {
          anchorInfluence = influence;
          anchor = candidate;
        }
      }

      const selector = hashGrid(
        Math.floor(particle.drift * 21000),
        67,
        this.seed ^ 0x27d4eb2d,
      );
      const activationChance =
        this.material === "pigment"
          ? pathInfluence * (0.52 + particle.density * 0.38) +
            anchorInfluence * 0.68
          : pathInfluence * (0.46 + particle.density * 0.3) +
            anchorInfluence * 0.82;
      const wasGestureActivated = particle.state === "active";
      if (!wasGestureActivated && selector > activationChance) continue;

      particle.state = "active";
      particle.grouped = true;
      particle.x = localX;
      particle.y = localY;
      particle.density = densityNoise(localX + group.originX, localY + group.originY, this.seed);
      const pathTexture = 0.18 + particle.density * 0.58 + selector * 0.18;
      particle.imprint = clamp(
        pathInfluence * pathTexture * (this.material === "pigment" ? 0.58 : 0.48) +
          anchorInfluence * (this.material === "pigment" ? 0.72 : 0.88),
        0,
        1.2,
      );
      const capillary =
        valueNoise(
          localX / 76 + particle.drift * 0.07,
          localY / 76 - particle.drift * 0.04,
          this.seed ^ 0x85ebca6b,
        ) - 0.5;
      const sideOffset =
        (Math.sin(particle.drift * 1.73 + this.seed * 0.00001) * 0.7 +
          capillary * 0.76) *
        corridorWidth *
        (this.material === "pigment" ? 0.9 : 0.58) *
        (0.34 + particle.density * 0.66);
      const alongOffset =
        Math.sin(particle.drift * 3.11 + this.seed * 0.000017) *
        corridorWidth *
        (this.material === "pigment" ? 0.34 : 0.22);
      let targetX =
        projection.x -
        projection.tangentY * sideOffset +
        projection.tangentX * alongOffset;
      let targetY =
        projection.y +
        projection.tangentX * sideOffset +
        projection.tangentY * alongOffset;

      if (anchor && anchorInfluence > 0.035) {
        const slot = hashGrid(
          Math.floor(particle.drift * 10000),
          73,
          this.seed ^ 0x9e3779b9,
        );
        const angle = particle.drift + slot * Math.PI * 2;
        const pore = hashGrid(
          Math.floor(particle.drift * 15000),
          89,
          this.seed ^ 0xc2b2ae35,
        );
        const radius =
          this.material === "pigment"
            ? Math.pow(slot, 0.62) *
              anchor.radius *
              (0.38 + particle.density * 0.34)
            : anchor.radius *
              (0.1 + Math.pow(slot, 0.78) * 0.48 + (pore > 0.74 ? 0.13 : 0));
        const anchorX =
          anchor.x +
          Math.cos(angle) * radius +
          (this.material === "pigment" ? capillary * anchor.radius * 0.18 : 0);
        const anchorY =
          anchor.y +
          Math.sin(angle) * radius * (this.material === "pigment" ? 0.76 : 0.9) -
          (this.material === "pigment" ? capillary * anchor.radius * 0.08 : 0);
        const blend = clamp(
          anchorInfluence *
            (this.material === "pigment"
              ? 0.32 + anchor.weight * 0.2
              : 0.46 + anchor.weight * 0.22),
          0,
          this.material === "pigment" ? 0.62 : 0.78,
        );
        targetX = lerp(targetX, anchorX, blend);
        targetY = lerp(targetY, anchorY, blend);
        if (selector < anchorInfluence * (this.material === "pigment" ? 0.42 : 0.58)) {
          particle.color = anchor.color;
        }
      }

      particle.imprintX = targetX;
      particle.imprintY = targetY;
      particle.restX = targetX;
      particle.restY = targetY;
      if (this.material === "living") {
        particle.vx *= 0.18;
        particle.vy *= 0.18;
      }
      particle.activation = clamp(
        Math.max(
          particle.activation,
          pathInfluence *
            pathTexture *
            (this.material === "pigment" ? 0.62 : 0.52) +
            anchorInfluence * (this.material === "pigment" ? 0.72 : 0.86),
        ),
        this.material === "pigment" ? 0.08 : 0.13,
        1.16,
      );
      particle.revealAt = clamp(
        this.material === "pigment"
          ? 0.04 + this.random() * 0.58 - particle.density * 0.12 - anchorInfluence * 0.08
          : 0.07 + this.random() * 0.49 - anchorInfluence * 0.045,
        this.material === "pigment" ? 0 : 0.035,
        this.material === "pigment" ? 0.62 : 0.58,
      );
      const materialPresence = clamp(
        pathInfluence * pathTexture * 0.5 + anchorInfluence * 0.84,
        0,
        1,
      );
      const materialSelector = hashGrid(
        Math.floor(particle.drift * 18000),
        113,
        this.seed ^ 0x85ebca6b,
      );
      const shapeVariation = hashGrid(
        Math.floor(particle.drift * 23000),
        127,
        this.seed ^ 0xc2b2ae35,
      );
      if (this.material === "living") {
        particle.baseAlpha *= 1.08 + materialPresence * 0.08;
        if (materialSelector < 0.055 + materialPresence * 0.11) {
          particle.form = 2;
          particle.size = Math.max(
            particle.size,
            1.25 + materialSelector * 10 + materialPresence * 0.85,
          );
          particle.aspect = 0.62 + shapeVariation * 0.28;
          particle.depth = Math.max(particle.depth, 0.76);
        } else if (materialSelector < 0.34 + materialPresence * 0.12) {
          particle.form = 1;
          particle.size = Math.max(
            particle.size,
            0.74 + materialSelector * 2.2 + materialPresence * 0.42,
          );
          particle.aspect = 0.58 + shapeVariation * 0.32;
          particle.depth = Math.max(particle.depth, 0.46);
        }
      } else if (materialSelector < 0.006 + materialPresence * 0.018) {
        particle.form = 2;
        particle.size = Math.max(particle.size, 1.35 + materialSelector * 36);
        particle.depth = Math.max(particle.depth, 0.78);
      } else if (
        materialSelector < 0.052 + materialPresence * 0.1 &&
        particle.form === 0
      ) {
        particle.form = 1;
        particle.size = Math.max(particle.size, 0.82 + materialSelector * 3.6);
        particle.depth = Math.max(particle.depth, 0.46);
      }
    }
  }

  private createWashes() {
    if (this.composition.length === 0 || this.imprintGesture.length === 0) {
      this.washes = [];
      return;
    }
    const minimumSize = Math.min(this.width, this.height);
    const pathWashCount = Math.round(
      clamp(this.imprintGesture.length / 5, 5, this.material === "pigment" ? 9 : 8),
    );
    const pathSources = Array.from({ length: pathWashCount }, (_, index) => {
      const amount =
        pathWashCount === 1 ? 0.5 : index / (pathWashCount - 1);
      const pathIndex = Math.round(
        amount * (this.imprintGesture.length - 1),
      );
      return {
        point: this.imprintGesture[pathIndex],
        pathIndex,
        amount,
        anchor: null as CompositionAnchor | null,
      };
    });
    const anchorSources = this.composition
      .slice(0, this.material === "pigment" ? 2 : 3)
      .map((anchor) => {
        let pathIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < this.imprintGesture.length; index += 1) {
          const point = this.imprintGesture[index];
          const distance = Math.hypot(point.x - anchor.x, point.y - anchor.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            pathIndex = index;
          }
        }
        return {
          point: anchor,
          pathIndex,
          amount: pathIndex / Math.max(1, this.imprintGesture.length - 1),
          anchor,
        };
      });
    const sources = [...pathSources, ...anchorSources];

    this.washes = sources.map((source, index) => {
      const previousPoint =
        this.imprintGesture[Math.max(0, source.pathIndex - 1)];
      const nextPoint =
        this.imprintGesture[
          Math.min(this.imprintGesture.length - 1, source.pathIndex + 1)
        ];
      const tangentAngle = Math.atan2(
        nextPoint.y - previousPoint.y,
        nextPoint.x - previousPoint.x,
      );
      const tangentX = Math.cos(tangentAngle);
      const tangentY = Math.sin(tangentAngle);
      const normalX = -tangentY;
      const normalY = tangentX;
      const anchor = source.anchor;
      const baseRadius = anchor
        ? anchor.radius * (0.5 + this.random() * 0.18)
        : minimumSize *
          (this.material === "pigment"
            ? 0.055 + this.random() * 0.04
            : 0.046 + this.random() * 0.034);
      const lateralOffset = anchor
        ? 0
        : (this.random() - 0.5) * baseRadius * 0.44;
      const alongOffset = anchor
        ? (this.random() - 0.5) * baseRadius * 0.12
        : (this.random() - 0.5) * baseRadius * 0.26;
      const radiusX = clamp(
        baseRadius * (0.82 + this.random() * 0.34),
        this.material === "pigment" ? 38 : 34,
        this.material === "pigment" ? 132 : 112,
      );
      const radiusY =
        radiusX *
        (this.material === "pigment"
          ? 0.48 + this.random() * 0.34
          : 0.66 + this.random() * 0.25);
      return {
        x:
          source.point.x +
          tangentX * alongOffset +
          normalX * lateralOffset,
        y:
          source.point.y +
          tangentY * alongOffset +
          normalY * lateralOffset,
        radiusX,
        radiusY,
        rotation:
          tangentAngle +
          (this.random() - 0.5) * (this.material === "pigment" ? 0.72 : 1.08),
        alpha:
          this.material === "pigment"
            ? 0.009 + this.random() * 0.011 + (anchor?.weight ?? 0) * 0.005
            : 0.009 + this.random() * 0.01 + (anchor?.weight ?? 0) * 0.004,
        color:
          anchor?.color ??
          this.composition[index % this.composition.length].color,
        revealAt:
          this.material === "pigment"
            ? 0.04 + source.amount * 0.34 + this.random() * 0.18
            : 0.06 + source.amount * 0.3 + this.random() * 0.18,
        phase: this.random() * Math.PI * 2,
        lobes: Array.from(
          { length: this.material === "pigment" ? 18 : 14 },
          () =>
            this.material === "pigment"
              ? 0.76 + this.random() * 0.3
              : 0.72 + this.random() * 0.36,
        ),
      };
    });
  }

  private createFibers() {
    const count =
      this.material === "pigment"
        ? this.width < 680
          ? 24
          : 38
        : this.width < 680
          ? 7
          : 11;
    this.fibers = Array.from({ length: count }, () => {
      const anchor = this.composition[
        Math.floor(this.random() * Math.max(1, this.composition.length))
      ];
      const pathPoint = this.imprintGesture[
        Math.floor(this.random() * Math.max(1, this.imprintGesture.length))
      ];
      const point = anchor && this.random() < 0.74 ? anchor : pathPoint;
      const angle = this.random() * Math.PI * 2;
      const scatter = anchor
        ? Math.sqrt(this.random()) * anchor.radius * 1.24
        : Math.min(this.width, this.height) * 0.12 * (this.random() - 0.5);
      const x = point.x + Math.cos(angle) * scatter;
      const y = point.y + Math.sin(angle) * scatter * 0.72;
      const projection = nearestProjection(x, y, this.imprintGesture);
      const fieldAngle = Math.atan2(projection.tangentY, projection.tangentX);
      const fragmentAngle =
        fieldAngle +
        (this.random() - 0.5) * (this.material === "pigment" ? 0.86 : 1.46);
      const length =
        this.material === "pigment"
          ? 4 + Math.pow(this.random(), 0.72) * 14
          : 3 + Math.pow(this.random(), 0.72) * 8;
      const bend =
        (this.random() - 0.5) * (this.material === "pigment" ? 5.4 : 7.6);
      const directionX = Math.cos(fragmentAngle);
      const directionY = Math.sin(fragmentAngle);
      const normalX = -directionY;
      const normalY = directionX;
      const colorRoll = this.random();
      return {
        points: [
          { x: x - directionX * length * 0.5, y: y - directionY * length * 0.5 },
          { x: x + normalX * bend, y: y + normalY * bend },
          { x: x + directionX * length * 0.5, y: y + directionY * length * 0.5 },
        ],
        alpha:
          this.material === "pigment"
            ? 0.018 + this.random() * 0.034
            : 0.024 + this.random() * 0.028,
        color: colorRoll < 0.58 ? 0 : colorRoll < 0.82 ? 2 : 1,
        revealAt:
          this.material === "pigment"
            ? 0.08 + this.random() * 0.64
            : 0.09 + this.random() * 0.5,
        phase: this.random() * Math.PI * 2,
      };
    });
  }

  private planGroupAdjustment() {
    const group = this.group;
    if (!group) return;
    const xEntries: Array<{ value: number; weight: number }> = [];
    const yEntries: Array<{ value: number; weight: number }> = [];

    for (const particle of this.particles) {
      if (particle.state !== "active" || !particle.grouped) continue;
      const weight = 0.2 + particle.activation;
      xEntries.push({ value: particle.imprintX, weight });
      yEntries.push({ value: particle.imprintY, weight });
    }
    for (const anchor of this.composition) {
      const weight = 7 + anchor.weight * 12;
      xEntries.push({ value: anchor.x - anchor.radius, weight });
      xEntries.push({ value: anchor.x + anchor.radius, weight });
      yEntries.push({ value: anchor.y - anchor.radius * 0.72, weight });
      yEntries.push({ value: anchor.y + anchor.radius * 0.72, weight });
    }
    if (xEntries.length === 0 || yEntries.length === 0) return;

    const localLeft = weightedQuantile(xEntries, 0.08);
    const localRight = weightedQuantile(xEntries, 0.92);
    const localTop = weightedQuantile(yEntries, 0.08);
    const localBottom = weightedQuantile(yEntries, 0.92);
    const worldLeft = group.originX + localLeft;
    const worldRight = group.originX + localRight;
    const worldTop = group.originY + localTop;
    const worldBottom = group.originY + localBottom;
    const boundsWidth = Math.max(1, worldRight - worldLeft);
    const boundsHeight = Math.max(1, worldBottom - worldTop);
    const viewLeft = this.cameraX;
    const viewRight = this.cameraX + this.width;
    const viewTop = this.cameraY;
    const viewBottom = this.cameraY + this.height;
    const intersectionWidth = Math.max(
      0,
      Math.min(worldRight, viewRight) - Math.max(worldLeft, viewLeft),
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(worldBottom, viewBottom) - Math.max(worldTop, viewTop),
    );
    const visibleRatio =
      (intersectionWidth * intersectionHeight) / (boundsWidth * boundsHeight);
    if (visibleRatio >= 0.68) return;

    const targetScale = clamp(
      Math.min(1, (this.width * 1.14) / boundsWidth, (this.height * 1.14) / boundsHeight),
      0.74,
      1,
    );
    const localCenterX = (localLeft + localRight) * 0.5;
    const localCenterY = (localTop + localBottom) * 0.5;
    group.targetScale = targetScale;
    group.targetTranslateX =
      this.cameraCenterX - (group.originX + localCenterX * targetScale);
    group.targetTranslateY =
      this.cameraCenterY - (group.originY + localCenterY * targetScale);
    group.adjustStartedAt = performance.now();
  }

  private updateGroupTransform(time: number) {
    const group = this.group;
    if (!group) return;
    if (this.reducedMotion) {
      group.scale = group.targetScale;
      group.translateX = group.targetTranslateX;
      group.translateY = group.targetTranslateY;
      return;
    }
    const progress = clamp(
      (time - group.adjustStartedAt) / group.adjustDuration,
      0,
      1,
    );
    const eased =
      this.material === "living"
        ? progress * progress * (3 - 2 * progress)
        : 1 - Math.pow(1 - progress, 4);
    group.scale = lerp(1, group.targetScale, eased);
    group.translateX = lerp(0, group.targetTranslateX, eased);
    group.translateY = lerp(0, group.targetTranslateY, eased);
  }

  private localFlow(x: number, y: number, time: number) {
    const phase =
      valueNoise(
        x / 188 + time * 0.000018,
        y / 188 - time * 0.000013,
        this.seed ^ 0x9e3779b9,
      ) *
      Math.PI *
      2;
    return { x: Math.cos(phase), y: Math.sin(phase) };
  }

  private updateParticles(deltaSeconds: number, progress: number) {
    const isDrawing = this.stage === "drawing";
    const isSettling = this.stage === "settling";
    const motionScale = this.reducedMotion ? 0.18 : 1;
    const revealElapsed = this.revealPoint
      ? Math.max(0, this.lastFrameAt - this.revealStartedAt)
      : 0;

    for (const particle of this.particles) {
      if (particle.state === "latent" || particle.state === "settled") continue;

      const visible = isDrawing
        ? particle.activation
        : progress >= particle.revealAt
          ? particle.activation
          : 0;
      const targetAlpha = particle.baseAlpha * visible;
      const alphaResponse =
        isSettling && this.material === "living" ? 1.75 : 4.8;
      particle.alpha +=
        (targetAlpha - particle.alpha) *
        Math.min(1, deltaSeconds * alphaResponse);

      if (isDrawing && !particle.grouped) {
        const damping = Math.pow(
          this.material === "pigment" ? 0.895 : 0.935,
          deltaSeconds * 60,
        );
        particle.vx *= damping;
        particle.vy *= damping;
        particle.x += particle.vx * deltaSeconds * 60;
        particle.y += particle.vy * deltaSeconds * 60;
      } else if (isSettling && particle.grouped) {
        const projection = nearestProjection(particle.x, particle.y, this.imprintGesture);
        const flow = this.localFlow(particle.x, particle.y, this.lastFrameAt);
        const localProgress = clamp(
          (progress - particle.revealAt) /
            Math.max(0.12, 1 - particle.revealAt),
          0,
          1,
        );
        const remaining = Math.pow(1 - localProgress, 1.35);
        const pull =
          (this.material === "pigment" ? 0.00062 : 0.00048) *
          (0.24 + particle.imprint * (this.material === "pigment" ? 0.82 : 1.02)) *
          (this.material === "pigment"
            ? 0.34 + localProgress * 0.66
            : 0.18 + localProgress * 0.82) *
          deltaSeconds *
          60 *
          motionScale;
        const livingPulse =
          this.material === "living" && !this.reducedMotion
            ? Math.sin(this.lastFrameAt * 0.00115 + particle.drift) *
              (0.32 + particle.depth * 0.56) *
              remaining
            : 0;
        particle.vx +=
          (particle.imprintX + flow.x * livingPulse - particle.x) * pull;
        particle.vy +=
          (particle.imprintY + flow.y * livingPulse - particle.y) * pull;
        if (this.material === "pigment") {
          const wick =
            (0.005 + particle.density * 0.013) *
            remaining *
            motionScale;
          particle.vx +=
            (projection.tangentX * 0.24 + flow.x * 0.76) * wick;
          particle.vy +=
            (projection.tangentY * 0.24 + flow.y * 0.76) * wick;
        } else {
          particle.vx += flow.x * 0.0045 * remaining * motionScale;
          particle.vy += flow.y * 0.0045 * remaining * motionScale;
        }
        const damping = Math.pow(
          this.material === "pigment" ? 0.88 : 0.9,
          deltaSeconds * 60,
        );
        particle.vx *= damping;
        particle.vy *= damping;
        particle.x += particle.vx * deltaSeconds * 60;
        particle.y += particle.vy * deltaSeconds * 60;
      } else if (particle.state === "drifting" && particle.grouped) {
        this.updateDriftingParticle(particle, deltaSeconds, revealElapsed);
      }

      if (this.isBeyondWorldOverscan(particle)) this.recycleOutsideWorld(particle);
    }
  }

  private materialGatherTarget(
    particle: DustParticle,
    point: FieldSelection,
    salt: number,
  ) {
    const lobeCount = this.material === "pigment" ? 4 : 3;
    const lobeSelector = hashGrid(
      Math.floor(particle.drift * 11000),
      salt,
      this.seed ^ 0x9e3779b9,
    );
    const lobe = Math.floor(lobeSelector * lobeCount);
    const lobeAngle =
      (lobe / lobeCount) * Math.PI * 2 +
      (hashGrid(lobe, salt + 17, this.seed) - 0.5) * 0.8;
    const lobeDistance =
      (this.material === "pigment" ? 8 : 10) +
      hashGrid(lobe, salt + 29, this.seed ^ 0xc2b2ae35) *
        (this.material === "pigment" ? 23 : 19);
    const grainAngle =
      hashGrid(
        Math.floor(particle.drift * 17000),
        salt + 41,
        this.seed ^ 0x27d4eb2d,
      ) *
      Math.PI *
      2;
    const grainRadius =
      Math.pow(
        hashGrid(
          Math.floor(particle.drift * 19000),
          salt + 53,
          this.seed ^ 0x85ebca6b,
        ),
        1.35,
      ) * (this.material === "pigment" ? 45 : 38);
    return {
      x:
        point.x +
        Math.cos(lobeAngle) * lobeDistance +
        Math.cos(grainAngle) * grainRadius,
      y:
        point.y +
        Math.sin(lobeAngle) * lobeDistance *
          (this.material === "pigment" ? 0.72 : 0.9) +
        Math.sin(grainAngle) *
          grainRadius *
          (this.material === "pigment" ? 0.62 : 0.86),
    };
  }

  private updateDriftingParticle(
    particle: DustParticle,
    deltaSeconds: number,
    revealElapsed: number,
  ) {
    const time = this.lastFrameAt;
    const structure = clamp(particle.imprint / 1.2, 0, 1);
    const flow = this.localFlow(particle.restX, particle.restY, time);
    const phase =
      particle.drift * 0.19 +
      particle.restX * 0.0021 +
      particle.restY * 0.0013;
    const followerTempo = hashGrid(
      Math.floor(particle.drift * 41000),
      337,
      this.seed ^ 0xc2b2ae35,
    );
    const persistentMotion =
      this.material === "living" &&
      this.stage === "revealed" &&
      !this.reducedMotion;
    const mobility =
      0.78 +
      hashGrid(
        Math.floor(particle.drift * 43000),
        353,
        this.seed ^ 0x27d4eb2d,
      ) *
        0.54;
    const smallParticlePresence = clamp(
      (1.25 - particle.size) / 0.85,
      0,
      1,
    );
    const driftTime = time * (0.76 + followerTempo * 0.52);
    let targetX: number;
    let targetY: number;

    if (this.material === "pigment") {
      const travel = 1.2 + structure * 2.2 + particle.depth * 1.4;
      targetX =
        particle.restX +
        (Math.sin(time * 0.000055 + phase) * 0.42 + flow.x * 0.58) * travel;
      targetY =
        particle.restY +
        (Math.cos(time * 0.000047 + phase * 1.07) * 0.42 + flow.y * 0.58) * travel;
    } else {
      let nearestAnchor = this.composition[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const anchor of this.composition) {
        const distance = Math.hypot(
          particle.restX - anchor.x,
          particle.restY - anchor.y,
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestAnchor = anchor;
        }
      }
      const anchorX = nearestAnchor?.x ?? particle.restX;
      const anchorY = nearestAnchor?.y ?? particle.restY;
      const offsetX = particle.restX - anchorX;
      const offsetY = particle.restY - anchorY;
      const breath = this.reducedMotion
        ? 0
        : Math.sin(driftTime * 0.00072 + phase * 1.7) *
          (0.012 + particle.depth * 0.008);
      const tangentLength = Math.max(1, Math.hypot(offsetX, offsetY));
      const tangentX = -offsetY / tangentLength;
      const tangentY = offsetX / tangentLength;
      const wander =
        Math.sin(driftTime * 0.00031 + phase * 2.3) *
        (0.7 + particle.depth * 1.6) *
        (persistentMotion ? 2.4 * mobility : 1);
      const crossWander = persistentMotion
        ? Math.cos(driftTime * 0.00019 + phase * 1.31) *
          (1.4 + particle.depth * 2.8) *
          mobility
        : 0;
      const flowTravel = persistentMotion
        ? (2.8 + particle.depth * 1.6) * mobility
        : 1.2;
      targetX =
        anchorX +
        offsetX * (1 + breath * (persistentMotion ? 1.85 * mobility : 1)) +
        tangentX * wander +
        flow.x * flowTravel +
        flow.y * crossWander;
      targetY =
        anchorY +
        offsetY * (1 + breath * (persistentMotion ? 1.85 * mobility : 1)) +
        tangentY * wander +
        flow.y * flowTravel -
        flow.x * crossWander;
      particle.alpha *=
        0.998 + Math.sin(time * 0.00072 + phase) * 0.002;
    }

    const cursorStage = this.stage === "pick" || this.stage === "revealed";
    const afterReveal = this.stage === "revealed";
    const cursorRadius = afterReveal
      ? 132 + particle.depth * 20
      : 150 + particle.depth * 22;
    const cursorDistance =
      this.gatherPoint && cursorStage
        ? Math.hypot(
            particle.x - this.gatherPoint.x,
            particle.y - this.gatherPoint.y,
          )
        : Number.POSITIVE_INFINITY;
    const cursorProximity = clamp(1 - cursorDistance / cursorRadius, 0, 1);
    const followsRevealedCursor = afterReveal && followerTempo < 0.84;
    const cursorEligible =
      this.material === "living" &&
      particle.follower &&
      (this.stage === "pick" || followsRevealedCursor);
    const cursorNearby =
      this.gatherPoint !== null && cursorEligible && cursorProximity > 0;
    const pullResponse =
      1 - Math.exp(-deltaSeconds * (cursorNearby ? 2.1 : 0.72));
    particle.cursorPull = lerp(
      particle.cursorPull,
      cursorNearby ? Math.pow(cursorProximity, 0.72) : 0,
      pullResponse,
    );
    const followsCursor =
      this.gatherPoint !== null &&
      cursorEligible &&
      (cursorProximity > 0 || particle.cursorPull > 0.025);

    if (this.gatherPoint && followsCursor) {
      const captureAngle =
        hashGrid(
          Math.floor(particle.drift * 17000),
          afterReveal ? 373 : 311,
          this.seed ^ 0x27d4eb2d,
        ) *
        Math.PI *
        2;
      const captureRadius =
        3 +
        Math.pow(
          hashGrid(
            Math.floor(particle.drift * 19000),
            afterReveal ? 397 : 331,
            this.seed ^ 0x85ebca6b,
          ),
          1.45,
        ) *
          (afterReveal ? 19 : 16);
      const searchAngle =
        time * (0.0001 + followerTempo * 0.000045) + phase * 0.83;
      const tangentSway =
        Math.sin(searchAngle) *
        (1.8 + particle.depth * 2.6) *
        (0.45 + particle.cursorPull * 0.55);
      const cursorTargetX =
        this.gatherPoint.x +
        Math.cos(captureAngle) * captureRadius +
        Math.cos(captureAngle + Math.PI * 0.5) * tangentSway;
      const cursorTargetY =
        this.gatherPoint.y +
        Math.sin(captureAngle) * captureRadius +
        Math.sin(captureAngle + Math.PI * 0.5) * tangentSway;
      targetX = cursorTargetX;
      targetY = cursorTargetY;
      particle.alpha = Math.min(
        particle.baseAlpha *
          (afterReveal
            ? 1.24 + smallParticlePresence * 0.12
            : 1.3 + smallParticlePresence * 0.14),
        particle.alpha +
          deltaSeconds *
            (afterReveal
              ? 0.018 + smallParticlePresence * 0.008
              : 0.026 + smallParticlePresence * 0.01),
      );
    }

    if (this.revealPoint && this.stage === "revealed" && !followsCursor) {
      const dx = this.revealPoint.x - particle.x;
      const dy = this.revealPoint.y - particle.y;
      const distance = Math.hypot(dx, dy);
      const selector = hashGrid(
        Math.floor(particle.drift * 12000),
        137,
        this.seed,
      );
      const tighten = this.reducedMotion
        ? 0
        : clamp(1 - revealElapsed / 1380, 0, 1);
      if (distance < 188 && selector < 0.56) {
        const destination = this.materialGatherTarget(
          particle,
          this.revealPoint,
          149,
        );
        targetX = lerp(
          targetX,
          destination.x,
          tighten,
        );
        targetY = lerp(
          targetY,
          destination.y,
          tighten,
        );
      }
    }

    const followingCursor = followsCursor && this.gatherPoint !== null;
    const response =
      1 -
      Math.exp(
        -deltaSeconds *
          (this.material === "pigment"
            ? 0.34 + particle.depth * 0.12
            : followingCursor
              ? this.stage === "revealed"
                ? 0.22 +
                  followerTempo * 0.22 +
                  particle.depth * 0.025 +
                  smallParticlePresence * 0.06
                : 0.3 +
                  followerTempo * 0.28 +
                  particle.depth * 0.03 +
                  smallParticlePresence * 0.07
              : 0.82 + particle.depth * 0.28),
      );
    particle.x = lerp(particle.x, targetX, response);
    particle.y = lerp(particle.y, targetY, response);
    if (particle.form !== 0) {
      particle.angle +=
        (flow.x - flow.y) *
        deltaSeconds *
        (this.material === "pigment" ? 0.004 : 0.018);
    }
  }

  private isBeyondWorldOverscan(particle: DustParticle) {
    const group = this.group;
    const worldX = particle.grouped && group ? group.originX + particle.x : particle.x;
    const worldY = particle.grouped && group ? group.originY + particle.y : particle.y;
    const overscan = Math.min(this.worldWidth, this.worldHeight) * 0.18;
    return (
      worldX < -overscan ||
      worldX > this.worldWidth + overscan ||
      worldY < -overscan ||
      worldY > this.worldHeight + overscan
    );
  }

  private recycleOutsideWorld(particle: DustParticle) {
    let x = this.random() * this.worldWidth;
    let y = this.random() * this.worldHeight;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidateX = this.random() * this.worldWidth;
      const candidateY = this.random() * this.worldHeight;
      const screenX = candidateX - this.cameraX;
      const screenY = candidateY - this.cameraY;
      x = candidateX;
      y = candidateY;
      if (
        screenX < -80 ||
        screenX > this.width + 80 ||
        screenY < -80 ||
        screenY > this.height + 80
      ) {
        break;
      }
    }
    particle.x = x;
    particle.y = y;
    particle.vx = 0;
    particle.vy = 0;
    particle.alpha = 0;
    particle.activation = 0;
    particle.imprint = 0;
    particle.state = "latent";
    particle.grouped = false;
    particle.follower = false;
    particle.cursorPull = 0;
  }

  private commitDeposit() {
    const context = this.depositContext;
    const group = this.group;
    if (!context || !group || this.depositCommitted) return;

    this.stampWashes(context);
    this.stampFibers(context);

    for (const particle of this.particles) {
      if (particle.state !== "active" || !particle.grouped) continue;
      const retainSelector = hashGrid(
        Math.floor(particle.drift * 32000),
        251,
        this.seed,
      );
      const retain =
        this.material === "pigment"
          ? retainSelector < 0.11 ||
            (particle.imprint > 0.82 && retainSelector < 0.19)
          : retainSelector < 0.52 ||
            (particle.imprint > 0.72 && retainSelector < 0.68);
      const followerSelector = hashGrid(
        Math.floor(particle.drift * 37000),
        271,
        this.seed ^ 0x85ebca6b,
      );
      const followerBase = particle.imprint > 0.72 ? 0.64 : 0.48;
      const smallFollowerBias =
        clamp((1.25 - particle.size) / 0.85, 0, 1) * 0.15;
      const largeFollowerPenalty =
        clamp((particle.size - 1.8) / 1.2, 0, 1) * 0.1;
      particle.restX = particle.x;
      particle.restY = particle.y;
      particle.vx *= 0.12;
      particle.vy *= 0.12;
      particle.cursorPull = 0;
      if (retain) {
        particle.follower =
          this.material === "living" &&
          followerSelector <
            clamp(
              followerBase + smallFollowerBias - largeFollowerPenalty,
              0.28,
              0.78,
            );
        particle.state = "drifting";
        continue;
      }

      particle.follower = false;
      const worldX = group.originX + particle.x;
      const worldY = group.originY + particle.y;
      const alpha = Math.min(
        particle.baseAlpha * particle.activation * DUST_VISIBILITY,
        particle.form === 2 ? 0.62 : particle.form === 1 ? 0.52 : 0.46,
      );
      this.drawParticleShape(context, particle, worldX, worldY, alpha);
      particle.state = "settled";
      particle.alpha = 0;
    }
    this.depositCommitted = true;
  }

  private traceWashShape(
    context: DepositContext,
    wash: PigmentWash,
    pulse = 0,
  ) {
    const points = wash.lobes.map((lobe, index) => {
      const angle = (index / wash.lobes.length) * Math.PI * 2;
      const asymmetricPulse =
        pulse * Math.sin(angle * 2 + wash.phase) * 0.45;
      const radius = lobe * (1 + pulse + asymmetricPulse);
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });
    if (points.length === 0) return;
    const first = points[0];
    const last = points.at(-1) ?? first;
    context.beginPath();
    context.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const next = points[(index + 1) % points.length];
      context.quadraticCurveTo(
        point.x,
        point.y,
        (point.x + next.x) * 0.5,
        (point.y + next.y) * 0.5,
      );
    }
    context.closePath();
  }

  private stampWashes(context: DepositContext) {
    const group = this.group;
    if (!group) return;
    for (const wash of this.washes) {
      const worldX = group.originX + wash.x;
      const worldY = group.originY + wash.y;
      context.save();
      context.translate(worldX, worldY);
      context.rotate(wash.rotation);
      context.scale(wash.radiusX, wash.radiusY);
      context.globalCompositeOperation =
        this.material === "pigment" ? "multiply" : "source-over";
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, `rgb(${WASH_COLORS[wash.color]} / ${wash.alpha})`);
      gradient.addColorStop(
        this.material === "pigment" ? 0.46 : 0.58,
        `rgb(${WASH_COLORS[wash.color]} / ${wash.alpha * (this.material === "pigment" ? 0.68 : 0.58)})`,
      );
      gradient.addColorStop(1, `rgb(${WASH_COLORS[wash.color]} / 0)`);
      context.fillStyle = gradient;
      this.traceWashShape(context, wash);
      context.fill();
      context.restore();
    }
  }

  private stampFibers(context: DepositContext) {
    const group = this.group;
    if (!group) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const fiber of this.fibers) {
      const [first, middle, last] = fiber.points;
      context.beginPath();
      context.moveTo(group.originX + first.x, group.originY + first.y);
      context.quadraticCurveTo(
        group.originX + middle.x,
        group.originY + middle.y,
        group.originX + last.x,
        group.originY + last.y,
      );
      context.strokeStyle = `rgb(${FIBER_COLORS[fiber.color]} / ${fiber.alpha * FIBER_VISIBILITY})`;
      context.lineWidth = 0.3 + ((fiber.phase / (Math.PI * 2)) % 1) * 0.34;
      context.stroke();
    }
  }

  private eraseDepositForReveal(point: RevealPoint) {
    const context = this.depositContext;
    const group = this.group;
    if (!context || !group || !this.depositCommitted) return;
    const worldX =
      group.originX + point.x + point.directionX * clamp(this.width * 0.082, 72, 102);
    const worldY =
      group.originY + point.y + point.directionY * clamp(this.height * 0.026, 20, 32);
    context.save();
    context.globalCompositeOperation = "destination-out";
    const gradient = context.createRadialGradient(worldX, worldY, 0, worldX, worldY, 134);
    gradient.addColorStop(0, "rgb(0 0 0 / 0.92)");
    gradient.addColorStop(0.58, "rgb(0 0 0 / 0.62)");
    gradient.addColorStop(1, "rgb(0 0 0 / 0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(worldX, worldY, 134, 52, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawParticleShape(
    context: DepositContext,
    particle: DustParticle,
    x: number,
    y: number,
    alpha: number,
  ) {
    const structure = clamp(particle.imprint / 1.2, 0, 1);
    const mineralPeak =
      clamp((particle.mineral - 0.91) / 0.09, 0, 1) * structure;
    const displaySize =
      particle.size *
      (0.88 + particle.depth * 0.24) *
      (1 + mineralPeak * 0.14) *
      (this.material === "living" ? 1.14 : 1);
    context.fillStyle = `rgb(${DUST_COLORS[particle.color]} / ${alpha})`;

    if (this.material === "living") {
      const pointCount = particle.form === 2 ? 8 : particle.form === 1 ? 7 : 6;
      const points = Array.from({ length: pointCount }, (_, index) => {
        const angle = particle.angle + (index / pointCount) * Math.PI * 2;
        const irregularity =
          0.78 +
          hashGrid(
            Math.floor(particle.drift * 29000),
            index * 23 + 11,
            this.seed ^ 0x9e3779b9,
          ) *
            0.34;
        return {
          x: x + Math.cos(angle) * displaySize * irregularity,
          y:
            y +
            Math.sin(angle) *
              displaySize *
              irregularity *
              (particle.form === 0 ? 0.92 : particle.aspect),
        };
      });
      const first = points[0];
      const last = points.at(-1) ?? first;
      context.beginPath();
      context.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        const next = points[(index + 1) % points.length];
        context.quadraticCurveTo(
          point.x,
          point.y,
          (point.x + next.x) * 0.5,
          (point.y + next.y) * 0.5,
        );
      }
      context.closePath();
      context.fill();
      return;
    }

    context.beginPath();
    if (particle.form === 0) {
      context.arc(x, y, displaySize, 0, Math.PI * 2);
    } else if (particle.form === 1) {
      context.ellipse(
        x,
        y,
        displaySize,
        displaySize * particle.aspect,
        particle.angle,
        0,
        Math.PI * 2,
      );
    } else {
      for (let index = 0; index < 5; index += 1) {
        const angle = particle.angle + (index / 5) * Math.PI * 2;
        const irregularity =
          0.72 +
          hashGrid(
            Math.floor(particle.drift * 11000),
            index * 17 + 5,
            this.seed,
          ) *
            0.38;
        const radius = displaySize * irregularity;
        const pointX = x + Math.cos(angle) * radius;
        const pointY =
          y + Math.sin(angle) * radius * (0.68 + particle.aspect * 0.32);
        if (index === 0) context.moveTo(pointX, pointY);
        else context.lineTo(pointX, pointY);
      }
      context.closePath();
    }
    context.fill();
  }

  private setSceneTransform(context: CanvasRenderingContext2D) {
    const group = this.group;
    if (!group) {
      context.setTransform(
        this.dpr,
        0,
        0,
        this.dpr,
        -this.cameraX * this.dpr,
        -this.cameraY * this.dpr,
      );
      return;
    }
    const offsetX =
      group.originX +
      group.translateX -
      group.originX * group.scale -
      this.cameraX;
    const offsetY =
      group.originY +
      group.translateY -
      group.originY * group.scale -
      this.cameraY;
    context.setTransform(
      this.dpr * group.scale,
      0,
      0,
      this.dpr * group.scale,
      offsetX * this.dpr,
      offsetY * this.dpr,
    );
  }

  private drawDeposit() {
    if (!this.depositSurface || !this.depositCommitted) return;
    this.context.drawImage(this.depositSurface, 0, 0);
  }

  private drawWashes(progress: number, time: number) {
    if (this.depositCommitted) return;
    const context = this.context;
    const group = this.group;
    if (!group) return;
    for (const wash of this.washes) {
      if (progress < wash.revealAt) continue;
      const localProgress = clamp(
        (progress - wash.revealAt) /
          (this.material === "pigment" ? 0.42 : 0.36),
        0,
        1,
      );
      const growth =
        this.material === "pigment"
          ? 0.72 + (1 - Math.pow(1 - localProgress, 3)) * 0.28
          : 0.93 + localProgress * 0.07;
      const pulse =
        this.material === "living" && !this.reducedMotion
          ? Math.sin(time * 0.00078 + wash.phase) *
            0.006 *
            Math.pow(localProgress, 2)
          : 0;
      const settlingMotion =
        this.stage === "settling" && !this.reducedMotion
          ? Math.pow(1 - localProgress, 2) *
            (this.material === "pigment" ? 1.6 : 0.24)
          : 0;
      const drift =
        Math.sin(time * (this.material === "pigment" ? 0.00018 : 0.0004) + wash.phase) *
        settlingMotion;
      context.save();
      context.translate(group.originX + wash.x + drift, group.originY + wash.y - drift * 0.45);
      context.rotate(wash.rotation);
      context.scale(wash.radiusX * growth, wash.radiusY * growth);
      context.globalCompositeOperation =
        this.material === "pigment" ? "multiply" : "source-over";
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(
        0,
        `rgb(${WASH_COLORS[wash.color]} / ${wash.alpha * localProgress})`,
      );
      gradient.addColorStop(
        this.material === "pigment" ? 0.46 : 0.58,
        `rgb(${WASH_COLORS[wash.color]} / ${wash.alpha * localProgress * (this.material === "pigment" ? 0.68 : 0.58)})`,
      );
      gradient.addColorStop(1, `rgb(${WASH_COLORS[wash.color]} / 0)`);
      context.fillStyle = gradient;
      this.traceWashShape(context, wash, pulse);
      context.fill();
      context.restore();
    }
  }

  private drawFibers(progress: number, time: number) {
    if (this.depositCommitted) return;
    const context = this.context;
    const group = this.group;
    if (!group) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const fiber of this.fibers) {
      if (progress < fiber.revealAt) continue;
      const localProgress = clamp((progress - fiber.revealAt) / 0.18, 0, 1);
      const [first, middle, last] = fiber.points;
      const stillness =
        this.stage === "settling" && !this.reducedMotion
          ? Math.pow(1 - progress, 2)
          : 0;
      const drift =
        Math.sin(time * 0.00052 + fiber.phase) *
        stillness *
        (this.material === "pigment" ? 0.62 : 0.18);
      context.beginPath();
      context.moveTo(group.originX + first.x, group.originY + first.y + drift);
      context.quadraticCurveTo(
        group.originX + middle.x,
        group.originY + middle.y + drift,
        group.originX + last.x,
        group.originY + last.y + drift,
      );
      context.strokeStyle = `rgb(${FIBER_COLORS[fiber.color]} / ${fiber.alpha * localProgress * FIBER_VISIBILITY})`;
      context.lineWidth = 0.3 + ((fiber.phase / (Math.PI * 2)) % 1) * 0.34;
      context.stroke();
    }
  }

  private drawParticles() {
    const context = this.context;
    for (const particle of this.particles) {
      if (
        particle.alpha < 0.002 ||
        particle.state === "latent" ||
        particle.state === "settled"
      ) {
        continue;
      }
      const screen = particle.grouped
        ? this.localToScreen(particle.x, particle.y)
        : this.worldToScreen(particle.x, particle.y);
      if (
        screen.x < -16 ||
        screen.x > this.width + 16 ||
        screen.y < -16 ||
        screen.y > this.height + 16
      ) {
        continue;
      }
      let alpha =
        particle.alpha *
        DUST_VISIBILITY *
        (0.84 + particle.depth * 0.3) *
        (0.94 + clamp(particle.imprint / 1.2, 0, 1) * 0.24);
      if (
        this.material === "living" &&
        particle.state === "drifting" &&
        !this.reducedMotion
      ) {
        alpha *=
          0.93 +
          Math.sin(this.lastFrameAt * 0.00072 + particle.drift * 1.7) * 0.07;
      }
      const cursorStage = this.stage === "pick" || this.stage === "revealed";
      const revealedFollower =
        this.stage === "revealed" &&
        hashGrid(
          Math.floor(particle.drift * 41000),
          337,
          this.seed ^ 0xc2b2ae35,
        ) < 0.84;
      if (
        this.gatherPoint &&
        cursorStage &&
        particle.follower &&
        (this.stage === "pick" || revealedFollower)
      ) {
        const distance = Math.hypot(
          particle.x - this.gatherPoint.x,
          particle.y - this.gatherPoint.y,
        );
        const highlightRadius = this.stage === "revealed" ? 92 : 104;
        if (distance < highlightRadius) {
          const smallVisibility = clamp(
            (1.25 - particle.size) / 0.85,
            0,
            1,
          );
          alpha *=
            1 +
            Math.pow(1 - distance / highlightRadius, 2) *
              ((this.stage === "revealed" ? 0.2 : 0.3) +
                smallVisibility * 0.16);
        }
      }
      alpha = Math.min(
        alpha,
        particle.form === 2 ? 0.68 : particle.form === 1 ? 0.58 : 0.52,
      );
      const drawX = particle.grouped
        ? (this.group?.originX ?? 0) + particle.x
        : particle.x;
      const drawY = particle.grouped
        ? (this.group?.originY ?? 0) + particle.y
        : particle.y;
      this.drawParticleShape(context, particle, drawX, drawY, alpha);
    }
  }

  private render = (time: number) => {
    const revealAnimating =
      !this.reducedMotion &&
      this.stage === "revealed" &&
      this.revealPoint !== null &&
      time - this.revealStartedAt < 1950;
    const livingStage = ["pick", "revealed"].includes(this.stage);
    const activeMotion =
      this.stage === "drawing" ||
      this.stage === "settling" ||
      revealAnimating ||
      (this.stage === "pick" && this.gatherActive);
    const quietFrame = this.stage === "idle" || !activeMotion;
    const minimumFrameInterval =
      livingStage && !this.reducedMotion
        ? this.material === "living"
          ? 30
          : 72
        : 120;
    if (
      quietFrame &&
      this.lastFrameAt > 0 &&
      time - this.lastFrameAt < minimumFrameInterval
    ) {
      this.frame = window.requestAnimationFrame(this.render);
      return;
    }

    const deltaSeconds = clamp((time - (this.lastFrameAt || time)) / 1000, 0, 0.034);
    this.lastFrameAt = time;
    this.updateGroupTransform(time);
    const settleDuration = this.reducedMotion
      ? 650
      : this.material === "pigment"
        ? 5600
        : 6200;
    const settleProgress =
      this.stage === "settling"
        ? clamp((time - this.settleStartedAt) / settleDuration, 0, 1)
        : this.stage === "drawing" || this.stage === "idle"
          ? 0
          : 1;
    this.updateParticles(deltaSeconds, settleProgress);

    const context = this.context;
    context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    this.setSceneTransform(context);
    this.drawDeposit();
    this.drawWashes(settleProgress, time);
    this.drawFibers(settleProgress, time);
    this.drawParticles();

    if (this.stage === "settling" && settleProgress >= 1 && !this.settledNotified) {
      this.settledNotified = true;
      this.commitDeposit();
      this.stage = "pick";
      this.gatherPoint = null;
      this.gatherActive = false;
      this.onSettled();
    }

    this.frame = window.requestAnimationFrame(this.render);
  };
}
