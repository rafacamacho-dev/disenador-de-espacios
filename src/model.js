// Modelo de datos del proyecto y operaciones básicas sobre él.

import { uid, dist, distToSegment, wallLength, wallAngle, angleDiff180 } from './geometry.js';
import { getDef } from './catalog.js';

export const DEFAULT_WALL_COLOR = '#f1ede6';

export function emptyProject() {
  return {
    version: 1,
    name: 'Proyecto sin título',
    settings: { wallHeight: 250, wallThickness: 15, snap: 5, showDims: true, showGrid: true },
    walls: [],
    rooms: [],
    items: [],
  };
}

export function normalizeProject(p) {
  const base = emptyProject();
  return {
    ...base,
    ...p,
    settings: { ...base.settings, ...(p?.settings || {}) },
    walls: Array.isArray(p?.walls) ? p.walls : [],
    rooms: Array.isArray(p?.rooms) ? p.rooms : [],
    items: Array.isArray(p?.items) ? p.items : [],
  };
}

/** ¿Ya existe un muro que cubre el tramo a-b? */
export function wallExists(project, a, b) {
  return project.walls.some((w) => {
    const A = { x: w.x1, y: w.y1 };
    const B = { x: w.x2, y: w.y2 };
    return distToSegment(a, A, B) < 1 && distToSegment(b, A, B) < 1;
  });
}

export function addWall(project, a, b, opts = {}) {
  if (dist(a, b) < 1) return null;
  if (!opts.force && wallExists(project, a, b)) return null;
  const w = {
    id: uid(),
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    thickness: opts.thickness ?? project.settings.wallThickness,
    height: opts.height ?? project.settings.wallHeight,
    color: opts.color ?? DEFAULT_WALL_COLOR,
  };
  project.walls.push(w);
  return w;
}

export const rectPoints = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

export function addRoom(project, name, points, floor = 'madera', withWalls = true) {
  const room = { id: uid(), name, floor, points: points.map((p) => ({ x: p.x, y: p.y })) };
  project.rooms.push(room);
  if (withWalls) addWallsAround(project, room.points);
  return room;
}

export function addWallsAround(project, pts) {
  let n = 0;
  for (let i = 0; i < pts.length; i++) if (addWall(project, pts[i], pts[(i + 1) % pts.length])) n++;
  return n;
}

export function addItem(project, type, x, y, rotation = 0, over = {}) {
  const def = getDef(type);
  if (!def) return null;
  const it = {
    id: uid(),
    type,
    x,
    y,
    rotation,
    w: def.w,
    d: def.opening ? project.settings.wallThickness : def.d,
    h: def.h,
    elev: def.elev || 0,
    color: def.color,
    ...over,
  };
  project.items.push(it);
  return it;
}

/** Referencias a todos los vértices (de muros y suelos) que coinciden con (x, y). */
export function collectPointRefs(project, x, y, tol = 1) {
  const refs = [];
  for (const w of project.walls) {
    if (Math.hypot(w.x1 - x, w.y1 - y) < tol) refs.push({ o: w, kx: 'x1', ky: 'y1' });
    if (Math.hypot(w.x2 - x, w.y2 - y) < tol) refs.push({ o: w, kx: 'x2', ky: 'y2' });
  }
  for (const r of project.rooms)
    for (const q of r.points) if (Math.hypot(q.x - x, q.y - y) < tol) refs.push({ o: q, kx: 'x', ky: 'y' });
  for (const ref of refs) {
    ref.x0 = ref.o[ref.kx];
    ref.y0 = ref.o[ref.ky];
  }
  return refs;
}

export function movePoint(project, x, y, nx, ny) {
  for (const r of collectPointRefs(project, x, y)) {
    r.o[r.kx] = nx;
    r.o[r.ky] = ny;
  }
}

/**
 * Cambia la escala de todo el proyecto en un factor f alrededor del punto (ox, oy).
 * Se escalan las posiciones de todo y el plano de fondo. Con scaleSizes, también el grosor de
 * los muros y el ancho de puertas y ventanas (que salen del plano). Los muebles conservan
 * su tamaño real y las alturas no cambian.
 */
export function scaleProject(project, f, ox, oy, { scaleSizes = true } = {}) {
  const r = (v) => Math.round(v * 10) / 10;
  const sx = (x) => r(ox + (x - ox) * f);
  const sy = (y) => r(oy + (y - oy) * f);
  for (const w of project.walls) {
    w.x1 = sx(w.x1);
    w.y1 = sy(w.y1);
    w.x2 = sx(w.x2);
    w.y2 = sy(w.y2);
    if (scaleSizes) w.thickness = Math.max(1, Math.round(w.thickness * f));
  }
  for (const room of project.rooms)
    for (const q of room.points) {
      q.x = sx(q.x);
      q.y = sy(q.y);
    }
  for (const it of project.items) {
    it.x = sx(it.x);
    it.y = sy(it.y);
    if (scaleSizes && getDef(it.type)?.opening) {
      it.w = Math.max(10, Math.round(it.w * f));
      it.d = Math.max(1, Math.round(it.d * f));
    }
  }
  const bg = project.background;
  if (bg) {
    bg.x = ox + (bg.x - ox) * f;
    bg.y = oy + (bg.y - oy) * f;
    bg.w *= f;
    bg.h *= f;
  }
  if (scaleSizes) project.settings.wallThickness = Math.max(1, Math.round(project.settings.wallThickness * f));
}

/** Puertas y ventanas colocadas sobre un muro, con su tramo a lo largo del muro. */
export function openingsOnWall(project, w) {
  const L = wallLength(w);
  if (L < 1) return [];
  const ux = (w.x2 - w.x1) / L;
  const uy = (w.y2 - w.y1) / L;
  const res = [];
  for (const it of project.items) {
    const def = getDef(it.type);
    if (!def?.opening) continue;
    const rx = it.x - w.x1;
    const ry = it.y - w.y1;
    const s = rx * ux + ry * uy;
    const n = -rx * uy + ry * ux;
    if (Math.abs(n) > w.thickness / 2 + 2 || s < -1 || s > L + 1) continue;
    if (angleDiff180(it.rotation, wallAngle(w)) > 3) continue;
    res.push({ it, def, s });
  }
  return res;
}
