// Diálogo para corregir la escala del proyecto a partir de una medida conocida.

import { store } from './state.js';
import { scaleProject } from './model.js';
import { h } from './dom.js';
import * as G from './geometry.js';

/**
 * Pide la longitud real de la línea medida (a → b, en cm del plano actual) y escala todo el proyecto.
 * Devuelve una promesa que se resuelve con true si se aplicó.
 */
export function openScaleDialog({ a, b, len }) {
  return new Promise((resolve) => {
    const backdrop = h('div', { class: 'modal-backdrop' });
    const input = h('input', { type: 'text', inputmode: 'decimal', value: (len / 100).toFixed(2).replace('.', ',') });
    const sizes = h('input', { type: 'checkbox', checked: true });
    const preview = h('p', { class: 'pi-info' });
    const applyBtn = h('button', { class: 'btn primary' }, 'Aplicar escala');

    const parse = () => {
      const v = parseFloat(input.value.replace(',', '.'));
      return Number.isFinite(v) && v > 0 ? v * 100 : null;
    };
    const update = () => {
      const real = parse();
      applyBtn.disabled = !real || Math.abs(real - len) < 0.05;
      if (!real) {
        preview.textContent = 'Escribe una longitud válida en metros.';
        preview.classList.add('warn');
        return;
      }
      preview.classList.remove('warn');
      const f = real / len;
      const b0 = G.projectBounds(store.project);
      const size = b0 ? ` · El proyecto pasará a medir ≈ ${G.fmtLen((b0.maxX - b0.minX) * f)} × ${G.fmtLen((b0.maxY - b0.minY) * f)}` : '';
      preview.textContent = `Factor ${f.toFixed(3).replace('.', ',')} (${f >= 1 ? '+' : ''}${((f - 1) * 100).toFixed(1).replace('.', ',')} %)${size}`;
    };
    const close = (applied) => {
      backdrop.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve(applied);
    };
    const apply = () => {
      const real = parse();
      if (!real) return;
      store.checkpoint();
      scaleProject(store.project, real / len, a.x, a.y, { scaleSizes: sizes.checked });
      store.changed();
      close(true);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Enter' && !applyBtn.disabled) {
        e.preventDefault();
        apply();
      }
    };
    input.addEventListener('input', update);
    applyBtn.addEventListener('click', apply);
    window.addEventListener('keydown', onKey, true);

    backdrop.append(
      h(
        'div',
        { class: 'modal small', role: 'dialog', 'aria-label': 'Corregir escala' },
        h('header', { class: 'modal-head' }, h('h2', {}, 'Corregir escala'), h('button', { class: 'btn icon', title: 'Cerrar (Esc)', onclick: () => close(false) }, '✕')),
        h(
          'div',
          { class: 'modal-content' },
          h('p', { class: 'hint' }, `La línea que marcaste mide ahora ${G.fmtLen(len)} en el proyecto. ¿Cuánto mide en la realidad?`),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Longitud real'), h('span', { class: 'field-input' }, input, h('span', { class: 'unit' }, 'm'))),
          preview,
          h('label', { class: 'check' }, sizes, h('span', {}, 'Escalar también el grosor de los muros y el ancho de puertas y ventanas')),
          h('p', { class: 'hint' }, 'Todo el plano (muros, habitaciones, posiciones y plano de fondo) se ajusta a la nueva escala. Los muebles conservan su tamaño. Puedes deshacerlo con Ctrl+Z.'),
        ),
        h('footer', { class: 'modal-foot' }, h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => close(false) }, 'Cancelar'), applyBtn),
      ),
    );
    document.body.append(backdrop);
    update();
    input.focus();
    input.select();
  });
}
