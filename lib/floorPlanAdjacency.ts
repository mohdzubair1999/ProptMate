// "Arrange by doors": places rooms so that rooms joined by a door actually SHARE A WALL, instead of just being near each other. It works on
// each room's footprint (a rectangle that already includes any bay window or rotation), and returns a position for every room. Rooms
// never overlap. Pure and deterministic: the same rooms always give the same plan.

export type Box = { id: number; name: string; w: number; h: number; connectedTo?: string[] };
export type Placement = { id: number; x: number; y: number };
export type ArrangeResult = {
  placements: Placement[];
  connections: { total: number; sharing: number; apart: { a: string; b: string }[] }; // door connections, and how many ended up on a shared wall
  width: number;
  height: number;
};
export const MIN_SHARED_WALL_M = 0.8; // long enough for a door (a standard door is about 0.8 m)
const GAP_M = 1; // space between separate groups of rooms
const EPS = 1e-6;

const norm = (s: string) => String(s ?? "").trim().toLowerCase();
const size = (v: number) => (Number.isFinite(v) && v >= 0.3 ? v : 0.3);
const overlap1d = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

type P = { id: number; name: string; x: number; y: number; w: number; h: number };
const intersects = (a: P, b: P) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
// length of wall two rooms share (they must touch edge to edge); 0 when they only meet at a corner, or not at all
export function sharedWall(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const touchX = Math.abs(a.x + a.w - b.x) < 1e-4 || Math.abs(b.x + b.w - a.x) < 1e-4;
  const touchY = Math.abs(a.y + a.h - b.y) < 1e-4 || Math.abs(b.y + b.h - a.y) < 1e-4;
  if (touchX && !touchY) return overlap1d(a.y, a.y + a.h, b.y, b.y + b.h);
  if (touchY && !touchX) return overlap1d(a.x, a.x + a.w, b.x, b.x + b.w);
  if (touchX && touchY) return Math.max(overlap1d(a.y, a.y + a.h, b.y, b.y + b.h), overlap1d(a.x, a.x + a.w, b.x, b.x + b.w));
  return 0;
}

// the spots along each side of each anchor room where a room of this size could sit, aligned to its start, middle or end
function candidatesBeside(anchors: P[], b: { w: number; h: number }): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const n of anchors) {
    const xs = [n.x, n.x + n.w - b.w, n.x + (n.w - b.w) / 2], ys = [n.y, n.y + n.h - b.h, n.y + (n.h - b.h) / 2];
    for (const y of ys) { out.push({ x: n.x + n.w, y }); out.push({ x: n.x - b.w, y }); }
    for (const x of xs) { out.push({ x, y: n.y + n.h }); out.push({ x, y: n.y - b.h }); }
  }
  return out;
}

