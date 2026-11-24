// Utilidades geométricas y de color. Todas las medidas del plano están en centímetros.

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
export const toRad = (d) => (d * Math.PI) / 180;
export const toDeg = (r) => (r * 180) / Math.PI;
export const normAngle = (a) => ((a % 360) + 360) % 360;
export const round1 = (v) => Math.round(v * 10) / 10;

export function rotate(p, angDeg) {
  const r = toRad(angDeg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

export const distToSegment = (p, a, b) => dist(p, projectOnSegment(p, a, b));

export function distToPolygonEdges(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    best = Math.min(best, distToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  }
  return best;
}

// ---- Muros ----
export const wallLength = (w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
export const wallAngle = (w) => toDeg(Math.atan2(w.y2 - w.y1, w.x2 - w.x1));

/** Diferencia angular ignorando el sentido (0..90). */
export function angleDiff180(a, b) {
  const d = normAngle(a - b) % 180;
  return Math.min(d, 180 - d);
}
/** Diferencia angular con sentido (0..180). */
export function angleDiff360(a, b) {
  const d = normAngle(a - b);
  return Math.min(d, 360 - d);
}

/** Cuánto se prolonga cada extremo del muro para cerrar bien las esquinas. */
export function wallExtensions(w, walls) {
  const t = w.thickness / 2;
  const near = (x, y) =>
    walls.some((o) => o !== w && (Math.hypot(o.x1 - x, o.y1 - y) < 1 || Math.hypot(o.x2 - x, o.y2 - y) < 1));
  return { ea: near(w.x1, w.y1) ? t : 0, eb: near(w.x2, w.y2) ? t : 0 };
}

export function wallPolygon(w, ea = 0, eb = 0) {
  const L = wallLength(w);
  if (L < 0.01) return null;
  const ux = (w.x2 - w.x1) / L;
  const uy = (w.y2 - w.y1) / L;
  const nx = -uy;
  const ny = ux;
  const t = w.thickness / 2;
  const ax = w.x1 - ux * ea;
  const ay = w.y1 - uy * ea;
  const bx = w.x2 + ux * eb;
  const by = w.y2 + uy * eb;
  return [
    { x: ax + nx * t, y: ay + ny * t },
    { x: bx + nx * t, y: by + ny * t },
    { x: bx - nx * t, y: by - ny * t },
    { x: ax - nx * t, y: ay - ny * t },
  ];
}

// ---- Objetos (muebles) ----
export function toLocal(it, p) {
  return rotate({ x: p.x - it.x, y: p.y - it.y }, -it.rotation);
}
export function toWorld(it, p) {
  const q = rotate(p, it.rotation);
  return { x: q.x + it.x, y: q.y + it.y };
}
export function itemCorners(it) {
  const w = it.w / 2;
  const d = it.d / 2;
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([x, y]) => toWorld(it, { x, y }));
}
export function pointInItem(it, p, tol = 0) {
  const l = toLocal(it, p);
  return Math.abs(l.x) <= it.w / 2 + tol && Math.abs(l.y) <= it.d / 2 + tol;
}

// ---- Polígonos ----
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
export function polygonPerimeter(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]);
  return s;
}
export function polygonCentroid(pts) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length || 1;
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function projectBounds(project) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const w of project.walls) {
    add(w.x1, w.y1);
    add(w.x2, w.y2);
  }
  for (const r of project.rooms) for (const q of r.points) add(q.x, q.y);
  for (const it of project.items) for (const c of itemCorners(it)) add(c.x, c.y);
  // Un proyecto vacío con plano de fondo se encuadra sobre la imagen.
  const bg = project.background;
  if (minX === Infinity && bg?.visible) {
    add(bg.x, bg.y);
    add(bg.x + bg.w, bg.y + bg.h);
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

// ---- Formato ----
export function fmtLen(cm) {
  if (Math.abs(cm) >= 100) return (cm / 100).toFixed(2).replace('.', ',') + ' m';
  return Math.round(cm) + ' cm';
}
export function fmtArea(cm2) {
  return (cm2 / 10000).toFixed(2).replace('.', ',') + ' m²';
}

// ---- Color ----
export function hexToRgb(hex) {
  let h = String(hex || '#888888').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

// ---- Aleatorio determinista ----
export function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
