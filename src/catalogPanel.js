// Panel izquierdo: catálogo de muebles con miniaturas, búsqueda y arrastrar y soltar.

import { CATALOG, CATEGORIES } from './catalog.js';
import { h, normalizeText } from './dom.js';

function thumb(def) {
  const W = 64;
  const H = 48;
  const dpr = window.devicePixelRatio || 1;
  const c = h('canvas', { class: 'thumb', width: W * dpr, height: H * dpr });
  c.style.width = W + 'px';
  c.style.height = H + 'px';
  const ctx = c.getContext('2d');
  const it = { type: def.type, w: def.w, d: def.d, h: def.h, color: def.color, rotation: 0, x: 0, y: 0 };
  const extra = def.type === 'puerta' ? def.w : def.type === 'puerta_doble' ? def.w / 2 : 0;
  const wallPad = def.opening ? 20 : 0;
  const bw = def.w + wallPad * 2;
  const bh = def.d + extra;
  const s = Math.min((W - 8) / bw, (H - 8) / bh);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, (dpr * W) / 2, dpr * (H / 2 - (extra / 2) * s));
  if (def.opening) {
    ctx.fillStyle = '#474e5d';
    ctx.fillRect(-def.w / 2 - wallPad, -def.d / 2, def.w + wallPad * 2, def.d);
  }
  ctx.lineJoin = 'round';
  def.draw(ctx, it, 1 / s);
  return c;
}

export function buildCatalog(listEl, searchEl, editor) {
  const thumbs = new Map(); // tipo → dataURL de la miniatura
  const thumbUrl = (d) => {
    if (!thumbs.has(d.type)) thumbs.set(d.type, thumb(d).toDataURL());
    return thumbs.get(d.type);
  };
  const render = () => {
    const f = normalizeText(searchEl.value.trim());
    listEl.replaceChildren();
    let total = 0;
    for (const cat of CATEGORIES) {
      const items = CATALOG.filter((d) => d.cat === cat && (!f || normalizeText(d.name + ' ' + d.cat).includes(f)));
      if (!items.length) continue;
      total += items.length;
      const gridEl = h('div', { class: 'cat-grid' });
      for (const d of items) {
        const card = h(
          'button',
          {
            class: 'cat-item',
            draggable: 'true',
            title: `${d.name} · ${d.w} × ${d.d} cm\nArrastra al plano o haz clic para añadir`,
            onclick: () => editor.placeItemAtCenter(d.type),
            ondragstart: (e) => {
              e.dataTransfer.setData('application/x-mueble', d.type);
              e.dataTransfer.effectAllowed = 'copy';
            },
          },
          h('span', { class: 'thumb-wrap' }, h('img', { src: thumbUrl(d), width: 64, height: 48, alt: '', draggable: 'false' })),
          h('span', { class: 'cat-name' }, d.name),
        );
        gridEl.append(card);
      }
      listEl.append(h('details', { class: 'cat-group', open: true }, h('summary', {}, cat, h('span', { class: 'count' }, items.length)), gridEl));
    }
    if (!total) listEl.append(h('p', { class: 'hint pad' }, 'No hay resultados para tu búsqueda.'));
  };
  searchEl.addEventListener('input', render);
  render();
}
