// Catálogo de muebles y aberturas. Cada elemento define sus medidas por defecto (cm),
// su símbolo en planta (draw) y el constructor 3D que usa (build, ver furniture3d.js).
//
// Convención de ejes locales: ancho (w) en X, fondo (d) en Y. El "respaldo" del mueble
// está en -Y (arriba en el plano con rotación 0) y el frente en +Y.

import { lighten } from './geometry.js';

export const CATEGORIES = ['Dormitorio', 'Sala', 'Comedor', 'Cocina', 'Baño', 'Oficina', 'Decoración', 'Aberturas'];

const S = '#30343b';

function rr(ctx, x, y, w, h, r = 0) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function fs(ctx, px, fill, lw = 1.2) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = lw * px;
  ctx.strokeStyle = S;
  ctx.stroke();
}
function ln(ctx, px, x1, y1, x2, y2, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = lw * px;
  ctx.strokeStyle = S;
  ctx.stroke();
}
function circ(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(r, 0.1), 0, Math.PI * 2);
}
function ell(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
}
const tint = (c, t = 0.5) => lighten(c, t);
const dashed = (ctx, px, on = true) => ctx.setLineDash(on ? [4 * px, 3 * px] : []);

function body(ctx, it, px, t = 0.45, r = 2) {
  rr(ctx, -it.w / 2, -it.d / 2, it.w, it.d, r);
  fs(ctx, px, tint(it.color, t));
}
function frontLine(ctx, it, px, inset = 5) {
  ln(ctx, px, -it.w / 2, it.d / 2 - inset, it.w / 2, it.d / 2 - inset, 0.6);
}
function doorLeaf(ctx, px, hx, hy, len, dir) {
  ln(ctx, px, hx, hy, hx, hy + len, 2.2);
  ctx.beginPath();
  if (dir === 1) ctx.arc(hx, hy, len, 0, Math.PI / 2);
  else ctx.arc(hx, hy, len, Math.PI / 2, Math.PI);
  dashed(ctx, px);
  ctx.lineWidth = 0.8 * px;
  ctx.strokeStyle = S;
  ctx.stroke();
  dashed(ctx, px, false);
}
function openingCut(ctx, it, px) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-it.w / 2, -it.d / 2 - 1.5 * px, it.w, it.d + 3 * px);
  ln(ctx, px, -it.w / 2, -it.d / 2, -it.w / 2, it.d / 2, 1.4);
  ln(ctx, px, it.w / 2, -it.d / 2, it.w / 2, it.d / 2, 1.4);
}

