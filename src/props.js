// Panel derecho: propiedades del elemento seleccionado o, sin selección, del proyecto.

import { store } from './state.js';
import { getDef } from './catalog.js';
import { FLOORS, floorCanvas } from './textures.js';
import * as G from './geometry.js';
import { movePoint, addWallsAround, DEFAULT_WALL_COLOR } from './model.js';
import { h } from './dom.js';

const edit = (fn) => {
  store.checkpoint();
  fn();
  store.changed();
};

function num(label, value, onCommit, { unit = 'cm', min = -1e6, max = 1e6, step = 1 } = {}) {
  const input = h('input', { type: 'number', value: G.round1(value), step, min, max });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!Number.isFinite(v)) return void (input.value = G.round1(value));
    onCommit(G.clamp(v, min, max));
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-input' }, input, unit ? h('span', { class: 'unit' }, unit) : null));
}
function textField(label, value, onCommit) {
  const input = h('input', { type: 'text', value });
  input.addEventListener('change', () => onCommit(input.value.trim() || value));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-input' }, input));
}
function colorField(label, value, onCommit) {
  const input = h('input', { type: 'color', value });
  input.addEventListener('change', () => onCommit(input.value));
  return h('label', { class: 'field color' }, h('span', { class: 'field-label' }, label), input);
}
function check(label, value, onChange) {
  const input = h('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check' }, input, h('span', {}, label));
}
function selectField(label, value, options, onChange) {
  const sel = h('select', {}, ...options.map(([v, t]) => h('option', { value: v }, t)));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'field wide' }, h('span', { class: 'field-label' }, label), h('span', { class: 'field-input' }, sel));
}
const section = (title, ...kids) => h('section', { class: 'panel-section' }, title ? h('h3', {}, title) : null, ...kids);
const grid = (...kids) => h('div', { class: 'fields' }, ...kids);
const btn = (label, onClick, cls = '') => h('button', { class: 'btn ' + cls, onclick: onClick }, label);
const info = (label, value) => h('div', { class: 'info-row' }, h('span', {}, label), h('strong', {}, String(value)));
const actions = (...b) => h('div', { class: 'panel-actions' }, ...b);

const swatchCache = new Map();
const swatch = (type) => {
  if (!swatchCache.has(type)) swatchCache.set(type, floorCanvas(type, 128).toDataURL());
  return swatchCache.get(type);
};

export class PropsPanel {
  constructor(el, editor) {
    this.el = el;
    this.editor = editor;
    this.pending = false;
    store.addEventListener('selection', () => this.render());
    store.addEventListener('change', () => this.queue());
    el.addEventListener('focusout', () => setTimeout(() => this.pending && this.queue(), 0));
    this.render();
  }

