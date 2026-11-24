// Editor de planos 2D sobre <canvas>: dibujo de muros, habitaciones, colocación de muebles,
// selección, movimiento, rotación, redimensionado, medición, zoom y desplazamiento.

import { store } from './state.js';
import { getDef, layerOf, drawGeneric } from './catalog.js';
import { floorCanvas } from './textures.js';
import * as G from './geometry.js';
import { addWall, addRoom, addItem, rectPoints, collectPointRefs, openingsOnWall } from './model.js';

const HANDLE_R = 6;
const COLORS = {
  bg: '#f6f7f9',
  grid: '#e7eaef',
  gridMajor: '#d2d7df',
  wall: '#474e5d',
  wallSel: '#2f7df6',
  sel: '#2f7df6',
  text: '#262a33',
  dim: '#6b7280',
};
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export class Editor2D extends EventTarget {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 0.8; // píxeles por centímetro
    this.ox = 40;
    this.oy = 40;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.tool = 'select';
    this.drag = null;
    this.chain = null;
    this.roomDraft = null;
    this.measure = null;
    this.hoverSnap = null;
    this.mouse = { sx: 0, sy: 0, x: 0, y: 0, inside: false };
    this.keys = { space: false };
    this.patterns = new WeakMap();
    this.bgImages = new Map();
    this.lastNudge = 0;
    this.dirty = true;

    this.bindEvents();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    store.addEventListener('change', () => this.invalidate());
    store.addEventListener('selection', () => this.invalidate());
    this.resize();
    const loop = () => {
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get settings() {
    return store.project.settings;
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  invalidate() {
    this.dirty = true;
  }

  // ---------------------------------------------------------------- Vista
  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const first = this.w < 10;
    // Mantiene centrado el mismo punto del plano cuando cambia el tamaño del panel.
    const center = first ? null : this.toWorld(this.w / 2, this.h / 2);
    this.w = r.width;
    this.h = r.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    if (first) this.fit();
    else {
      this.ox = this.w / 2 - center.x * this.scale;
      this.oy = this.h / 2 - center.y * this.scale;
    }
    this.invalidate();
  }
  toWorld(sx, sy) {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }
  toScreen(x, y) {
    return { x: x * this.scale + this.ox, y: y * this.scale + this.oy };
  }
  zoomAt(sx, sy, factor) {
    const w = this.toWorld(sx, sy);
    this.scale = G.clamp(this.scale * factor, 0.08, 12);
    this.ox = sx - w.x * this.scale;
    this.oy = sy - w.y * this.scale;
    this.invalidate();
    this.emit('view');
  }
  zoomBy(factor) {
    this.zoomAt(this.w / 2, this.h / 2, factor);
  }
  fit() {
    if (this.w < 10) return;
    const b = G.projectBounds(store.project) || { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    const pad = 60;
    const bw = Math.max(100, b.maxX - b.minX);
    const bh = Math.max(100, b.maxY - b.minY);
    this.scale = G.clamp(Math.min((this.w - pad * 2) / bw, (this.h - pad * 2) / bh), 0.08, 6);
    this.ox = this.w / 2 - ((b.minX + b.maxX) / 2) * this.scale;
    this.oy = this.h / 2 - ((b.minY + b.maxY) / 2) * this.scale;
    this.invalidate();
    this.emit('view');
  }

  // ---------------------------------------------------------------- Herramientas
  setTool(t) {
    this.cancelOps();
    this.tool = t;
    this.canvas.style.cursor = t === 'select' ? 'default' : 'crosshair';
    this.emit('tool', t);
  }
  cancelOps() {
    this.chain = null;
    this.roomDraft = null;
    this.measure = null;
    this.drag = null;
    this.invalidate();
  }
  escape() {
    if (this.chain || this.roomDraft || this.measure) return this.cancelOps();
    if (this.tool !== 'select') return this.setTool('select');
    store.setSelection([]);
  }
  finishChain() {
    this.chain = null;
    this.invalidate();
  }

  // ---------------------------------------------------------------- Acciones
  placeItem(type, at) {
    if (!getDef(type)) return;
    store.checkpoint();
    const st = this.settings.snap;
    const it = addItem(store.project, type, G.snapTo(at.x, st), G.snapTo(at.y, st), 0);
    this.applyItemSnap(it);
    store.changed();
    if (this.tool !== 'select') this.setTool('select');
    store.setSelection([{ kind: 'item', id: it.id }]);
  }
  placeItemAtCenter(type) {
    this.placeItem(type, this.toWorld(this.w / 2, this.h / 2));
  }
  rotateSelection(delta) {
    const sel = store.selectedEntities().filter((s) => s.kind === 'item');
    if (!sel.length) return;
    store.checkpoint();
    for (const s of sel) {
      s.obj.rotation = G.normAngle(s.obj.rotation + delta);
      if (getDef(s.obj.type)?.opening) this.snapOpeningToWall(s.obj);
    }
    store.changed();
  }
  duplicateSelection() {
    const sel = store.selectedEntities();
    if (!sel.length) return;
    store.checkpoint();
    const off = 30;
    const out = [];
    for (const s of sel) {
      const c = structuredClone(s.obj);
      c.id = G.uid();
      if (s.kind === 'item') {
        if (getDef(c.type)?.opening) {
          const d = G.rotate({ x: c.w + 20, y: 0 }, c.rotation);
          c.x += d.x;
          c.y += d.y;
        } else {
          c.x += off;
          c.y += off;
        }
      } else if (s.kind === 'wall') {
        c.x1 += off;
        c.y1 += off;
        c.x2 += off;
        c.y2 += off;
      } else if (s.kind === 'room') {
        c.points.forEach((q) => {
          q.x += off;
          q.y += off;
        });
        c.name += ' (copia)';
      }
      store.collection(s.kind).push(c);
      out.push({ kind: s.kind, id: c.id });
    }
    store.changed();
    store.setSelection(out);
  }
  selectAll() {
    const p = store.project;
    store.setSelection([
      ...p.rooms.map((r) => ({ kind: 'room', id: r.id })),
      ...p.walls.map((w) => ({ kind: 'wall', id: w.id })),
      ...p.items.map((i) => ({ kind: 'item', id: i.id })),
    ]);
  }
  nudge(dx, dy) {
    if (!store.selection.length) return;
    const now = performance.now();
    if (now - this.lastNudge > 800) store.checkpoint();
    this.lastNudge = now;
    const mv = this.collectMove();
    for (const r of mv.refs) {
      r.o[r.kx] += dx;
      r.o[r.ky] += dy;
    }
    for (const i of mv.items) {
      i.o.x += dx;
      i.o.y += dy;
    }
    store.changed();
  }

  // ---------------------------------------------------------------- Ajustes (snap)
  snapPoint(m, { from = null, shift = false, exclude = null } = {}) {
    const p = store.project;
    const tol = 10 / this.scale;
    let best = null;
    let bd = tol;
    const consider = (x, y) => {
      const d = Math.hypot(x - m.x, y - m.y);
      if (d < bd) {
        bd = d;
        best = { x, y, kind: 'punto' };
      }
    };
    for (const w of p.walls) {
      if (exclude?.has(w)) continue;
      consider(w.x1, w.y1);
      consider(w.x2, w.y2);
    }
    for (const r of p.rooms) for (const q of r.points) if (!exclude?.has(q)) consider(q.x, q.y);
    if (best) return best;

    // Alineación: iguala X o Y con vértices existentes cercanos (lock: 'h' = Y fija, 'v' = X fija).
    const align = (pt, lock = null) => {
      let bx = tol;
      let by = tol;
      let ax = null;
      let ay = null;
      const test = (x, y) => {
        if (lock !== 'v' && Math.abs(x - pt.x) < bx) {
          bx = Math.abs(x - pt.x);
          ax = x;
        }
        if (lock !== 'h' && Math.abs(y - pt.y) < by) {
          by = Math.abs(y - pt.y);
          ay = y;
        }
      };
      for (const w of p.walls) {
        if (exclude?.has(w)) continue;
        test(w.x1, w.y1);
        test(w.x2, w.y2);
      }
      if (ax !== null) pt.x = ax;
      if (ay !== null) pt.y = ay;
      return pt;
    };

    const st = this.settings.snap;
    if (from) {
      const dx = m.x - from.x;
      const dy = m.y - from.y;
      const len = Math.hypot(dx, dy);
      const deg = G.toDeg(Math.atan2(dy, dx));
      let target = null;
      if (shift) target = Math.round(deg / 15) * 15;
      else {
        const r = Math.round(deg / 45) * 45;
        if (Math.abs(deg - r) < 6) target = r;
      }
      if (target !== null && len > 0) {
        const L = G.snapTo(len, st);
        const t = G.toRad(target);
        const pt = { x: G.round1(from.x + Math.cos(t) * L), y: G.round1(from.y + Math.sin(t) * L), kind: 'angulo' };
        const a = G.normAngle(target);
        if (a % 180 === 0) return align(pt, 'h');
        if (a % 180 === 90) return align(pt, 'v');
        return pt;
      }
    }
    for (const w of p.walls) {
      if (exclude?.has(w)) continue;
      const q = G.projectOnSegment(m, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      const d = G.dist(m, q);
      if (d < tol * 0.8 && q.t > 0.001 && q.t < 0.999) {
        best = { x: G.round1(q.x), y: G.round1(q.y), kind: 'muro' };
        break;
      }
    }
    if (best) return best;
    return align({ x: G.snapTo(m.x, st), y: G.snapTo(m.y, st), kind: 'grid' });
  }

  applyItemSnap(it) {
    if (getDef(it.type)?.opening) this.snapOpeningToWall(it);
    else this.snapItemToWalls(it);
  }
  /** Coloca una puerta/ventana sobre el muro más cercano y la alinea con él. */
  snapOpeningToWall(it, maxDist = 40) {
    let best = null;
    let bd = maxDist;
    for (const w of store.project.walls) {
      const L = G.wallLength(w);
      if (L < it.w) continue;
      const q = G.projectOnSegment(it, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      const d = G.dist(it, q);
      if (d < bd) {
        bd = d;
        best = { w, q, L };
      }
    }
    if (!best) return false;
    const { w, L } = best;
    const ux = (w.x2 - w.x1) / L;
    const uy = (w.y2 - w.y1) / L;
    const s = G.clamp(best.q.t * L, it.w / 2, L - it.w / 2);
    it.x = G.round1(w.x1 + ux * s);
    it.y = G.round1(w.y1 + uy * s);
    const ang = G.wallAngle(w);
    const cands = [G.normAngle(ang), G.normAngle(ang + 180)];
    it.rotation = G.angleDiff360(cands[0], it.rotation) <= G.angleDiff360(cands[1], it.rotation) ? cands[0] : cands[1];
    it.d = w.thickness;
    return true;
  }
  /** Imán: pega el mueble a la cara del muro si está a menos de 15 cm. */
  snapItemToWalls(it) {
    const tol = 15;
    for (const w of store.project.walls) {
      const L = G.wallLength(w);
      if (L < 1) continue;
      const ux = (w.x2 - w.x1) / L;
      const uy = (w.y2 - w.y1) / L;
      const nx = -uy;
      const ny = ux;
      const rel = G.angleDiff180(it.rotation, G.wallAngle(w));
      let ext;
      if (rel < 2) ext = it.d / 2;
      else if (Math.abs(rel - 90) < 2) ext = it.w / 2;
      else continue;
      const s = (it.x - w.x1) * ux + (it.y - w.y1) * uy;
      if (s < 0 || s > L) continue;
      const n = (it.x - w.x1) * nx + (it.y - w.y1) * ny;
      const side = Math.sign(n) || 1;
      const gap = Math.abs(n) - w.thickness / 2 - ext;
      if (gap > -tol * 0.5 && gap < tol) {
        it.x = G.round1(it.x - nx * side * gap);
        it.y = G.round1(it.y - ny * side * gap);
      }
    }
  }

  // ---------------------------------------------------------------- Selección
  hitTest(m) {
    const p = store.project;
    const px = 1 / this.scale;
    const items = [...p.items].sort((a, b) => layerOf(b) - layerOf(a));
    for (const it of items) {
      const tol = (getDef(it.type)?.opening ? 6 : 3) * px;
      if (G.pointInItem(it, m, tol)) return { kind: 'item', id: it.id };
    }
    for (let i = p.walls.length - 1; i >= 0; i--) {
      const w = p.walls[i];
      if (G.distToSegment(m, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) <= Math.max(w.thickness / 2, 4 * px)) return { kind: 'wall', id: w.id };
    }
    for (let i = p.rooms.length - 1; i >= 0; i--) {
      if (G.pointInPolygon(m, p.rooms[i].points)) return { kind: 'room', id: p.rooms[i].id };
    }
    return null;
  }
  handles() {
    const sel = store.selectedEntities();
    if (sel.length !== 1) return [];
    const { kind, obj: o } = sel[0];
    const px = 1 / this.scale;
    if (kind === 'item') {
      const op = getDef(o.type)?.opening;
      return [
        { type: 'rotate', id: o.id, ...G.toWorld(o, { x: 0, y: -o.d / 2 - 24 * px }) },
        { type: 'resize', id: o.id, ...G.toWorld(o, op ? { x: o.w / 2, y: 0 } : { x: o.w / 2, y: o.d / 2 }) },
      ];
    }
    if (kind === 'wall')
      return [
        { type: 'point', x: o.x1, y: o.y1, from: { x: o.x2, y: o.y2 } },
        { type: 'point', x: o.x2, y: o.y2, from: { x: o.x1, y: o.y1 } },
      ];
    if (kind === 'room') return o.points.map((q) => ({ type: 'point', x: q.x, y: q.y, from: null }));
    return [];
  }
  hitHandle(m) {
    const r = (HANDLE_R + 3) / this.scale;
    return this.handles().find((hd) => Math.hypot(hd.x - m.x, hd.y - m.y) <= r) || null;
  }

  /** Reúne todo lo que debe moverse al arrastrar la selección actual. */
  collectMove() {
    const p = store.project;
    const refs = [];
    const items = [];
    const seen = new Set();
    const addRef = (r) => {
      if (!refs.some((x) => x.o === r.o && x.kx === r.kx)) refs.push(r);
    };
    const addPoint = (x, y) => collectPointRefs(p, x, y).forEach(addRef);
    const addIt = (it) => {
      if (seen.has(it)) return;
      seen.add(it);
      items.push({ o: it, x0: it.x, y0: it.y });
    };
    for (const s of store.selectedEntities()) {
      if (s.kind === 'item') addIt(s.obj);
      else if (s.kind === 'wall') {
        addPoint(s.obj.x1, s.obj.y1);
        addPoint(s.obj.x2, s.obj.y2);
        openingsOnWall(p, s.obj).forEach((o) => addIt(o.it));
      } else if (s.kind === 'room') {
        const r = s.obj;
        for (const q of r.points) addRef({ o: q, kx: 'x', ky: 'y', x0: q.x, y0: q.y });
        for (const it of p.items) if (G.pointInPolygon(it, r.points)) addIt(it);
        for (const w of p.walls) {
          if (G.distToPolygonEdges({ x: w.x1, y: w.y1 }, r.points) < 1 && G.distToPolygonEdges({ x: w.x2, y: w.y2 }, r.points) < 1) {
            addPoint(w.x1, w.y1);
            addPoint(w.x2, w.y2);
            openingsOnWall(p, w).forEach((o) => addIt(o.it));
          }
        }
      }
    }
    return { refs, items };
  }

  // ---------------------------------------------------------------- Eventos
  bindEvents() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('dblclick', () => {
      if (this.tool === 'wall') this.finishChain();
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerleave', () => {
      this.mouse.inside = false;
      this.invalidate();
    });
    c.addEventListener('dragover', (e) => {
      const types = e.dataTransfer.types;
      if (types.includes('application/x-mueble') || types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    c.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files?.[0];
      if (file) {
        e.preventDefault();
        this.emit('filedrop', file);
        return;
      }
      const type = e.dataTransfer.getData('application/x-mueble');
      if (!type) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.placeItem(type, this.toWorld(e.clientX - r.left, e.clientY - r.top));
    });
  }
  evPos(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { sx, sy, ...this.toWorld(sx, sy) };
  }
  ensureCp() {
    if (this.drag && !this.drag.cp) {
      store.checkpoint();
      this.drag.cp = true;
    }
  }

  onDown(e) {
    const m = this.evPos(e);
    this.mouse = { ...m, inside: true };
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.keys.space)) {
      this.drag = { type: 'pan', sx: m.sx, sy: m.sy, ox: this.ox, oy: this.oy, button: e.button, moved: false };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    if (this.tool !== 'measure' && this.tool !== 'scale') this.measure = null;
    switch (this.tool) {
      case 'select':
        return this.selectDown(m, e);
      case 'wall':
        return this.wallDown(m, e);
      case 'room': {
        const p = this.snapPoint(m);
        this.roomDraft = { a: p, b: p };
        return this.invalidate();
      }
      case 'measure':
      case 'scale': {
        const p = this.snapPoint(m);
        this.measure = { a: p, b: p, active: true };
        return this.invalidate();
      }
    }
  }

  selectDown(m, e) {
    const hd = this.hitHandle(m);
    if (hd) return this.startHandleDrag(hd);
    const hit = this.hitTest(m);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (hit) {
        const sel = store.selection.filter((s) => !(s.kind === hit.kind && s.id === hit.id));
        store.setSelection(sel.length === store.selection.length ? [...sel, hit] : sel);
      } else this.drag = { type: 'box', a: m, b: m, additive: true };
      return;
    }
    if (hit) {
      const already = store.isSelected(hit.kind, hit.id);
      if (hit.kind === 'room' && !already) {
        // Un clic selecciona la habitación; arrastrar sobre el suelo hace selección por recuadro.
        this.drag = { type: 'box', a: m, b: m, clickRoom: hit };
        return;
      }
      if (!already) store.setSelection([hit]);
      const mv = this.collectMove();
      const sel = store.selectedEntities();
      this.drag = {
        type: 'move',
        start: { x: m.x, y: m.y },
        ...mv,
        cp: false,
        moved: false,
        single: sel.length === 1 && sel[0].kind === 'item' ? sel[0].obj : null,
      };
    } else this.drag = { type: 'box', a: m, b: m };
  }

  startHandleDrag(hd) {
    if (hd.type === 'rotate') this.drag = { type: 'rotate', id: hd.id };
    else if (hd.type === 'resize') {
      const it = store.find('item', hd.id);
      const op = !!getDef(it.type)?.opening;
      this.drag = { type: 'resize', id: it.id, opening: op, F: G.toWorld(it, op ? { x: -it.w / 2, y: 0 } : { x: -it.w / 2, y: -it.d / 2 }) };
    } else {
      const refs = collectPointRefs(store.project, hd.x, hd.y);
      this.drag = { type: 'point', refs, from: hd.from, exclude: new Set(refs.map((r) => r.o)) };
    }
    this.drag.cp = false;
  }

  wallDown(m, e) {
    const from = this.chain?.points.at(-1) || null;
    const p = this.snapPoint(m, { from, shift: e.shiftKey });
    if (!this.chain) {
      this.chain = { points: [{ x: p.x, y: p.y }], preview: p };
      return this.invalidate();
    }
    if (G.dist(p, from) < 1) return this.finishChain();
    store.checkpoint();
    addWall(store.project, from, p, { force: true });
    const first = this.chain.points[0];
    if (this.chain.points.length >= 3 && G.dist(p, first) < 1) {
      // Contorno cerrado: se crea también el suelo de la habitación.
      addRoom(store.project, `Habitación ${store.project.rooms.length + 1}`, this.chain.points, 'madera', false);
      store.changed();
      return this.finishChain();
    }
    this.chain.points.push({ x: p.x, y: p.y });
    store.changed();
  }

  onMove(e) {
    const m = this.evPos(e);
    this.mouse = { ...m, inside: true };
    this.emit('cursor', m);
    const d = this.drag;
    const alt = e.altKey;
    if (d) {
      switch (d.type) {
        case 'pan':
          if (Math.hypot(m.sx - d.sx, m.sy - d.sy) > 3) d.moved = true;
          this.ox = d.ox + (m.sx - d.sx);
          this.oy = d.oy + (m.sy - d.sy);
          this.invalidate();
          this.emit('view');
          break;
        case 'box':
          d.b = m;
          this.invalidate();
          break;
        case 'move': {
          let dx = m.x - d.start.x;
          let dy = m.y - d.start.y;
          if (!d.moved) {
            if (Math.hypot(dx, dy) * this.scale < 3) return;
            d.moved = true;
          }
          this.ensureCp();
          const st = alt ? 0 : this.settings.snap;
          if (d.single && d.items.length === 1 && !d.refs.length) {
            const it = d.single;
            it.x = G.snapTo(d.items[0].x0 + dx, st);
            it.y = G.snapTo(d.items[0].y0 + dy, st);
            if (!alt) this.applyItemSnap(it);
          } else {
            dx = G.snapTo(dx, st);
            dy = G.snapTo(dy, st);
            for (const r of d.refs) {
              r.o[r.kx] = r.x0 + dx;
              r.o[r.ky] = r.y0 + dy;
            }
            for (const i of d.items) {
              i.o.x = i.x0 + dx;
              i.o.y = i.y0 + dy;
            }
          }
          store.changed();
          break;
        }
        case 'rotate': {
          const it = store.find('item', d.id);
          if (!it) break;
          this.ensureCp();
          const a = G.toDeg(Math.atan2(m.y - it.y, m.x - it.x)) + 90;
          it.rotation = G.normAngle(alt ? Math.round(a) : G.snapTo(a, 15));
          if (getDef(it.type)?.opening) this.snapOpeningToWall(it);
          store.changed();
          break;
        }
        case 'resize': {
          const it = store.find('item', d.id);
          if (!it) break;
          this.ensureCp();
          const v = G.rotate({ x: m.x - d.F.x, y: m.y - d.F.y }, -it.rotation);
          const st = alt ? 1 : this.settings.snap;
          if (d.opening) {
            it.w = Math.max(30, G.snapTo(v.x, st));
            const c = G.rotate({ x: it.w / 2, y: 0 }, it.rotation);
            it.x = d.F.x + c.x;
            it.y = d.F.y + c.y;
          } else {
            it.w = Math.max(5, G.snapTo(v.x, st));
            it.d = Math.max(5, G.snapTo(v.y, st));
            const c = G.rotate({ x: it.w / 2, y: it.d / 2 }, it.rotation);
            it.x = d.F.x + c.x;
            it.y = d.F.y + c.y;
          }
          store.changed();
          break;
        }
        case 'point': {
          this.ensureCp();
          const p = alt ? { x: G.round1(m.x), y: G.round1(m.y) } : this.snapPoint(m, { from: d.from, shift: e.shiftKey, exclude: d.exclude });
          for (const r of d.refs) {
            r.o[r.kx] = p.x;
            r.o[r.ky] = p.y;
          }
          store.changed();
          break;
        }
      }
      return;
    }

    if (this.tool === 'wall') {
      this.hoverSnap = this.snapPoint(m, { from: this.chain?.points.at(-1) || null, shift: e.shiftKey });
      if (this.chain) this.chain.preview = this.hoverSnap;
      this.invalidate();
    } else if (this.tool === 'room') {
      this.hoverSnap = this.snapPoint(m);
      if (this.roomDraft) this.roomDraft.b = this.hoverSnap;
      this.invalidate();
    } else if (this.tool === 'measure' || this.tool === 'scale') {
      if (this.measure?.active) {
        this.measure.b = this.snapPoint(m, { from: this.measure.a, shift: e.shiftKey });
        this.hoverSnap = this.measure.b;
      } else this.hoverSnap = this.snapPoint(m);
      this.invalidate();
    } else this.updateCursor(m);
  }

  updateCursor(m) {
    let cur = 'default';
    if (this.keys.space) cur = 'grab';
    else if (this.hitHandle(m)) cur = 'grab';
    else {
      const hit = this.hitTest(m);
      if (hit && (hit.kind !== 'room' || store.isSelected('room', hit.id))) cur = 'move';
      else if (hit) cur = 'pointer';
    }
    this.canvas.style.cursor = cur;
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (d?.type === 'pan') {
      this.canvas.style.cursor = this.tool === 'select' ? 'default' : 'crosshair';
      if (!d.moved && d.button === 2) {
        if (this.tool === 'wall' && this.chain) this.finishChain();
        else if (this.tool !== 'select') this.setTool('select');
      }
    } else if (d?.type === 'box') this.finishBox(d);
    if (this.roomDraft) this.finishRoom();
    if (this.measure?.active) {
      this.measure.active = false;
      if (G.dist(this.measure.a, this.measure.b) < 1) this.measure = null;
      // Herramienta Escala: la línea marcada se usa para corregir la escala del proyecto.
      else if (this.tool === 'scale') {
        const { a, b } = this.measure;
        if (G.dist(a, b) >= 10) this.emit('scalemeasure', { a, b, len: G.dist(a, b) });
        else this.measure = null;
      }
    }
    this.invalidate();
  }

  finishBox(d) {
    const moved = Math.hypot(d.a.x - d.b.x, d.a.y - d.b.y) * this.scale > 4;
    if (!moved) {
      if (d.clickRoom) store.setSelection([d.clickRoom]);
      else if (!d.additive) store.setSelection([]);
      return;
    }
    const x0 = Math.min(d.a.x, d.b.x);
    const x1 = Math.max(d.a.x, d.b.x);
    const y0 = Math.min(d.a.y, d.b.y);
    const y1 = Math.max(d.a.y, d.b.y);
    const inside = (p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
    const sel = d.additive ? [...store.selection] : [];
    const add = (kind, id) => {
      if (!sel.some((s) => s.kind === kind && s.id === id)) sel.push({ kind, id });
    };
    const p = store.project;
    for (const it of p.items) if (inside(it)) add('item', it.id);
    for (const w of p.walls) if (inside({ x: w.x1, y: w.y1 }) && inside({ x: w.x2, y: w.y2 })) add('wall', w.id);
    for (const r of p.rooms) if (r.points.every(inside)) add('room', r.id);
    store.setSelection(sel);
  }

  finishRoom() {
    const { a, b } = this.roomDraft;
    this.roomDraft = null;
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (w < 50 || h < 50) return;
    store.checkpoint();
    const room = addRoom(store.project, `Habitación ${store.project.rooms.length + 1}`, rectPoints(Math.min(a.x, b.x), Math.min(a.y, b.y), w, h), 'madera', true);
    store.changed();
    store.setSelection([{ kind: 'room', id: room.id }]);
  }

  // ---------------------------------------------------------------- Dibujo
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    if (this.settings.showGrid) this.drawGrid(ctx);
    ctx.save();
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.ox, this.dpr * this.oy);
    const px = 1 / this.scale;
    this.drawScene(ctx, px, true);
    this.drawOverlays(ctx, px);
    ctx.restore();
    this.drawScaleBar(ctx);
  }

  drawGrid(ctx) {
    const s = this.scale;
    let step = 10;
    for (const cand of [10, 50, 100, 500, 1000]) {
      step = cand;
      if (s * cand >= 9) break;
    }
    const major = step < 100 ? 100 : step * 5;
    const tl = this.toWorld(0, 0);
    const br = this.toWorld(this.w, this.h);
    const minor = new Path2D();
    const maj = new Path2D();
    for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) {
      const sx = Math.round(x * s + this.ox) + 0.5;
      (Math.abs(x % major) < 0.01 ? maj : minor).rect(sx, 0, 0, this.h);
    }
    for (let y = Math.floor(tl.y / step) * step; y <= br.y; y += step) {
      const sy = Math.round(y * s + this.oy) + 0.5;
      (Math.abs(y % major) < 0.01 ? maj : minor).rect(0, sy, this.w, 0);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.stroke(minor);
    ctx.strokeStyle = COLORS.gridMajor;
    ctx.stroke(maj);
  }

  drawScaleBar(ctx) {
    const targets = [10, 20, 50, 100, 200, 500, 1000, 2000];
    const cm = targets.find((t) => t * this.scale >= 60) || 2000;
    const len = cm * this.scale;
    const x = 16;
    const y = this.h - 18;
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.lineTo(x + len, y - 4);
    ctx.stroke();
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = COLORS.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(G.fmtLen(cm), x + len / 2, y - 3);
  }

  pathPoly(ctx, pts) {
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
  }

  floorPattern(ctx, type) {
    let m = this.patterns.get(ctx);
    if (!m) {
      m = new Map();
      this.patterns.set(ctx, m);
    }
    if (!m.has(type)) {
      const pat = ctx.createPattern(floorCanvas(type, 128), 'repeat');
      pat.setTransform(new DOMMatrix().scale(100 / 128));
      m.set(type, pat);
    }
    return m.get(type);
  }

  /** Dibuja el plano completo en coordenadas de mundo (cm). Se usa también para exportar. */
  drawScene(ctx, px, withSel) {
    const p = store.project;
    for (const r of p.rooms) {
      if (r.points.length < 3) continue;
      this.pathPoly(ctx, r.points);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.floorPattern(ctx, r.floor);
      ctx.fill();
      ctx.restore();
    }
    if (withSel) this.drawBackground(ctx);
    for (const w of p.walls) {
      const { ea, eb } = G.wallExtensions(w, p.walls);
      const poly = G.wallPolygon(w, ea, eb);
      if (!poly) continue;
      this.pathPoly(ctx, poly);
      ctx.fillStyle = withSel && store.isSelected('wall', w.id) ? COLORS.wallSel : COLORS.wall;
      ctx.fill();
    }
    const items = [...p.items].sort((a, b) => layerOf(a) - layerOf(b));
    for (const it of items) {
      const def = getDef(it.type);
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(G.toRad(it.rotation));
      ctx.lineJoin = 'round';
      (def?.draw || drawGeneric)(ctx, it, px);
      ctx.restore();
    }
    if (this.settings.showDims) this.drawWallDims(ctx, px);
    for (const r of p.rooms) this.drawRoomLabel(ctx, r, px);
    if (withSel) this.drawSelection(ctx, px);
  }

  /** Plano importado, dibujado en modo "multiplicar" para que se vea sobre los suelos. */
  drawBackground(ctx) {
    const bg = store.project.background;
    if (!bg?.visible) return;
    const src = store.assets[bg.asset];
    if (!src) return;
    let img = this.bgImages.get(bg.asset);
    if (!img) {
      img = new Image();
      img.onload = () => this.invalidate();
      img.src = src;
      this.bgImages.set(bg.asset, img);
    }
    if (!img.complete || !img.naturalWidth) return;
    ctx.save();
    ctx.globalAlpha = bg.opacity ?? 0.5;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(img, bg.x, bg.y, bg.w, bg.h);
    ctx.restore();
  }

  pill(ctx, px, x, y, text, { bg = 'rgba(255,255,255,0.9)', fg = COLORS.text, size = 11, angle = 0, weight = 500 } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `${weight} ${size * px}px ${FONT}`;
    const tw = ctx.measureText(text).width;
    const padX = 4 * px;
    const hh = (size + 5) * px;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-tw / 2 - padX, -hh / 2, tw + padX * 2, hh, 3 * px);
    else ctx.rect(-tw / 2 - padX, -hh / 2, tw + padX * 2, hh);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0.5 * px);
    ctx.restore();
  }

  drawWallDims(ctx, px) {
    for (const w of store.project.walls) {
      const L = G.wallLength(w);
      if (L / px < 45) continue;
      const ux = (w.x2 - w.x1) / L;
      const uy = (w.y2 - w.y1) / L;
      const off = w.thickness / 2 + 10 * px;
      const x = (w.x1 + w.x2) / 2 + uy * off;
      const y = (w.y1 + w.y2) / 2 - ux * off;
      let a = Math.atan2(uy, ux);
      if (a > Math.PI / 2 + 0.01 || a < -Math.PI / 2 + 0.01) a += Math.PI;
      this.pill(ctx, px, x, y, G.fmtLen(L), { angle: a, size: 10, fg: COLORS.dim, bg: 'rgba(246,247,249,0.85)' });
    }
  }

  drawRoomLabel(ctx, r, px) {
    if (r.points.length < 3) return;
    const c = G.polygonCentroid(r.points);
    const area = G.fmtArea(G.polygonArea(r.points));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `600 ${13 * px}px ${FONT}`;
    ctx.lineWidth = 4 * px;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(r.name, c.x, c.y - 8 * px);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(r.name, c.x, c.y - 8 * px);
    ctx.font = `${11 * px}px ${FONT}`;
    ctx.strokeText(area, c.x, c.y + 8 * px);
    ctx.fillStyle = COLORS.dim;
    ctx.fillText(area, c.x, c.y + 8 * px);
  }

  drawSelection(ctx, px) {
    const sel = store.selectedEntities();
    ctx.save();
    ctx.strokeStyle = COLORS.sel;
    ctx.lineWidth = 1.5 * px;
    ctx.setLineDash([5 * px, 4 * px]);
    for (const s of sel) {
      if (s.kind === 'item') {
        this.pathPoly(ctx, G.itemCorners(s.obj));
        ctx.stroke();
      } else if (s.kind === 'room') {
        this.pathPoly(ctx, s.obj.points);
        ctx.fillStyle = 'rgba(47,125,246,0.07)';
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    const hs = this.handles();
    if (sel.length === 1 && sel[0].kind === 'item') {
      const it = sel[0].obj;
      const top = G.toWorld(it, { x: 0, y: -it.d / 2 });
      const rot = hs[0];
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(rot.x, rot.y);
      ctx.stroke();
    }
    for (const hd of hs) {
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, HANDLE_R * px, 0, Math.PI * 2);
      ctx.fillStyle = hd.type === 'rotate' ? COLORS.sel : '#ffffff';
      ctx.fill();
      ctx.stroke();
      if (hd.type === 'rotate') {
        ctx.beginPath();
        ctx.arc(hd.x, hd.y, HANDLE_R * 0.5 * px, -Math.PI * 0.9, Math.PI * 0.4);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 * px;
        ctx.stroke();
        ctx.strokeStyle = COLORS.sel;
        ctx.lineWidth = 1.5 * px;
      }
    }
    ctx.restore();
  }

  drawOverlays(ctx, px) {
    if (this.tool === 'wall' && this.chain) {
      const a = this.chain.points.at(-1);
      const b = this.chain.preview || a;
      if (G.dist(a, b) > 0.5) {
        const poly = G.wallPolygon({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, thickness: this.settings.wallThickness });
        this.pathPoly(ctx, poly);
        ctx.fillStyle = 'rgba(47,125,246,0.35)';
        ctx.fill();
        ctx.strokeStyle = COLORS.sel;
        ctx.lineWidth = px;
        ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        let la = ang;
        if (la > Math.PI / 2 || la < -Math.PI / 2) la += Math.PI;
        const off = this.settings.wallThickness / 2 + 14 * px;
        this.pill(ctx, px, (a.x + b.x) / 2 + Math.sin(ang) * off, (a.y + b.y) / 2 - Math.cos(ang) * off, G.fmtLen(G.dist(a, b)), {
          bg: COLORS.sel,
          fg: '#fff',
          size: 11,
          angle: la,
          weight: 600,
        });
      }
      for (const q of this.chain.points) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3 * px, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.sel;
        ctx.fill();
      }
    }
    if (this.roomDraft) {
      const { a, b } = this.roomDraft;
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      ctx.fillStyle = 'rgba(47,125,246,0.1)';
      ctx.fillRect(x, y, w, h);
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.strokeStyle = COLORS.sel;
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      if (w > 0 && h > 0)
        this.pill(ctx, px, x + w / 2, y + h / 2, `${G.fmtLen(w)} × ${G.fmtLen(h)} · ${G.fmtArea(w * h)}`, { bg: COLORS.sel, fg: '#fff', weight: 600 });
    }
    if (this.measure) {
      const { a, b } = this.measure;
      const L = G.dist(a, b);
      if (L > 0.5) {
        const nx = (-(b.y - a.y) / L) * 6 * px;
        const ny = ((b.x - a.x) / L) * 6 * px;
        const color = this.tool === 'scale' ? '#c026d3' : '#e11d48';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5 * px;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(a.x - nx, a.y - ny);
        ctx.lineTo(a.x + nx, a.y + ny);
        ctx.moveTo(b.x - nx, b.y - ny);
        ctx.lineTo(b.x + nx, b.y + ny);
        ctx.stroke();
        this.pill(ctx, px, (a.x + b.x) / 2, (a.y + b.y) / 2, G.fmtLen(L), { bg: color, fg: '#fff', weight: 600, size: 12 });
      }
    }
    if (this.drag?.type === 'box') {
      const { a, b } = this.drag;
      ctx.fillStyle = 'rgba(47,125,246,0.08)';
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.strokeStyle = COLORS.sel;
      ctx.lineWidth = px;
      ctx.setLineDash([4 * px, 3 * px]);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      ctx.setLineDash([]);
    }
    if (this.hoverSnap && this.mouse.inside && this.tool !== 'select' && !this.drag) {
      const s = this.hoverSnap;
      ctx.beginPath();
      if (s.kind === 'punto') ctx.rect(s.x - 5 * px, s.y - 5 * px, 10 * px, 10 * px);
      else ctx.arc(s.x, s.y, 4 * px, 0, Math.PI * 2);
      ctx.strokeStyle = s.kind === 'punto' ? '#16a34a' : s.kind === 'muro' ? '#f59e0b' : COLORS.sel;
      ctx.lineWidth = 1.5 * px;
      ctx.stroke();
    }
  }

  exportPNG() {
    const b = G.projectBounds(store.project) || { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    const pad = 80;
    const bw = Math.max(100, b.maxX - b.minX);
    const bh = Math.max(100, b.maxY - b.minY);
    const scale = Math.min(2400 / bw, 2400 / bh, 3);
    const W = Math.round(bw * scale + pad * 2);
    const H = Math.round(bh * scale + pad * 2 + 30);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 24px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText(store.project.name, pad, 28);
    ctx.setTransform(scale, 0, 0, scale, pad - b.minX * scale, pad + 30 - b.minY * scale);
    this.drawScene(ctx, 1 / scale, false);
    return c.toDataURL('image/png');
  }
}