const D = {
  rect(ctx, it, px) {
    body(ctx, it, px);
  },
  cama(ctx, it, px) {
    const { w, d } = it;
    rr(ctx, -w / 2, -d / 2, w, d, 3);
    fs(ctx, px, '#ffffff');
    rr(ctx, -w / 2, -d / 2, w, 7, 1);
    fs(ctx, px, tint('#8b6b4a', 0.25));
    const n = w >= 120 ? 2 : 1;
    const gap = 8;
    const pw = (w - gap * (n + 1)) / n;
    for (let i = 0; i < n; i++) {
      rr(ctx, -w / 2 + gap + i * (pw + gap), -d / 2 + 12, pw, Math.min(30, d * 0.16), 6);
      fs(ctx, px, '#fbfbfb');
    }
    const by = -d / 2 + d * 0.33;
    rr(ctx, -w / 2 + 2, by, w - 4, d / 2 - by - 2, 3);
    fs(ctx, px, tint(it.color, 0.35));
    ln(ctx, px, -w / 2 + 2, by + 12, w / 2 - 2, by + 12, 0.8);
  },
  sofa(ctx, it, px) {
    const { w, d } = it;
    const arm = Math.min(18, w * 0.16);
    const back = Math.min(22, d * 0.26);
    rr(ctx, -w / 2, -d / 2, w, d, 4);
    fs(ctx, px, tint(it.color, 0.45));
    rr(ctx, -w / 2, -d / 2, w, back, 4);
    fs(ctx, px, tint(it.color, 0.25));
    rr(ctx, -w / 2, -d / 2, arm, d, 4);
    fs(ctx, px, tint(it.color, 0.25));
    rr(ctx, w / 2 - arm, -d / 2, arm, d, 4);
    fs(ctx, px, tint(it.color, 0.25));
    const inner = w - 2 * arm;
    const n = Math.max(1, Math.round(inner / 65));
    const seg = inner / n;
    for (let i = 1; i < n; i++) ln(ctx, px, -w / 2 + arm + seg * i, -d / 2 + back, -w / 2 + arm + seg * i, d / 2 - 2, 0.8);
  },
  silla(ctx, it, px) {
    const { w, d } = it;
    rr(ctx, -w / 2 + 2, -d / 2 + 6, w - 4, d - 8, 4);
    fs(ctx, px, tint(it.color, 0.4));
    rr(ctx, -w / 2, -d / 2, w, 7, 2);
    fs(ctx, px, tint(it.color, 0.15));
  },
  sillaOficina(ctx, it, px) {
    const r = Math.min(it.w, it.d) / 2;
    circ(ctx, 0, 4, r * 0.78);
    fs(ctx, px, tint(it.color, 0.4));
    rr(ctx, -r * 0.75, -it.d / 2, r * 1.5, 10, 5);
    fs(ctx, px, tint(it.color, 0.15));
  },
  mesa(ctx, it, px) {
    body(ctx, it, px, 0.45);
    rr(ctx, -it.w / 2 + 4, -it.d / 2 + 4, it.w - 8, it.d - 8, 1);
    ctx.lineWidth = 0.6 * px;
    ctx.stroke();
  },
  redonda(ctx, it, px) {
    ell(ctx, 0, 0, it.w / 2, it.d / 2);
    fs(ctx, px, tint(it.color, 0.45));
    ell(ctx, 0, 0, it.w / 2 - 4, it.d / 2 - 4);
    ctx.lineWidth = 0.6 * px;
    ctx.stroke();
  },
  mesaNoche(ctx, it, px) {
    D.mesa(ctx, it, px);
    circ(ctx, 0, 0, Math.min(it.w, it.d) * 0.2);
    fs(ctx, px, '#fff4cf', 0.8);
  },
  armario(ctx, it, px) {
    const { w, d } = it;
    body(ctx, it, px, 0.35, 1);
    frontLine(ctx, it, px, 6);
    const n = Math.max(1, Math.round(w / 60));
    for (let i = 1; i < n; i++) ln(ctx, px, -w / 2 + (w / n) * i, d / 2 - 6, -w / 2 + (w / n) * i, d / 2, 1);
    dashed(ctx, px);
    ln(ctx, px, -w / 2 + 4, -3, w / 2 - 4, -3, 0.8);
    dashed(ctx, px, false);
    for (let x = -w / 2 + 12; x < w / 2 - 6; x += 12) ln(ctx, px, x - 3, -9, x + 3, 3, 0.6);
  },
  comoda(ctx, it, px) {
    body(ctx, it, px, 0.45, 1);
    frontLine(ctx, it, px);
  },
  tv(ctx, it, px) {
    rr(ctx, -it.w / 2, -it.d / 2, it.w, it.d, 1);
    fs(ctx, px, '#3a3d44');
  },
  estanteria(ctx, it, px) {
    body(ctx, it, px, 0.4, 1);
    const n = Math.max(1, Math.round(it.w / 30));
    for (let i = 1; i < n; i++) ln(ctx, px, -it.w / 2 + (it.w / n) * i, -it.d / 2, -it.w / 2 + (it.w / n) * i, it.d / 2, 0.7);
  },
  alfombra(ctx, it, px) {
    rr(ctx, -it.w / 2, -it.d / 2, it.w, it.d, 4);
    fs(ctx, px, tint(it.color, 0.35), 0.8);
    dashed(ctx, px);
    rr(ctx, -it.w / 2 + 6, -it.d / 2 + 6, it.w - 12, it.d - 12, 2);
    ctx.lineWidth = 0.7 * px;
    ctx.stroke();
    dashed(ctx, px, false);
  },
  encimera(ctx, it, px) {
    body(ctx, it, px, 0.3, 1);
    frontLine(ctx, it, px, 4);
  },
  fregadero(ctx, it, px) {
    D.encimera(ctx, it, px);
    rr(ctx, -it.w * 0.36, -it.d * 0.28, it.w * 0.72, it.d * 0.56, 6);
    fs(ctx, px, '#dfe6ec');
    circ(ctx, 0, -it.d / 2 + 6, 2.5);
    fs(ctx, px, '#c9ced4', 0.8);
  },
  estufa(ctx, it, px) {
    body(ctx, it, px, 0.3, 1);
    const r = Math.min(it.w, it.d) * 0.13;
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        circ(ctx, (sx * it.w) / 4, (sy * it.d) / 4, r);
        fs(ctx, px, '#ffffff');
        circ(ctx, (sx * it.w) / 4, (sy * it.d) / 4, r * 0.45);
        ctx.lineWidth = 0.7 * px;
        ctx.stroke();
      }
  },
  nevera(ctx, it, px) {
    body(ctx, it, px, 0.3, 1);
    frontLine(ctx, it, px);
    if (it.w / px > 40) {
      ctx.font = `600 ${9 * px}px system-ui, sans-serif`;
      ctx.fillStyle = S;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('REF', 0, 0);
    }
  },
  lavadora(ctx, it, px) {
    body(ctx, it, px, 0.2, 2);
    circ(ctx, 0, 0, Math.min(it.w, it.d) * 0.32);
    fs(ctx, px, '#dfe6ec');
  },
  alacena(ctx, it, px) {
    const { w, d } = it;
    dashed(ctx, px);
    rr(ctx, -w / 2, -d / 2, w, d, 0);
    ctx.lineWidth = 1 * px;
    ctx.strokeStyle = S;
    ctx.stroke();
    ln(ctx, px, -w / 2, -d / 2, w / 2, d / 2, 0.6);
    ln(ctx, px, w / 2, -d / 2, -w / 2, d / 2, 0.6);
    dashed(ctx, px, false);
  },
  inodoro(ctx, it, px) {
    const { w, d } = it;
    const tk = Math.min(18, d * 0.3);
    rr(ctx, -w / 2, -d / 2, w, tk, 3);
    fs(ctx, px, '#ffffff');
    const cy = -d / 2 + tk + (d - tk) / 2;
    ell(ctx, 0, cy - 1, w / 2 - 2, (d - tk) / 2);
    fs(ctx, px, '#ffffff');
    ell(ctx, 0, cy + 1, w / 2 - 8, (d - tk) / 2 - 7);
    fs(ctx, px, '#eef3f6', 0.7);
  },
  lavabo(ctx, it, px) {
    body(ctx, it, px, 0.4, 2);
    ell(ctx, 0, 3, it.w * 0.32, it.d * 0.3);
    fs(ctx, px, '#ffffff');
    circ(ctx, 0, -it.d / 2 + 6, 2.5);
    fs(ctx, px, '#c9ced4', 0.8);
  },
  ducha(ctx, it, px) {
    const { w, d } = it;
    rr(ctx, -w / 2, -d / 2, w, d, 2);
    fs(ctx, px, '#eef4f8');
    ln(ctx, px, -w / 2, -d / 2, w / 2, d / 2, 0.5);
    ln(ctx, px, w / 2, -d / 2, -w / 2, d / 2, 0.5);
    circ(ctx, 0, 0, 4);
    fs(ctx, px, '#ffffff', 0.8);
  },
  banera(ctx, it, px) {
    const { w, d } = it;
    rr(ctx, -w / 2, -d / 2, w, d, 6);
    fs(ctx, px, '#ffffff');
    rr(ctx, -w / 2 + 7, -d / 2 + 7, w - 14, d - 14, Math.min(20, d / 2 - 7));
    fs(ctx, px, '#eef4f8', 0.8);
    circ(ctx, -w / 2 + 20, 0, 3);
    fs(ctx, px, '#ffffff', 0.7);
  },
  espejo(ctx, it, px) {
    rr(ctx, -it.w / 2, -it.d / 2, it.w, it.d, 0);
    fs(ctx, px, '#cfe3ee', 1);
  },
  planta(ctx, it, px) {
    const r = Math.min(it.w, it.d) / 2;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      circ(ctx, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5);
      fs(ctx, px, '#8fc27a', 0.7);
    }
    circ(ctx, 0, 0, r * 0.35);
    fs(ctx, px, '#6fa85b', 0.7);
  },
  lampara(ctx, it, px) {
    const r = Math.min(it.w, it.d) / 2;
    circ(ctx, 0, 0, r);
    fs(ctx, px, '#fff6d8');
    circ(ctx, 0, 0, r * 0.25);
    fs(ctx, px, '#f2d27a', 0.7);
    ln(ctx, px, -r, 0, r, 0, 0.5);
    ln(ctx, px, 0, -r, 0, r, 0.5);
  },
  auxiliar(ctx, it, px) {
    ell(ctx, 0, 0, it.w / 2, it.d / 2);
    fs(ctx, px, tint(it.color, 0.45));
  },
  puerta(ctx, it, px) {
    openingCut(ctx, it, px);
    const m = it.mirror ? -1 : 1;
    doorLeaf(ctx, px, (-m * it.w) / 2, it.d / 2, it.w, m);
  },
  puertaDoble(ctx, it, px) {
    openingCut(ctx, it, px);
    doorLeaf(ctx, px, -it.w / 2, it.d / 2, it.w / 2, 1);
    doorLeaf(ctx, px, it.w / 2, it.d / 2, it.w / 2, -1);
  },
  corredera(ctx, it, px) {
    // Dos hojas que se solapan en el centro, desplazadas dentro del grosor del muro.
    const { w, d } = it;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-w / 2, -d / 2 - 1.5 * px, w, d + 3 * px);
    ln(ctx, px, -w / 2, -d / 2, -w / 2, d / 2, 1.4);
    ln(ctx, px, w / 2, -d / 2, w / 2, d / 2, 1.4);
    const lt = Math.max(2, d * 0.18);
    rr(ctx, -w / 2, -d * 0.22 - lt / 2, w * 0.56, lt, 0);
    fs(ctx, px, tint(it.color, 0.2), 1);
    rr(ctx, w / 2 - w * 0.56, d * 0.22 - lt / 2, w * 0.56, lt, 0);
    fs(ctx, px, tint(it.color, 0.2), 1);
  },
  ventana(ctx, it, px) {
    const { w, d } = it;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-w / 2, -d / 2 - 1.5 * px, w, d + 3 * px);
    ctx.fillStyle = '#cfeaf6';
    ctx.fillRect(-w / 2, -d * 0.14, w, d * 0.28);
    rr(ctx, -w / 2, -d / 2, w, d, 0);
    ctx.lineWidth = 1.2 * px;
    ctx.strokeStyle = S;
    ctx.stroke();
    ln(ctx, px, -w / 2, -d * 0.14, w / 2, -d * 0.14, 0.8);
    ln(ctx, px, -w / 2, d * 0.14, w / 2, d * 0.14, 0.8);
  },
};

