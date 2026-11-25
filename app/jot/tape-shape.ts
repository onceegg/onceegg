// Stable, fine torn edges in SVG's 360 × 80 space; IDs retain their silhouette.
type Point = [number, number];
export function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
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
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export function tornPolygon(seed: number) {
  const random = seededRandom(seed);
  function horizontal(baseY: number) {
    const points: Point[] = [[10, baseY]];
    let x = 10, drift = 0;
    while (x < 350) {
      x = Math.min(350, x + 3 + random() * 5);
      drift = clamp(drift + (random() - 0.5) * 0.3, -0.55, 0.55);
      points.push([x, baseY + drift + (random() - 0.5) * 0.22]);
    }
    return points;
  }
  function vertical(start: Point, end: Point) {
    const points: Point[] = [];
    let y = start[1], drift = 0;
    while (y < end[1]) {
      y += 1.6 + random() * 2.3;
      if (y >= end[1]) break;
      drift = clamp(drift + (random() - 0.5) * 0.9, -1.8, 1.8);
      const fibre = (random() - 0.5) * 3.8;
      points.push([start[0] + drift + fibre, y]);
    }
    return points;
  }
  const top = horizontal(5.3);
  const bottom = horizontal(66.7);
  const right = vertical(top[top.length - 1], bottom[bottom.length - 1]);
  const left = vertical(top[0], bottom[0]).reverse();
  return [...top, ...right, ...bottom.reverse(), ...left].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