  queue() {
    this.pending = true;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      // No se redibuja mientras el usuario escribe en un campo del panel.
      if (this.el.contains(document.activeElement) && document.activeElement !== document.body) return;
      this.render();
    });
  }

  render() {
    this.pending = false;
    const sel = store.selectedEntities();
    const scroll = this.el.scrollTop;
    this.el.replaceChildren();
    if (!sel.length) this.renderProject();
    else if (sel.length > 1) this.renderMulti(sel);
    else if (sel[0].kind === 'item') this.renderItem(sel[0].obj);
    else if (sel[0].kind === 'wall') this.renderWall(sel[0].obj);
    else this.renderRoom(sel[0].obj);
    this.el.scrollTop = scroll;
  }

  head(title, chip) {
    return h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, title), chip ? h('span', { class: 'chip' }, chip) : null);
  }

  renderItem(it) {
    const def = getDef(it.type) || { name: it.type, cat: '' };
    const set = (k) => (v) => edit(() => (it[k] = v));
    this.el.append(
      this.head(def.name, def.cat),
      section(
        'Dimensiones',
        grid(
          num('Ancho', it.w, set('w'), { min: 1 }),
          num(def.opening ? 'Grosor' : 'Fondo', it.d, set('d'), { min: 1 }),
          num('Alto', it.h, set('h'), { min: 1 }),
          num(def.opening === 'window' ? 'Antepecho' : 'Elevación', it.elev || 0, set('elev'), { min: 0 }),
        ),
      ),
      section(
        'Posición',
        grid(
          num('X', it.x, set('x')),
          num('Y', it.y, set('y')),
          num('Rotación', it.rotation, (v) => edit(() => (it.rotation = G.normAngle(v))), { unit: '°' }),
        ),
      ),
      section('Apariencia', colorField('Color', it.color || '#888888', set('color'))),
    );
    if (def.opening === 'door')
      this.el.append(
        section(
          'Apertura',
          check('Bisagra al otro lado', !!it.mirror, (v) => edit(() => (it.mirror = v))),
          btn('Abrir hacia el otro lado', () => edit(() => (it.rotation = G.normAngle(it.rotation + 180)))),
        ),
      );
    this.el.append(
      actions(
        btn('Rotar 90°', () => this.editor.rotateSelection(90)),
        btn('Duplicar', () => this.editor.duplicateSelection()),
        btn('Eliminar', () => store.deleteSelection(), 'danger'),
      ),
    );
  }

  renderWall(w) {
    const L = G.wallLength(w);
    const set = (k) => (v) => edit(() => (w[k] = v));
    this.el.append(
      this.head('Muro', G.fmtLen(L)),
      section(
        'Medidas',
        grid(
          num(
            'Largo',
            L,
            (v) =>
              edit(() => {
                if (L < 0.01) return;
                const ux = (w.x2 - w.x1) / L;
                const uy = (w.y2 - w.y1) / L;
                movePoint(store.project, w.x2, w.y2, G.round1(w.x1 + ux * v), G.round1(w.y1 + uy * v));
              }),
            { min: 5 },
          ),
          num('Grosor', w.thickness, set('thickness'), { min: 1, max: 100 }),
          num('Altura', w.height, set('height'), { min: 10, max: 1000 }),
        ),
        info('Ángulo', `${G.round1(G.normAngle(G.wallAngle(w)))}°`),
      ),
      section('Apariencia', colorField('Color', w.color || DEFAULT_WALL_COLOR, set('color'))),
      actions(
        btn('Dividir en dos', () => {
          const nw = { ...w, id: G.uid(), x1: G.round1((w.x1 + w.x2) / 2), y1: G.round1((w.y1 + w.y2) / 2) };
          edit(() => {
            w.x2 = nw.x1;
            w.y2 = nw.y1;
            store.project.walls.push(nw);
          });
          store.setSelection([{ kind: 'wall', id: nw.id }]);
        }),
        btn('Eliminar', () => store.deleteSelection(), 'danger'),
      ),
    );
  }

  renderRoom(r) {
    const floors = h(
      'div',
      { class: 'floor-grid' },
      ...Object.entries(FLOORS).map(([k, f]) =>
        h(
          'button',
          { class: 'floor-swatch' + (r.floor === k ? ' active' : ''), title: f.name, onclick: () => edit(() => (r.floor = k)) },
          h('span', { class: 'sw', style: `background-image:url(${swatch(k)})` }),
          h('span', { class: 'sw-name' }, f.name),
        ),
      ),
    );
    this.el.append(
      this.head('Habitación', G.fmtArea(G.polygonArea(r.points))),
      section('General', textField('Nombre', r.name, (v) => edit(() => (r.name = v)))),
      section('Suelo', floors),
      section('Medidas', info('Superficie', G.fmtArea(G.polygonArea(r.points))), info('Perímetro', G.fmtLen(G.polygonPerimeter(r.points))), info('Vértices', r.points.length)),
      actions(
        btn('Crear muros del contorno', () => {
          store.checkpoint();
          const n = addWallsAround(store.project, r.points);
          store.changed();
          if (!n) alert('Esta habitación ya tiene todos sus muros.');
        }),
        btn('Eliminar', () => store.deleteSelection(), 'danger'),
      ),
    );
  }

  renderMulti(sel) {
    const count = (k) => sel.filter((s) => s.kind === k).length;
    this.el.append(
      this.head(`${sel.length} elementos`, 'Selección'),
      section('Contenido', info('Muebles y aberturas', count('item')), info('Muros', count('wall')), info('Habitaciones', count('room'))),
      section(null, h('p', { class: 'hint' }, 'Arrastra cualquiera de los elementos para mover toda la selección. Usa las flechas del teclado para ajustes finos.')),
      actions(
        count('item') ? btn('Rotar muebles 90°', () => this.editor.rotateSelection(90)) : null,
        btn('Duplicar', () => this.editor.duplicateSelection()),
        btn('Eliminar', () => store.deleteSelection(), 'danger'),
      ),
    );
  }

  renderProject() {
    const p = store.project;
    const s = p.settings;
    const setS = (k) => (v) => {
      s[k] = v;
      store.changed();
    };
    const total = p.rooms.reduce((a, r) => a + G.polygonArea(r.points), 0);
    const openings = p.items.filter((i) => getDef(i.type)?.opening).length;
    const roomList = h(
      'div',
      { class: 'room-list' },
      ...p.rooms.map((r) =>
        h(
          'button',
          { class: 'room-row', onclick: () => store.setSelection([{ kind: 'room', id: r.id }]) },
          h('span', { class: 'sw small', style: `background-image:url(${swatch(r.floor)})` }),
          h('span', { class: 'room-name' }, r.name),
          h('span', { class: 'room-area' }, G.fmtArea(G.polygonArea(r.points))),
        ),
      ),
    );
    const keys = [
      ['V', 'Seleccionar'],
      ['M', 'Dibujar muros'],
      ['H', 'Habitación'],
      ['D', 'Medir'],
      ['K', 'Corregir escala'],
      ['R / Q / E', 'Rotar 90° / −15° / +15°'],
      ['Supr', 'Eliminar'],
      ['Ctrl+D', 'Duplicar'],
      ['Ctrl+Z / Ctrl+Y', 'Deshacer / Rehacer'],
      ['Flechas', 'Mover 1 cm (Shift: 10 cm)'],
      ['Alt', 'Mover sin ajuste ni imán'],
      ['Espacio + arrastrar', 'Desplazar el plano'],
      ['F', 'Encuadrar todo'],
    ];
    const bg = p.background;
    let bgSection = null;
    if (bg) {
      const range = h('input', { type: 'range', min: 5, max: 100, value: Math.round((bg.opacity ?? 0.5) * 100) });
      range.addEventListener('input', () => {
        bg.opacity = +range.value / 100;
        store.changed();
      });
      bgSection = section(
        'Plano de fondo',
        check('Mostrar el plano importado', !!bg.visible, (v) => {
          bg.visible = v;
          store.changed();
        }),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Opacidad'), range),
        store.assets[bg.asset] ? null : h('p', { class: 'hint' }, 'La imagen no está disponible en este navegador.'),
        h('p', { class: 'hint' }, '¿Las medidas no cuadran? Usa «Corregir escala» y marca una medida conocida del plano.'),
        h('div', { class: 'panel-actions inline' }, btn('Corregir escala', () => this.editor.setTool('scale')), btn('Quitar plano de fondo', () => edit(() => delete p.background), 'danger')),
      );
    }
    this.el.append(
      this.head('Proyecto', null),
      section(null, h('p', { class: 'hint' }, 'Selecciona un mueble, muro o habitación para editar sus propiedades. Arrastra muebles desde el catálogo al plano.')),
      bgSection ?? '',
      section(
        'Resumen',
        info('Superficie total', G.fmtArea(total)),
        info('Habitaciones', p.rooms.length),
        info('Muros', p.walls.length),
        info('Muebles', p.items.length - openings),
        info('Puertas y ventanas', openings),
        p.rooms.length ? roomList : null,
      ),
      section(
        'Muros nuevos',
        grid(num('Altura', s.wallHeight, setS('wallHeight'), { min: 50, max: 1000 }), num('Grosor', s.wallThickness, setS('wallThickness'), { min: 1, max: 100 })),
        btn('Aplicar altura a todos los muros', () => edit(() => p.walls.forEach((w) => (w.height = s.wallHeight)))),
      ),
      section(
        'Plano',
        selectField('Ajuste a cuadrícula', String(s.snap), [['1', '1 cm'], ['5', '5 cm'], ['10', '10 cm'], ['25', '25 cm'], ['50', '50 cm']], (v) => setS('snap')(+v)),
        check('Mostrar medidas de muros', s.showDims, setS('showDims')),
        check('Mostrar cuadrícula', s.showGrid, setS('showGrid')),
        btn('Corregir escala del plano', () => this.editor.setTool('scale')),
      ),
      section('Atajos de teclado', h('div', { class: 'keys' }, ...keys.map(([k, t]) => h('div', { class: 'key-row' }, h('kbd', {}, k), h('span', {}, t))))),
    );
  }
}