export function arrangeByConnections(input: Box[]): ArrangeResult {
  const boxes = (Array.isArray(input) ? input : []).filter((b) => b && typeof b === "object").map((b) => ({ id: b.id, name: String(b.name ?? ""), w: size(b.w), h: size(b.h), connectedTo: Array.isArray(b.connectedTo) ? b.connectedTo : [] }));
  if (boxes.length === 0) return { placements: [], connections: { total: 0, sharing: 0, apart: [] }, width: 0, height: 0 };

  // who is connected to whom (by name; a name shared by two rooms connects to both). A connection is mutual.
  const byName = new Map<string, number[]>();
  boxes.forEach((b, i) => byName.set(norm(b.name), [...(byName.get(norm(b.name)) ?? []), i]));
  const adj: Set<number>[] = boxes.map(() => new Set<number>());
  boxes.forEach((b, i) => {
    for (const other of b.connectedTo) for (const j of byName.get(norm(other)) ?? []) if (j !== i) { adj[i].add(j); adj[j].add(i); }
  });

  // groups of connected rooms, each started from its most-connected room (a hall that many rooms open onto), in a stable order
  const seen = new Set<number>();
  const groups: number[][] = [];
  const startOrder = boxes.map((_, i) => i).sort((a, b) => adj[b].size - adj[a].size || a - b);
  for (const s of startOrder) {
    if (seen.has(s)) continue;
    const order: number[] = [], q = [s];
    seen.add(s);
    while (q.length) {
      const c = q.shift()!;
      order.push(c);
      for (const n of [...adj[c]].sort((a, b) => adj[b].size - adj[a].size || a - b)) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    groups.push(order);
  }

  const placed: P[] = [];
  const at = new Map<number, P>();
  let cursorX = 0, rowY = 0, rowH = 0;
  const widest = Math.max(...boxes.map((b) => b.w));
  const targetWidth = Math.max(Math.sqrt(boxes.reduce((s, b) => s + b.w * b.h, 0)) * 1.6, widest);

  for (const group of groups) {
    const base = placed.length;
    // the group's first room goes in the next free spot in a row of groups; the rest attach to rooms already in the group
    for (const idx of group) {
      const b = boxes[idx];
      let best: { p: P; score: number[] } | null = null;
      const placedGroup = placed.slice(base);
      if (placedGroup.length === 0) {
        if (cursorX > 0 && cursorX + b.w > targetWidth) { cursorX = 0; rowY += rowH + GAP_M; rowH = 0; }
        const p: P = { id: idx, name: b.name, x: cursorX, y: rowY, w: b.w, h: b.h };
        placed.push(p); at.set(idx, p); cursorX += b.w + GAP_M; rowH = Math.max(rowH, b.h);
        continue;
      }
      const neighbours = [...adj[idx]].filter((n) => at.has(n)).map((n) => at.get(n)!);
      // Try beside its door neighbours first; if every such spot is taken, beside ANY room already in its group; and if that fails
      // too, clear below the whole plan, which cannot overlap anything. Every spot is checked against ALL rooms placed so far.
      for (const anchors of [neighbours, placedGroup]) {
        if (best || anchors.length === 0) continue;
        for (const c of candidatesBeside(anchors, b)) {
          const p: P = { id: idx, name: b.name, x: c.x, y: c.y, w: b.w, h: b.h };
          if (placed.some((o) => intersects(p, o))) continue;
          // how many of its door connections this spot satisfies with a wall long enough for a door
          const ok = neighbours.filter((n) => sharedWall(p, n) >= MIN_SHARED_WALL_M - EPS).length;
          const touching = placed.filter((o) => sharedWall(p, o) > EPS).length;
          const minX = Math.min(p.x, ...placed.map((o) => o.x)), minY = Math.min(p.y, ...placed.map((o) => o.y));
          const maxX = Math.max(p.x + p.w, ...placed.map((o) => o.x + o.w)), maxY = Math.max(p.y + p.h, ...placed.map((o) => o.y + o.h));
          const area = (maxX - minX) * (maxY - minY);
          // best: most door connections satisfied, then a more compact plan, then touching more rooms, then a stable position
          const score = [-ok, Math.round(area * 1000), -touching, Math.round(c.y * 1000), Math.round(c.x * 1000)];
          if (!best || lexLess(score, best.score)) best = { p, score };
        }
      }
      if (!best) {
        const maxY = Math.max(...placed.map((o) => o.y + o.h)), minX = Math.min(...placed.map((o) => o.x));
        best = { p: { id: idx, name: b.name, x: minX, y: maxY + GAP_M, w: b.w, h: b.h }, score: [] };
      }
      placed.push(best.p); at.set(idx, best.p);
    }
    // the next group starts to the right of this one (or on a new row)
    const g = placed.slice(base);
    const gMaxX = Math.max(...g.map((o) => o.x + o.w)), gMaxY = Math.max(...g.map((o) => o.y + o.h));
    cursorX = Math.max(cursorX, gMaxX + GAP_M); rowH = Math.max(rowH, gMaxY - rowY);
    if (cursorX > targetWidth) { cursorX = 0; rowY = Math.max(...placed.map((o) => o.y + o.h)) + GAP_M; rowH = 0; }
  }

  const minX = Math.min(...placed.map((p) => p.x)), minY = Math.min(...placed.map((p) => p.y));
  const placements = boxes.map((_, i) => { const p = at.get(i)!; return { id: boxes[i].id, x: round(p.x - minX), y: round(p.y - minY) }; });
  const pos = boxes.map((b, i) => ({ x: at.get(i)!.x - minX, y: at.get(i)!.y - minY, w: b.w, h: b.h }));
  const apart: { a: string; b: string }[] = [];
  let total = 0, sharing = 0;
  for (let i = 0; i < boxes.length; i++) for (const j of adj[i]) if (j > i) { total++; if (sharedWall(pos[i], pos[j]) >= MIN_SHARED_WALL_M - EPS) sharing++; else apart.push({ a: boxes[i].name, b: boxes[j].name }); }
  return { placements, connections: { total, sharing, apart }, width: round(Math.max(...pos.map((p) => p.x + p.w))), height: round(Math.max(...pos.map((p) => p.y + p.h))) };
}
const round = (v: number) => Math.round(v * 1000) / 1000;
// is list a smaller than list b, comparing item by item from the front (the first difference decides)
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
