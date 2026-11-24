// Importar un plano (imagen o PDF): calibrar la escala, detectar muros, puertas, ventanas
// y habitaciones, previsualizar el resultado y crear con él un proyecto nuevo.

import { store } from './state.js';
import { prepare, detectSegments, buildModel, deskew, autoSettings, estimateScale, normalizedCanvas } from './planDetect.js';
import { emptyProject, addWall, addRoom, addItem } from './model.js';
import * as G from './geometry.js';
import { h } from './dom.js';

const MAX_SIDE = 1600; // tamaño máximo de la imagen procesada (px)
const ROOM_COLORS = [205, 25, 140, 280, 50, 330, 170, 95];

export const PLAN_ACCEPT = 'image/*,.pdf,application/pdf';

export function isPlanFile(file) {
  return !!file && (file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(pdf|png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name));
}

/** Convierte el archivo (imagen o primera página de un PDF) en un canvas de tamaño razonable. */
async function fileToCanvas(file) {
  let src;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(6, 2400 / Math.max(v1.width, v1.height)) });
    src = document.createElement('canvas');
    src.width = Math.round(vp.width);
    src.height = Math.round(vp.height);
    await page.render({ canvas: src, viewport: vp, background: '#ffffff' }).promise;
  } else {
    const url = URL.createObjectURL(file);
    try {
      src = new Image();
      await new Promise((resolve, reject) => {
        src.onload = resolve;
        src.onerror = () => reject(new Error('imagen no válida'));
        src.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  if (!sw || !sh) throw new Error('imagen vacía');
  // Las imágenes pequeñas se amplían un poco para que los muros tengan varios píxeles de grosor.
  const s = Math.min(MAX_SIDE / Math.max(sw, sh), Math.max(1, 1000 / Math.max(sw, sh)));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * s));
  c.height = Math.max(1, Math.round(sh * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Convierte el resultado de la detección (px) en un proyecto (cm). */
function toProject(model, { cmPerPx, name, W, H, bgAsset }) {
  const p = emptyProject();
  p.name = name;
  const s = cmPerPx;
  let minX = Infinity;
  let minY = Infinity;
  for (const w of model.walls) {
    if (w.o === 'd') {
      minX = Math.min(minX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2);
      continue;
    }
    minX = Math.min(minX, w.o === 'h' ? w.a : w.c);
    minY = Math.min(minY, w.o === 'h' ? w.c : w.a);
  }
  if (minX === Infinity) minX = minY = 0;
  const X = (v) => Math.round((v - minX) * s);
  const Y = (v) => Math.round((v - minY) * s);
  const thick = (t) => G.clamp(Math.round((t * s) / 5) * 5, 5, 60);
  const ts = model.walls.map((w) => thick(w.t)).sort((a, b) => a - b);
  if (ts.length) p.settings.wallThickness = ts[Math.floor(ts.length / 2)];

  for (const w of model.walls) {
    let a;
    let b;
    if (w.o === 'd') {
      a = { x: X(w.x1), y: Y(w.y1) };
      b = { x: X(w.x2), y: Y(w.y2) };
    } else {
      a = w.o === 'h' ? { x: X(w.a), y: Y(w.c) } : { x: X(w.c), y: Y(w.a) };
      b = w.o === 'h' ? { x: X(w.b), y: Y(w.c) } : { x: X(w.c), y: Y(w.b) };
    }
    addWall(p, a, b, { thickness: thick(w.t), force: true });
  }
  for (const op of model.openings) {
    const mid = (op.a + op.b) / 2;
    const x = op.o === 'h' ? X(mid) : X(op.c);
    const y = op.o === 'h' ? Y(op.c) : Y(mid);
    const width = Math.max(30, Math.round(((op.b - op.a) * s) / 5) * 5);
    const d = thick(op.t);
    if (op.kind === 'window' || op.kind === 'sliding') {
      addItem(p, op.kind === 'window' ? 'ventana' : 'puerta_corredera', x, y, op.o === 'h' ? 0 : 90, { w: width, d });
      continue;
    }
    // Rotación para que la puerta abra hacia el lado detectado: rotate((0,1), θ) = (-sin θ, cos θ).
    const sv = op.o === 'h' ? { x: 0, y: op.side } : { x: op.side, y: 0 };
    const rot = sv.y === 1 ? 0 : sv.y === -1 ? 180 : sv.x === 1 ? 270 : 90;
    const hinge = op.o === 'h' ? { x: op.hingeAtStart ? -1 : 1, y: 0 } : { x: 0, y: op.hingeAtStart ? -1 : 1 };
    const r = G.toRad(rot);
    const localMinusX = { x: -Math.cos(r), y: -Math.sin(r) };
    const mirror = hinge.x * localMinusX.x + hinge.y * localMinusX.y < 0;
    addItem(p, width >= 130 ? 'puerta_doble' : 'puerta', x, y, rot, { w: width, d, mirror });
  }
  model.rooms.forEach((r, i) => {
    addRoom(p, `Espacio ${i + 1}`, r.points.map((q) => ({ x: X(q.x), y: Y(q.y) })), 'madera', false);
  });
  if (bgAsset) p.background = { asset: bgAsset, x: -minX * s, y: -minY * s, w: W * s, h: H * s, opacity: 0.45, visible: true };
  return p;
}

export async function openPlanImport(file) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const status = h('div', { class: 'modal-loading' }, 'Cargando plano…');
  backdrop.append(status);
  document.body.append(backdrop);
  let st = null;
  const close = () => {
    backdrop.remove();
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (st?.mode === 'calibrate') return setMode('pan');
      close();
    }
  };
  window.addEventListener('keydown', onKey, true);

  let img;
  let prep;
  let angle = 0;
  try {
    ({ canvas: img, angle } = deskew(await fileToCanvas(file)));
    prep = prepare(img);
  } catch (err) {
    console.error(err);
    close();
    alert('No se pudo leer el archivo. Usa una imagen (PNG, JPG, WEBP…) o un PDF.');
    return;
  }
  const { W, H } = prep;
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'Plano importado';

  st = {
    threshold: prep.threshold,
    minThickness: Math.max(3, Math.round(prep.Tmin * 0.6)),
    hollow: false,
    gapSize: 12,
    openings: true,
    rooms: true,
    keepBg: true,
    showDetection: true,
    cal: null, // { a, b } en px de la imagen
    calMeters: '',
    mode: 'pan',
    view: { s: 1, ox: 0, oy: 0 },
    s1: null,
    s1Key: '',
    model: null,
    mouse: null,
  };

  // ------------------------------------------------------------------ Interfaz
  const canvas = h('canvas', { class: 'pi-canvas' });
  const stage = h('div', { class: 'pi-stage' }, canvas, h('div', { class: 'pi-stage-hint' }, 'Rueda: zoom · Arrastrar: mover'));
  const scaleInfo = h('p', { class: 'pi-info' });
  const resultInfo = h('div', { class: 'pi-result' });
  const metersInput = h('input', { type: 'number', min: '0.1', step: '0.01', placeholder: 'p. ej. 3.50' });
  const calBtn = h('button', { class: 'btn', onclick: () => setMode(st.mode === 'calibrate' ? 'pan' : 'calibrate') }, 'Marcar medida en el plano');
  const nameInput = h('input', { type: 'text', value: baseName });

  const slider = (label, key, min, max, fmt = (v) => v) => {
    const val = h('span', { class: 'pi-val' }, fmt(st[key]));
    const input = h('input', { type: 'range', min, max, value: st[key] });
    input.addEventListener('input', () => {
      st[key] = +input.value;
      val.textContent = fmt(st[key]);
      scheduleDetect();
    });
    return h('label', { class: 'pi-slider' }, h('span', { class: 'pi-slider-head' }, h('span', {}, label), val), input);
  };
  const checkbox = (label, key, onChange) => {
    const input = h('input', { type: 'checkbox', checked: st[key] });
    input.addEventListener('change', () => {
      st[key] = input.checked;
      onChange?.();
    });
    return h('label', { class: 'check' }, input, h('span', {}, label));
  };
  const gapSlider = slider('Separación entre líneas', 'gapSize', 3, 60, (v) => v + ' px');
  gapSlider.hidden = !st.hollow;
  const thickSlider = slider('Grosor mínimo de muro', 'minThickness', 2, 40, (v) => v + ' px');
  const setThickness = (v) => {
    st.minThickness = v;
    thickSlider.querySelector('input').value = v;
    thickSlider.querySelector('.pi-val').textContent = v + ' px';
  };
  const setGap = (v) => {
    st.gapSize = v;
    gapSlider.querySelector('input').value = v;
    gapSlider.querySelector('.pi-val').textContent = v + ' px';
  };
  const hollowCheck = checkbox('Muros dibujados solo con contorno', 'hollow', () => {
    st.autoHollow = false;
    gapSlider.hidden = !st.hollow;
    // Con muros huecos, los textos rellenados por el cierre se eliminan exigiendo más grosor.
    if (st.hollow) setThickness(Math.max(st.minThickness, Math.round(st.gapSize * 0.6)));
    else setThickness(Math.max(3, Math.round(prep.Tmin * 0.6)));
    scheduleDetect();
  });

  const createBtn = h('button', { class: 'btn primary', onclick: () => finish(false) }, 'Crear plantilla');
  const bgOnlyBtn = h('button', { class: 'btn', onclick: () => finish(true), title: 'Crea un proyecto vacío con el plano de fondo para dibujar encima a mano' }, 'Solo usar como fondo');

  const side = h(
    'div',
    { class: 'pi-side' },
    h('section', {}, h('h3', {}, '1 · Escala'), h('p', { class: 'hint' }, 'Marca dos puntos sobre una medida conocida (una cota, el largo de un muro…) e indica cuánto mide en la realidad.'), calBtn, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Longitud real'), h('span', { class: 'field-input' }, metersInput, h('span', { class: 'unit' }, 'm'))), scaleInfo),
    h(
      'section',
      {},
      h('h3', {}, '2 · Detección'),
      slider('Umbral de oscuridad', 'threshold', 30, 240),
      thickSlider,
      hollowCheck,
      gapSlider,
      checkbox('Detectar puertas y ventanas', 'openings', () => runModel()),
      checkbox('Detectar habitaciones', 'rooms', () => runModel()),
      checkbox('Ver la detección sobre el plano', 'showDetection', () => draw()),
      resultInfo,
    ),
    h('section', {}, h('h3', {}, '3 · Proyecto'), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nombre'), h('span', { class: 'field-input' }, nameInput)), checkbox('Conservar el plano como fondo para calcar', 'keepBg'), h('p', { class: 'hint' }, 'Después podrás corregir, mover o borrar cualquier muro, puerta o habitación en el editor.')),
  );

  const modal = h(
    'div',
    { class: 'modal plan-import', role: 'dialog', 'aria-label': 'Importar plano' },
    h('header', { class: 'modal-head' }, h('div', {}, h('h2', {}, 'Importar plano'), h('span', { class: 'pi-file' }, `${file.name} · ${W} × ${H} px${angle ? ` · enderezado ${Math.abs(angle).toFixed(1).replace('.', ',')}°` : ''}`)), h('button', { class: 'btn icon', title: 'Cerrar (Esc)', onclick: close }, '✕')),
    h('div', { class: 'modal-body' }, stage, side),
    h('footer', { class: 'modal-foot' }, h('span', { class: 'legend' }, h('i', { class: 'lg wall' }), 'Muros', h('i', { class: 'lg door' }), 'Puertas', h('i', { class: 'lg sliding' }), 'Correderas', h('i', { class: 'lg window' }), 'Ventanas', h('i', { class: 'lg room' }), 'Habitaciones'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: close }, 'Cancelar'), bgOnlyBtn, createBtn),
  );
  status.remove();
  backdrop.append(modal);

  // ------------------------------------------------------------------ Escala
  const cmPerPx = () => {
    const m = parseFloat(String(st.calMeters).replace(',', '.'));
    if (st.cal && m > 0) {
      const d = G.dist(st.cal.a, st.cal.b);
      if (d > 2) return { v: (m * 100) / d, calibrated: true };
    }
    // Sin calibrar: se estima por el grosor de los muros (refinado con los muros ya limpios).
    if (st.refined) return { v: st.refined, calibrated: false };
    return { ...estimateScale(prep, st.s1), calibrated: false };
  };
  metersInput.addEventListener('input', () => {
    st.calMeters = metersInput.value;
    runModel();
  });
  const updateScaleInfo = () => {
    const { v, calibrated, unknown } = cmPerPx();
    const size = `${((W * v) / 100).toFixed(1).replace('.', ',')} × ${((H * v) / 100).toFixed(1).replace('.', ',')} m`;
    scaleInfo.textContent = calibrated
      ? `Escala: 1 px = ${v.toFixed(2).replace('.', ',')} cm · Imagen ≈ ${size}`
      : unknown
        ? `Escala desconocida: se supone que la imagen mide ≈ ${size}. Marca una medida conocida.`
        : `Escala estimada a partir del grosor de los muros · Imagen ≈ ${size}. Marca una medida para más precisión.`;
    scaleInfo.classList.toggle('warn', !calibrated);
  };
  function setMode(m) {
    st.mode = m;
    calBtn.classList.toggle('active', m === 'calibrate');
    calBtn.textContent = m === 'calibrate' ? (st.cal?.pending ? 'Haz clic en el segundo punto…' : 'Haz clic en el primer punto…') : st.cal ? 'Volver a marcar la medida' : 'Marcar medida en el plano';
    canvas.style.cursor = m === 'calibrate' ? 'crosshair' : 'grab';
    draw();
  }

  // ------------------------------------------------------------------ Detección
  let detectTimer = null;
  function scheduleDetect() {
    clearTimeout(detectTimer);
    resultInfo.textContent = 'Analizando…';
    detectTimer = setTimeout(runDetect, 120);
  }
  function runDetect() {
    const key = [st.threshold, st.minThickness, st.hollow, st.gapSize].join('|');
    if (key !== st.s1Key) {
      st.s1 = detectSegments(prep, st);
      st.s1Key = key;
      st.refined = null;
    }
    runModel();
  }
  /**
   * Primer análisis. Si no aparecen muros, se prueba el estilo CAD (muros dibujados como dos
   * líneas) con varias separaciones y se elige el que encuentra más habitaciones y muros.
   */
  function initialDetect() {
    const auto = autoSettings(prep);
    if (auto.hollow) {
      st.hollow = true;
      st.autoHollow = true;
      hollowCheck.querySelector('input').checked = true;
      gapSlider.hidden = false;
      setGap(auto.gapSize);
    }
    setThickness(auto.minThickness);
    runDetect();
  }
  function runModel() {
    if (!st.s1) return;
    const build = (v, approximate) => buildModel(st.s1, { cmPerPx: v, approximate, openings: st.openings, rooms: st.rooms, hollow: st.hollow });
    const scale = cmPerPx();
    st.model = build(scale.v, !scale.calibrated);
    // Sin calibrar, la escala se recalcula con los muros ya limpios (sin marcos ni manchas).
    if (!scale.calibrated && !scale.unknown && !st.refined && st.model.walls.length) {
      st.refined = estimateScale(prep, st.s1, st.model).v;
      if (Math.abs(st.refined / scale.v - 1) > 0.05) st.model = build(st.refined, true);
    }
    const m = st.model;
    const doors = m.openings.filter((o) => o.kind === 'door' || o.kind === 'sliding').length;
    const sliding = m.openings.filter((o) => o.kind === 'sliding').length;
    const n = (k, s, p) => `${k} ${k === 1 ? s : p}`;
    resultInfo.replaceChildren(
      h('strong', {}, 'Detectado: '),
      `${n(m.walls.length, 'muro', 'muros')} · ${n(doors, 'puerta', 'puertas')}${sliding ? ` (${sliding} corredera${sliding > 1 ? 's' : ''})` : ''} · ${n(m.openings.length - doors, 'ventana', 'ventanas')} · ${n(m.rooms.length, 'habitación', 'habitaciones')}`,
    );
    if (!m.walls.length) resultInfo.append(h('div', { class: 'warn' }, 'No se encontraron muros: prueba a bajar el grosor mínimo, subir el umbral o activar «Muros dibujados solo con contorno».'));
    if (st.autoHollow) resultInfo.append(h('div', { class: 'note' }, 'Los muros están dibujados con contorno: se activó esa opción automáticamente.'));
    // Fotos, imágenes muy oscuras o con mucho ruido: la detección no es fiable.
    if (st.s1.darkRatio === undefined) {
      let n = 0;
      for (let i = 0; i < st.s1.D.length; i++) n += st.s1.D[i];
      st.s1.darkRatio = n / st.s1.D.length;
    }
    if (st.s1.darkRatio > 0.3 || m.walls.length > 120)
      resultInfo.append(h('div', { class: 'warn' }, 'Esta imagen no parece un plano limpio (demasiada tinta o ruido). Ajusta el umbral o usa «Solo usar como fondo» y dibuja encima.'));
    createBtn.disabled = !m.walls.length;
    updateScaleInfo();
    draw();
  }

  // ------------------------------------------------------------------ Vista previa
  const ctx = canvas.getContext('2d');
  let cw = 1;
  let ch = 1;
  const fitView = () => {
    const s = Math.min((cw - 40) / W, (ch - 40) / H);
    st.view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
  };
  const resize = () => {
    const r = stage.getBoundingClientRect();
    const first = cw <= 1;
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    if (first) fitView();
    draw();
  };
  const toImg = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - st.view.ox) / st.view.s, y: (e.clientY - r.top - st.view.oy) / st.view.s };
  };

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const { s, ox, oy } = st.view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e9ecf1';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0);
    const px = 1 / s;
    const m = st.model;
    if (m && st.showDetection) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, 0, W, H);
      m.rooms.forEach((r, i) => {
        ctx.beginPath();
        r.points.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.fillStyle = `hsla(${ROOM_COLORS[i % ROOM_COLORS.length]}, 75%, 55%, 0.22)`;
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(220, 38, 38, 0.75)';
      for (const w of m.walls) {
        if (w.o === 'd') {
          ctx.strokeStyle = 'rgba(220, 38, 38, 0.75)';
          ctx.lineWidth = w.t;
          ctx.beginPath();
          ctx.moveTo(w.x1, w.y1);
          ctx.lineTo(w.x2, w.y2);
          ctx.stroke();
        } else if (w.o === 'h') ctx.fillRect(w.a, w.c - w.t / 2, w.b - w.a, w.t);
        else ctx.fillRect(w.c - w.t / 2, w.a, w.t, w.b - w.a);
      }
      for (const o of m.openings) {
        ctx.fillStyle = o.kind === 'window' ? 'rgba(14, 165, 233, 0.9)' : o.kind === 'sliding' ? 'rgba(217, 70, 239, 0.9)' : 'rgba(22, 163, 74, 0.9)';
        const t = o.t * 1.3;
        if (o.o === 'h') ctx.fillRect(o.a, o.c - t / 2, o.b - o.a, t);
        else ctx.fillRect(o.c - t / 2, o.a, t, o.b - o.a);
      }
      const { v } = cmPerPx();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${12 * px}px Inter, system-ui, sans-serif`;
      m.rooms.forEach((r) => {
        const c = G.polygonCentroid(r.points);
        const txt = G.fmtArea(G.polygonArea(r.points) * v * v);
        ctx.lineWidth = 3 * px;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(txt, c.x, c.y);
        ctx.fillStyle = '#1f2430';
        ctx.fillText(txt, c.x, c.y);
      });
    }
    // Línea de calibración
    const cal = st.cal;
    if (cal) {
      const b = cal.pending ? st.mouse || cal.a : cal.b;
      ctx.strokeStyle = '#d946ef';
      ctx.lineWidth = 2.5 * px;
      ctx.beginPath();
      ctx.moveTo(cal.a.x, cal.a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      for (const q of [cal.a, b]) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 4 * px, 0, Math.PI * 2);
        ctx.fillStyle = '#d946ef';
        ctx.fill();
      }
      if (!cal.pending && st.calMeters) {
        ctx.font = `600 ${12 * px}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = '#d946ef';
        ctx.textAlign = 'center';
        ctx.fillText(`${st.calMeters} m`, (cal.a.x + b.x) / 2, (cal.a.y + b.y) / 2 - 10 * px);
      }
    }
  }

  // Interacción: zoom, desplazamiento y calibración.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const p = toImg(e);
      const s = G.clamp(st.view.s * Math.exp(-e.deltaY * 0.0015), 0.05, 20);
      st.view = { s, ox: sx - p.x * s, oy: sy - p.y * s };
      draw();
    },
    { passive: false },
  );
  let pan = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (st.mode === 'calibrate' && e.button === 0) {
      const p = toImg(e);
      if (!st.cal || !st.cal.pending) st.cal = { a: p, b: p, pending: true };
      else {
        st.cal = { a: st.cal.a, b: p };
        setMode('pan');
        metersInput.focus();
        metersInput.select();
        runModel();
        return;
      }
      setMode('calibrate');
      return;
    }
    pan = { x: e.clientX, y: e.clientY, ox: st.view.ox, oy: st.view.oy };
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pan) {
      st.view.ox = pan.ox + e.clientX - pan.x;
      st.view.oy = pan.oy + e.clientY - pan.y;
      draw();
    } else if (st.mode === 'calibrate' && st.cal?.pending) {
      st.mouse = toImg(e);
      draw();
    }
  });
  canvas.addEventListener('pointerup', () => {
    pan = null;
    canvas.style.cursor = st.mode === 'calibrate' ? 'crosshair' : 'grab';
  });
  new ResizeObserver(resize).observe(stage);

  // ------------------------------------------------------------------ Crear
  function finish(backgroundOnly) {
    const { v, calibrated } = cmPerPx();
    if (!calibrated && !confirm('No has marcado ninguna medida, así que la escala será aproximada.\n¿Continuar de todos modos?')) return;
    const name = nameInput.value.trim() || baseName;
    const keepBg = backgroundOnly || st.keepBg;
    // Un cianotipo se guarda invertido, para que como fondo se vea como un plano normal.
    const bgAsset = keepBg ? store.addAsset((prep.inverted ? normalizedCanvas(prep) : img).toDataURL('image/jpeg', 0.85)) : null;
    let project;
    if (backgroundOnly) {
      project = emptyProject();
      project.name = name;
      project.background = { asset: bgAsset, x: 0, y: 0, w: W * v, h: H * v, opacity: 0.6, visible: true };
    } else project = toProject(st.model, { cmPerPx: v, name, W, H, bgAsset });
    close();
    store.load(project, { keepHistory: true });
  }

  setMode('pan');
  updateScaleInfo();
  requestAnimationFrame(() => {
    resize();
    initialDetect();
  });
}