export const CATALOG = [
  // Dormitorio
  { type: 'cama_doble', name: 'Cama doble', cat: 'Dormitorio', w: 160, d: 200, h: 55, color: '#7d93b8', draw: D.cama, build: 'cama' },
  { type: 'cama_individual', name: 'Cama individual', cat: 'Dormitorio', w: 90, d: 190, h: 55, color: '#d98f6a', draw: D.cama, build: 'cama' },
  { type: 'mesa_noche', name: 'Mesita de noche', cat: 'Dormitorio', w: 45, d: 40, h: 50, color: '#a47b55', draw: D.mesaNoche, build: 'mesa_noche' },
  { type: 'armario', name: 'Armario', cat: 'Dormitorio', w: 120, d: 60, h: 210, color: '#e8e2d8', draw: D.armario, build: 'armario' },
  { type: 'comoda', name: 'Cómoda', cat: 'Dormitorio', w: 100, d: 45, h: 85, color: '#a47b55', draw: D.comoda, build: 'comoda' },
  // Sala
  { type: 'sofa_3', name: 'Sofá 3 plazas', cat: 'Sala', w: 210, d: 90, h: 85, color: '#6b7f94', draw: D.sofa, build: 'sofa' },
  { type: 'sofa_2', name: 'Sofá 2 plazas', cat: 'Sala', w: 150, d: 90, h: 85, color: '#6b7f94', draw: D.sofa, build: 'sofa' },
  { type: 'sillon', name: 'Sillón', cat: 'Sala', w: 85, d: 85, h: 85, color: '#b5835a', draw: D.sofa, build: 'sofa' },
  { type: 'mesa_centro', name: 'Mesa de centro', cat: 'Sala', w: 110, d: 60, h: 42, color: '#8a6446', draw: D.mesa, build: 'mesa' },
  { type: 'mueble_tv', name: 'Mueble TV', cat: 'Sala', w: 180, d: 45, h: 50, color: '#8a6446', draw: D.comoda, build: 'mueble' },
  { type: 'tv', name: 'Televisor', cat: 'Sala', w: 140, d: 10, h: 85, elev: 50, color: '#1d1f23', layer: 2, draw: D.tv, build: 'tv' },
  { type: 'estanteria', name: 'Estantería', cat: 'Sala', w: 90, d: 35, h: 190, color: '#c9a77f', draw: D.estanteria, build: 'estanteria' },
  // Comedor
  { type: 'mesa_comedor', name: 'Mesa de comedor', cat: 'Comedor', w: 160, d: 90, h: 75, color: '#a47b55', draw: D.mesa, build: 'mesa' },
  { type: 'mesa_redonda', name: 'Mesa redonda', cat: 'Comedor', w: 100, d: 100, h: 75, color: '#a47b55', draw: D.redonda, build: 'mesa_redonda' },
  { type: 'silla', name: 'Silla', cat: 'Comedor', w: 45, d: 50, h: 90, color: '#8a6446', draw: D.silla, build: 'silla' },
  // Cocina
  { type: 'encimera', name: 'Mueble bajo', cat: 'Cocina', w: 100, d: 60, h: 90, color: '#f2f0ec', draw: D.encimera, build: 'encimera' },
  { type: 'fregadero', name: 'Fregadero', cat: 'Cocina', w: 80, d: 60, h: 90, color: '#f2f0ec', draw: D.fregadero, build: 'fregadero' },
  { type: 'estufa', name: 'Estufa / cocina', cat: 'Cocina', w: 60, d: 60, h: 90, color: '#d9dbde', draw: D.estufa, build: 'estufa' },
  { type: 'nevera', name: 'Nevera', cat: 'Cocina', w: 70, d: 70, h: 180, color: '#d5d8dc', draw: D.nevera, build: 'nevera' },
  { type: 'lavadora', name: 'Lavadora', cat: 'Cocina', w: 60, d: 60, h: 85, color: '#f4f4f4', draw: D.lavadora, build: 'lavadora' },
  { type: 'isla', name: 'Isla de cocina', cat: 'Cocina', w: 160, d: 80, h: 90, color: '#f2f0ec', draw: D.encimera, build: 'encimera' },
  { type: 'alacena', name: 'Mueble alto', cat: 'Cocina', w: 100, d: 35, h: 70, elev: 145, color: '#f2f0ec', layer: 2, draw: D.alacena, build: 'alacena' },
  // Baño
  { type: 'inodoro', name: 'Inodoro', cat: 'Baño', w: 40, d: 65, h: 75, color: '#ffffff', draw: D.inodoro, build: 'inodoro' },
  { type: 'lavabo', name: 'Lavabo con mueble', cat: 'Baño', w: 60, d: 45, h: 85, color: '#8a6446', draw: D.lavabo, build: 'lavabo' },
  { type: 'ducha', name: 'Ducha', cat: 'Baño', w: 90, d: 90, h: 200, color: '#ffffff', draw: D.ducha, build: 'ducha' },
  { type: 'banera', name: 'Bañera', cat: 'Baño', w: 170, d: 75, h: 55, color: '#ffffff', draw: D.banera, build: 'banera' },
  { type: 'espejo', name: 'Espejo', cat: 'Baño', w: 60, d: 3, h: 80, elev: 110, color: '#cfe3ee', layer: 2, draw: D.espejo, build: 'espejo' },
  // Oficina
  { type: 'escritorio', name: 'Escritorio', cat: 'Oficina', w: 120, d: 60, h: 75, color: '#d8c3a5', draw: D.mesa, build: 'escritorio' },
  { type: 'silla_oficina', name: 'Silla de oficina', cat: 'Oficina', w: 60, d: 60, h: 100, color: '#3b4250', draw: D.sillaOficina, build: 'silla_oficina' },
  // Decoración
  { type: 'alfombra', name: 'Alfombra', cat: 'Decoración', w: 200, d: 140, h: 1, color: '#c4b39a', layer: 0, draw: D.alfombra, build: 'alfombra' },
  { type: 'planta', name: 'Planta', cat: 'Decoración', w: 45, d: 45, h: 110, color: '#5e9b4f', draw: D.planta, build: 'planta' },
  { type: 'lampara_pie', name: 'Lámpara de pie', cat: 'Decoración', w: 40, d: 40, h: 160, color: '#f6ecd4', draw: D.lampara, build: 'lampara_pie' },
  { type: 'mesa_auxiliar', name: 'Mesa auxiliar', cat: 'Decoración', w: 50, d: 50, h: 55, color: '#8a6446', draw: D.auxiliar, build: 'mesa_auxiliar' },
  // Aberturas
  { type: 'puerta', name: 'Puerta', cat: 'Aberturas', w: 80, d: 15, h: 210, color: '#c8a27a', opening: 'door', layer: 3, draw: D.puerta, build: 'puerta' },
  { type: 'puerta_doble', name: 'Puerta doble', cat: 'Aberturas', w: 140, d: 15, h: 210, color: '#c8a27a', opening: 'door', layer: 3, draw: D.puertaDoble, build: 'puerta_doble' },
  { type: 'puerta_corredera', name: 'Puerta corredera', cat: 'Aberturas', w: 160, d: 15, h: 210, color: '#c8a27a', opening: 'door', layer: 3, draw: D.corredera, build: 'puerta_corredera' },
  { type: 'ventana', name: 'Ventana', cat: 'Aberturas', w: 120, d: 15, h: 120, elev: 90, color: '#ffffff', opening: 'window', layer: 3, draw: D.ventana, build: 'ventana' },
  { type: 'ventanal', name: 'Ventanal', cat: 'Aberturas', w: 200, d: 15, h: 210, elev: 0, color: '#ffffff', opening: 'window', layer: 3, draw: D.ventana, build: 'ventana' },
];

const MAP = new Map(CATALOG.map((d) => [d.type, d]));
export const getDef = (type) => MAP.get(type);
export const layerOf = (it) => getDef(it.type)?.layer ?? 1;
export const drawGeneric = D.rect;
