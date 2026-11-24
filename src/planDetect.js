// Detección automática de muros, puertas, ventanas y habitaciones en la imagen de un plano.
//
// Funciona con planos ortogonales (muros horizontales y verticales), que son la gran mayoría:
//  1. Se binariza la imagen (píxeles oscuros = tinta).
//  2. Una "apertura" morfológica borra los trazos finos (textos, cotas, muebles) y deja los muros gruesos.
//  3. Se buscan tramos largos horizontales y verticales y se agrupan en segmentos de muro.
//  4. Se alinean, se unen las esquinas y los huecos del tamaño de una puerta se convierten en aberturas
//     (puerta o ventana según lo que haya dibujado dentro del hueco).
//  5. Las habitaciones son las zonas cerradas por los muros (se calculan sobre una rejilla de los ejes).
//
// Todas las coordenadas que devuelve este módulo están en píxeles de la imagen procesada.
// Un segmento es { o: 'h' | 'v', a, b, c, t }: orientación, inicio y fin a lo largo del muro,
// coordenada del eje (y para horizontales, x para verticales) y grosor.

function grayOf(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const gray = new Uint8Array(W * H);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    const a = data[i + 3] / 255;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[j] = Math.round(lum * a + 255 * (1 - a));
  }
  // Planos en negativo (cianotipos, líneas claras sobre fondo oscuro): se invierten los tonos
  // para que la tinta siempre sea lo oscuro.
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  let mode = 255;
  for (let v = 0; v < 256; v++) if (hist[v] > hist[mode]) mode = v;
  const inverted = mode < 110;
  if (inverted) for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
  return { gray, inverted };
}

/**
 * Imagen en grises con la tinta oscura y el papel blanco, a partir de los tonos ya analizados.
 * Sirve para mostrar un cianotipo (líneas claras sobre fondo de color) como un plano normal.
 */
export function normalizedCanvas(prep) {
  const { gray, W, H, paper } = prep;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const g = out.getContext('2d');
  const img = g.createImageData(W, H);
  const k = 255 / Math.max(1, paper);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    const v = Math.min(255, Math.round(gray[i] * k));
    img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
    img.data[j + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

/**
 * prep: { gray, W, H, threshold, T, Tmin }
 *  T    = grosor de muro dominante (px)
 *  Tmin = grosor del muro más fino que aparece con frecuencia (p. ej. tabiques interiores)
 */
export function prepare(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const { gray, inverted } = grayOf(canvas);
  const threshold = Math.max(60, Math.min(200, otsu(gray)));
  const { T, Tmin } = thicknessPeaks(binarize(gray, threshold), W, H);
  // Color del papel (el tono más frecuente): los trazos finos y claros, como los arcos de las
  // puertas en un escaneado, se buscan con un umbral relativo a él.
  const hist = new Uint32Array(256);
  for (const v of gray) hist[v]++;
  let paper = 255;
  for (let v = 0; v < 256; v++) if (hist[v] > hist[paper]) paper = v;
  const inkThr = Math.max(threshold, paper - 45);
  return { gray, W, H, threshold, T, Tmin, inkThr, inverted, paper };
}

/**
 * Endereza planos escaneados o fotografiados un poco torcidos (hasta ±12°).
 * Busca el ángulo en el que la tinta se concentra en filas y columnas (los muros alineados).
 * Devuelve { canvas, angle } con el canvas ya girado (o el original si no hace falta).
 */
export function deskew(canvas) {
  const W = canvas.width;
  const H = canvas.height;
  const { gray, inverted } = grayOf(canvas);
  const thr = Math.max(60, Math.min(200, otsu(gray)));
  // Muestra de puntos oscuros (hasta ~80 000) para que sea rápido.
  let dark = 0;
  for (let i = 0; i < gray.length; i++) if (gray[i] <= thr) dark++;
  if (dark < 50) return { canvas, angle: 0 };
  const step = Math.max(1, Math.floor(dark / 80000));
  const xs = [];
  const ys = [];
  for (let i = 0, k = 0; i < gray.length; i++) {
    if (gray[i] > thr) continue;
    if (k++ % step) continue;
    xs.push(i % W);
    ys.push(Math.floor(i / W));
  }
  const diag = Math.ceil(Math.hypot(W, H));
  const hr = new Float64Array(diag * 2 + 4);
  const hc = new Float64Array(diag * 2 + 4);
  const score = (deg) => {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    hr.fill(0);
    hc.fill(0);
    for (let i = 0; i < xs.length; i++) {
      hr[Math.round(ys[i] * c - xs[i] * s) + diag]++;
      hc[Math.round(xs[i] * c + ys[i] * s) + diag]++;
    }
    let sum = 0;
    for (let i = 0; i < hr.length; i++) sum += hr[i] * hr[i] + hc[i] * hc[i];
    return sum;
  };
  let best = 0;
  let bestScore = score(0);
  const base = bestScore;
  for (let a = -12; a <= 12; a += 0.5) {
    const sc = score(a);
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  }
  for (let a = best - 0.5; a <= best + 0.5; a += 0.05) {
    const sc = score(a);
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  }
  // Solo se gira si merece la pena (ángulo apreciable y mejora clara de alineación).
  if (Math.abs(best) < 0.15 || bestScore < base * 1.05) return { canvas, angle: 0 };
  const t = (best * Math.PI) / 180;
  const nw = Math.ceil(W * Math.abs(Math.cos(t)) + H * Math.abs(Math.sin(t)));
  const nh = Math.ceil(W * Math.abs(Math.sin(t)) + H * Math.abs(Math.cos(t)));
  const out = document.createElement('canvas');
  out.width = nw;
  out.height = nh;
  const g = out.getContext('2d', { willReadFrequently: true });
  // Las esquinas que quedan al girar se rellenan con el color del papel.
  const [r, gg, b] = canvas.getContext('2d').getImageData(2, 2, 1, 1).data;
  g.fillStyle = inverted ? `rgb(${r},${gg},${b})` : '#ffffff';
  g.fillRect(0, 0, nw, nh);
  g.translate(nw / 2, nh / 2);
  g.rotate(-t);
  g.drawImage(canvas, -W / 2, -H / 2);
  return { canvas: out, angle: best };
}

/** Umbral automático de Otsu. */
export function otsu(gray) {
  const hist = new Float64Array(256);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

function binarize(gray, thr) {
  const m = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) m[i] = gray[i] <= thr ? 1 : 0;
  return m;
}

/** Erosión (erode = true) o dilatación con un cuadrado de lado 2r+1, en O(n). */
function morph(src, W, H, r, erode) {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let cnt = 0;
    for (let x = 0; x <= Math.min(r, W - 1); x++) cnt += src[row + x];
    for (let x = 0; x < W; x++) {
      const full = Math.min(x + r, W - 1) - Math.max(x - r, 0) + 1;
      tmp[row + x] = erode ? (cnt === full ? 1 : 0) : cnt > 0 ? 1 : 0;
      if (x - r >= 0) cnt -= src[row + x - r];
      if (x + r + 1 < W) cnt += src[row + x + r + 1];
    }
  }
  for (let x = 0; x < W; x++) {
    let cnt = 0;
    for (let y = 0; y <= Math.min(r, H - 1); y++) cnt += tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      const full = Math.min(y + r, H - 1) - Math.max(y - r, 0) + 1;
      out[y * W + x] = erode ? (cnt === full ? 1 : 0) : cnt > 0 ? 1 : 0;
      if (y - r >= 0) cnt -= tmp[(y - r) * W + x];
      if (y + r + 1 < H) cnt += tmp[(y + r + 1) * W + x];
    }
  }
  return out;
}

/** Grosor de trazo más representativo de los muros (en px). */
export function estimateThickness(mask, W, H) {
  return thicknessPeaks(mask, W, H).T;
}

/** Grosor dominante (T) y el más fino que también es frecuente (Tmin), a partir del histograma de trazos. */
function thicknessPeaks(mask, W, H) {
  const hr = new Uint16Array(W * H);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!mask[y * W + x]) {
        x++;
        continue;
      }
      const s = x;
      while (x < W && mask[y * W + x]) x++;
      hr.fill(Math.min(x - s, 65535), y * W + s, y * W + x);
    }
  }
  const hist = new Float64Array(256);
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!mask[y * W + x]) {
        y++;
        continue;
      }
      const s = y;
      while (y < H && mask[y * W + x]) y++;
      const len = y - s;
      for (let k = s; k < y; k++) hist[Math.min(255, Math.min(len, hr[k * W + x]))]++;
    }
  }
  const sc = new Float64Array(83);
  let best = 0;
  let T = 6;
  for (let w = 3; w <= 80; w++) {
    sc[w] = (hist[w - 1] + hist[w] + hist[w + 1]) * Math.sqrt(w);
    if (sc[w] > best) {
      best = sc[w];
      T = w;
    }
  }
  // Muros más finos (tabiques): un pico local relevante por debajo del dominante, pero
  // claramente más grueso que el texto (≥ 30 % del dominante).
  let Tmin = T;
  for (let w = Math.max(4, Math.ceil(T * 0.3)); w < T; w++) {
    if (sc[w] >= sc[w - 1] && sc[w] >= sc[w + 1] && sc[w] >= best * 0.08) {
      Tmin = w;
      break;
    }
  }
  return { T, Tmin };
}

/** Píxeles que forman parte de tramos largos en una dirección. */
function longRuns(M, W, H, minLen, horizontal) {
  const L = new Uint8Array(W * H);
  if (horizontal) {
    for (let y = 0; y < H; y++) {
      let x = 0;
      while (x < W) {
        if (!M[y * W + x]) {
          x++;
          continue;
        }
        const s = x;
        while (x < W && M[y * W + x]) x++;
        if (x - s >= minLen) L.fill(1, y * W + s, y * W + x);
      }
    }
  } else {
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        if (!M[y * W + x]) {
          y++;
          continue;
        }
        const s = y;
        while (y < H && M[y * W + x]) y++;
        if (y - s >= minLen) for (let k = s; k < y; k++) L[k * W + x] = 1;
      }
    }
  }
  return L;
}

/** Componentes conexas de una máscara convertidas en segmentos. */
function segmentsOf(L, W, H, horizontal) {
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const out = [];
  for (let i = 0; i < L.length; i++) {
    if (!L[i] || seen[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    seen[i] = 1;
    let minX = W;
    let maxX = 0;
    let minY = H;
    let maxY = 0;
    let n = 0;
    let sumC = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      n++;
      sumC += horizontal ? y : x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && L[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (stack[sp++] = p - 1);
      if (x < W - 1 && L[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (stack[sp++] = p + 1);
      if (y > 0 && L[p - W] && !seen[p - W]) (seen[p - W] = 1), (stack[sp++] = p - W);
      if (y < H - 1 && L[p + W] && !seen[p + W]) (seen[p + W] = 1), (stack[sp++] = p + W);
    }
    if (horizontal) out.push({ o: 'h', a: minX, b: maxX + 1, c: sumC / n + 0.5, t: n / (maxX - minX + 1) });
    else out.push({ o: 'v', a: minY, b: maxY + 1, c: sumC / n + 0.5, t: n / (maxY - minY + 1) });
  }
  return out;
}

/**
 * Etapa 1 (costosa): máscara de muros y segmentos en bruto.
 * opts: { threshold, minThickness, hollow, gapSize }
 */
export function detectSegments(prep, opts) {
  const { gray, W, H } = prep;
  const D = binarize(gray, opts.threshold);
  let M = D;
  // Muros dibujados como dos líneas paralelas: se rellenan con un "cierre" morfológico.
  if (opts.hollow) {
    const r = Math.max(1, Math.round(opts.gapSize / 2));
    M = morph(morph(M, W, H, r, false), W, H, r, true);
  }
  // Apertura: elimina todo lo más fino que el grosor mínimo de muro.
  const r = Math.max(1, Math.floor((opts.minThickness - 1) / 2));
  M = morph(morph(M, W, H, r, true), W, H, r, false);

  // Un tramo debe ser bastante más largo que el grosor real de los muros; si no, los muros
  // verticales se colarían en la máscara horizontal (y al revés) y lo unirían todo.
  const wallT = estimateThickness(M, W, H);
  const minLen = Math.max(8, opts.minThickness * 1.6, wallT * 1.5);
  const raw = [...segmentsOf(longRuns(M, W, H, minLen, true), W, H, true), ...segmentsOf(longRuns(M, W, H, minLen, false), W, H, false)];
  const segs = raw.filter((s) => s.t >= opts.minThickness * 0.6 && s.b - s.a >= minLen);
  // Grosor típico: mediana ponderada por longitud (los muros son largos y dominan sobre textos y manchas).
  const byT = [...segs].sort((a, b) => a.t - b.t);
  const total = byT.reduce((s, x) => s + (x.b - x.a), 0);
  let acc = 0;
  let T = opts.minThickness;
  for (const s of byT) {
    acc += s.b - s.a;
    if (acc >= total / 2) {
      T = s.t;
      break;
    }
  }
  // Fuera manchas enormes (rellenos, logotipos): demasiado gruesas para ser muros.
  return { D, gray, inkThr: prep.inkThr ?? opts.threshold, segs: segs.filter((s) => s.t <= Math.max(T * 3, opts.minThickness * 4)), T, W, H };
}

/**
 * Escala aproximada (cm por px) cuando no se ha calibrado: se supone que el muro dominante mide
 * 15 cm, o 25 cm si hay dos grosores claramente distintos (exteriores e interiores). Sin muros,
 * se supone un plano de unos 15 m de lado.
 */
export function estimateScale(prep, s1, model = null) {
  // Con el modelo ya limpio (sin marcos ni manchas) el grosor típico es más fiable.
  const ws = model?.walls.filter((w) => w.o !== 'd') ?? [];
  if (ws.length) {
    const byT = [...ws].sort((a, b) => a.t - b.t);
    const total = byT.reduce((s, w) => s + w.b - w.a, 0);
    let acc = 0;
    for (const w of byT) {
      acc += w.b - w.a;
      if (acc >= total / 2) return { v: (prep.Tmin < prep.T * 0.75 ? 25 : 15) / w.t };
    }
  }
  if (s1?.segs.length) return { v: (prep.Tmin < prep.T * 0.75 ? 25 : 15) / s1.T };
  return { v: 1500 / Math.max(prep.W, prep.H), unknown: true };
}

/**
 * Ajustes iniciales de detección. Si con los muros rellenos no aparece nada razonable, prueba el
 * estilo CAD (muros dibujados como dos líneas) con varias separaciones y se queda con el mejor.
 */
export function autoSettings(prep) {
  const normal = { threshold: prep.threshold, minThickness: Math.max(3, Math.round(prep.Tmin * 0.6)), hollow: false, gapSize: 12 };
  // Lo que más pesa es encontrar habitaciones cerradas; muchos "muros" sin habitaciones es ruido.
  const score = (m) => m.rooms.length * 100 + Math.min(m.walls.length, 30);
  const evaluate = (o) => {
    const s1 = detectSegments(prep, o);
    if (!s1.segs.length) return null;
    // Las aberturas hacen falta para que las habitaciones queden cerradas.
    const m = buildModel(s1, { cmPerPx: estimateScale(prep, s1).v, approximate: true, openings: true, rooms: true, hollow: o.hollow });
    return buildModel(s1, { cmPerPx: estimateScale(prep, s1, m).v, approximate: true, openings: true, rooms: true, hollow: o.hollow });
  };
  const m0 = evaluate(normal);
  if (m0 && m0.walls.length >= 3 && m0.rooms.length) return normal;
  let best = null;
  for (const gap of [10, 16, 24, 32, 44]) {
    const o = { ...normal, hollow: true, gapSize: gap, minThickness: Math.max(normal.minThickness, Math.round(gap * 0.6)) };
    const m = evaluate(o);
    if (!m || m.walls.length < 3 || m.walls.length > 120) continue;
    if (!best || score(m) > best.score) best = { score: score(m), o };
  }
  return best && best.score > (m0 ? score(m0) : 0) ? best.o : normal;
}

/**
 * Etapa 2 (rápida): limpia los segmentos, detecta aberturas y habitaciones.
 * opts: { cmPerPx, openings, rooms }
 */
export function buildModel(s1, opts) {
  const { D, W, H, T } = s1;
  const px = (cm) => cm / opts.cmPerPx;
  let segs = s1.segs.map((s) => ({ ...s }));

  // 1. Alinear ejes casi iguales.
  const tol = Math.max(1.5, T * 0.5);
  for (const o of ['h', 'v']) {
    const arr = segs.filter((s) => s.o === o).sort((p, q) => p.c - q.c);
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const wsum = group.reduce((a, s) => a + (s.b - s.a), 0);
      const c = group.reduce((a, s) => a + s.c * (s.b - s.a), 0) / wsum;
      group.forEach((s) => (s.c = c));
      group = [];
    };
    for (const s of arr) {
      if (group.length && s.c - group[group.length - 1].c > tol) flush();
      group.push(s);
    }
    flush();
  }

  // 2. Unir tramos colineales; los huecos del tamaño de una puerta se guardan como aberturas.
  const openings = [];
  const merged = [];
  for (const o of ['h', 'v']) {
    const byLine = new Map();
    for (const s of segs.filter((x) => x.o === o)) {
      const k = s.c.toFixed(2);
      if (!byLine.has(k)) byLine.set(k, []);
      byLine.get(k).push(s);
    }
    for (const line of byLine.values()) {
      line.sort((p, q) => p.a - q.a);
      let cur = { ...line[0] };
      for (const nx of line.slice(1)) {
        const gap = nx.a - cur.b;
        const join = () => {
          const l1 = cur.b - cur.a;
          const l2 = nx.b - nx.a;
          cur.t = (cur.t * l1 + nx.t * l2) / (l1 + l2);
          cur.b = Math.max(cur.b, nx.b);
        };
        if (gap <= Math.max(2, T * 0.6)) join();
        // Aberturas de 35 cm (ventanas de baño) a 4 m (ventanales). Los huecos grandes sin puerta
        // ni ventana dibujada se tratan después como pasos abiertos.
        else if (opts.openings && gap >= px(opts.approximate ? 30 : 35) && gap <= px(opts.approximate ? 450 : 400)) {
          openings.push({ o, c: cur.c, a: cur.b, b: nx.a, t: (cur.t + nx.t) / 2 });
          join();
        } else {
          merged.push(cur);
          cur = { ...nx };
        }
      }
      merged.push(cur);
    }
  }
  segs = merged;

  // 3. Llevar los extremos al eje del muro perpendicular (esquinas y uniones en T).
  const hs = segs.filter((s) => s.o === 'h');
  const vs = segs.filter((s) => s.o === 'v');
  const snapEnds = (A, B) => {
    for (const s of A)
      for (const end of ['a', 'b']) {
        const v = s[end];
        let best = null;
        let bd = Infinity;
        for (const q of B) {
          const d = Math.abs(q.c - v);
          if (d <= q.t * 0.75 + T * 0.6 && s.c >= q.a - s.t && s.c <= q.b + s.t && d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best) {
          s[end] = best.c;
          s[end + 'Linked'] = true;
          union(s, best);
        }
      }
  };
  // Conjuntos de muros conectados entre sí (union-find).
  segs.forEach((s) => (s.parent = s));
  const root = (s) => (s.parent === s ? s : (s.parent = root(s.parent)));
  const union = (a, b) => (root(a).parent = root(b));
  snapEnds(hs, vs);
  snapEnds(vs, hs);
  // Textos y muebles oscuros forman grupos pequeños; los muros de verdad forman una red grande.
  const netLen = new Map();
  for (const s of segs) netLen.set(root(s), (netLen.get(root(s)) || 0) + s.b - s.a);
  let walls = segs.filter((s) => s.b - s.a >= Math.max(T * 1.2, px(20)) && netLen.get(root(s)) >= px(300));

  // Marco de la lámina: una red de pocos muros que encierra a todas las demás sin tocarlas.
  const nets = new Map();
  for (const s of walls) {
    if (!nets.has(root(s))) nets.set(root(s), []);
    nets.get(root(s)).push(s);
  }
  if (nets.size > 1) {
    const boxed = [...nets.values()].map((list) => ({ list, bb: segsBounds(list), len: list.reduce((a, s) => a + s.b - s.a, 0) }));
    for (const n of boxed) {
      const others = boxed.filter((m) => m !== n);
      const inside = others.every((m) => m.bb.minX > n.bb.minX && m.bb.maxX < n.bb.maxX && m.bb.minY > n.bb.minY && m.bb.maxY < n.bb.maxY);
      if (inside && n.list.length <= 8 && others.reduce((a, m) => a + m.len, 0) >= px(300)) walls = walls.filter((w) => !n.list.includes(w));
    }
  }
  for (const s of segs) delete s.parent;

  // Muros en diagonal (chaflanes): dos extremos libres unidos por un trazo grueso inclinado.
  walls.push(...diagonalWalls(walls, D, W, H, T, px));

  const kept = new Set(walls.filter((w) => w.o !== 'd').map((w) => w.o + w.c.toFixed(2)));
  const validOpenings = openings.filter((op) => kept.has(op.o + op.c.toFixed(2)));

  // 4. Clasificar aberturas: puerta o ventana, lado de apertura y bisagra.
  let ops = validOpenings.map((op) => ({ ...op, ...classifyOpening(op, D, s1, walls) }));
  // Los pasos abiertos vuelven a ser un hueco: el muro se corta y los espacios quedan unidos.
  for (const op of ops.filter((o) => o.kind === 'passage')) {
    const i = walls.findIndex((w) => w.o === op.o && Math.abs(w.c - op.c) < 0.5 && w.a <= op.a + 0.5 && w.b >= op.b - 0.5);
    if (i < 0) continue;
    const w = walls[i];
    walls.splice(i, 1, { ...w, b: op.a }, { ...w, a: op.b });
  }
  ops = ops.filter((o) => o.kind !== 'passage');
  if (opts.openings && opts.hollow) ops.push(...windowsInsideWalls(walls, ops, D, W, H, px));

  // 5. Habitaciones.
  const rooms = opts.rooms ? detectRooms(walls, px(100) ** 2 * 1.2, px(70)) : [];

  // 6. Una abertura con líneas entre dos habitaciones es una puerta corredera; en la fachada
  //    (un lado da al exterior) es una ventana, aunque sea corredera.
  if (rooms.length)
    for (const op of ops) {
      if (op.kind !== 'window' && op.kind !== 'sliding') continue;
      const mid = (op.a + op.b) / 2;
      const off = op.t / 2 + px(30);
      const at = (pe) => (op.o === 'h' ? { x: mid, y: pe } : { x: pe, y: mid });
      const inRoom = (p) => rooms.some((r) => pointInPoly(p, r.points));
      op.kind = inRoom(at(op.c - off)) && inRoom(at(op.c + off)) ? 'sliding' : 'window';
    }
  return { walls, openings: ops, rooms, T };
}

function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segsBounds(list) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of list) {
    const [x0, x1, y0, y1] = s.o === 'h' ? [s.a, s.b, s.c - s.t / 2, s.c + s.t / 2] : [s.c - s.t / 2, s.c + s.t / 2, s.a, s.b];
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y0);
    maxY = Math.max(maxY, y1);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Busca muros en diagonal entre extremos libres de muros (que no llegan a otro muro).
 * Se acepta si entre ambos extremos hay un trazo de tinta continuo y del grosor de un muro.
 * Devuelve segmentos { o: 'd', x1, y1, x2, y2, t }.
 */
function diagonalWalls(walls, D, W, H, T, px) {
  const ends = [];
  for (const s of walls)
    for (const end of ['a', 'b'])
      if (!s[end + 'Linked']) ends.push({ s, end, x: s.o === 'h' ? s[end] : s.c, y: s.o === 'h' ? s.c : s[end] });
  const ink = (x, y) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const xi = Math.round(x + dx);
        const yi = Math.round(y + dy);
        if (xi >= 0 && yi >= 0 && xi < W && yi < H && D[yi * W + xi]) return true;
      }
    return false;
  };
  // Cobertura de tinta de la recta P→Q: muestras en el eje y a ambos lados (el trazo debe ser
  // grueso como un muro, no una línea fina).
  const coverage = (P, Q, t) => {
    const dx = Q.x - P.x;
    const dy = Q.y - P.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = (-dy / d) * t * 0.3;
    const ny = (dx / d) * t * 0.3;
    let hits = 0;
    const N = 24;
    for (let k = 1; k < N; k++) {
      const x = P.x + (dx * k) / N;
      const y = P.y + (dy * k) / N;
      if (ink(x, y) && ink(x + nx, y + ny) && ink(x - nx, y - ny)) hits++;
    }
    return hits / (N - 1);
  };
  // Posibles puntos de arranque de la diagonal a lo largo del eje del muro: cerca de la esquina
  // el trazo diagonal "alarga" el muro, así que el arranque real puede estar algo más atrás.
  const along = (e) => {
    const span = 3 * T;
    const step = Math.max(1, Math.round(T / 8));
    const out = [];
    for (let k = 0; k <= span; k += step) {
      const v = e.end === 'b' ? e.s.b - k : e.s.a + k;
      if (v <= e.s.a || v >= e.s.b) continue;
      out.push({ v, x: e.s.o === 'h' ? v : e.s.c, y: e.s.o === 'h' ? e.s.c : v });
    }
    return out;
  };
  const cands = [];
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const p = ends[i];
      const q = ends[j];
      if (p.s === q.s || p.s.o === q.s.o) continue;
      if (Math.abs(q.x - p.x) < T || Math.abs(q.y - p.y) < T || Math.hypot(q.x - p.x, q.y - p.y) > px(450)) continue;
      const t = (p.s.t + q.s.t) / 2;
      let best = 0;
      let set = [];
      for (const P of along(p))
        for (const Q of along(q)) {
          const c = coverage(P, Q, t);
          if (c > best + 1e-9) {
            best = c;
            set = [[P, Q]];
          } else if (Math.abs(c - best) < 1e-9) set.push([P, Q]);
        }
      if (best < 0.9) continue;
      // Entre las mejores rectas (todas dentro del trazo), la central.
      const P = set[Math.floor(set.length / 2)][0];
      const Q = set[Math.floor(set.length / 2)][1];
      const avg = (k, xy) => set.reduce((a, s) => a + s[k][xy], 0) / set.length;
      cands.push({ p, q, t, P: { ...P, x: avg(0, 'x'), y: avg(0, 'y') }, Q: { ...Q, x: avg(1, 'x'), y: avg(1, 'y') }, d: Math.hypot(Q.x - P.x, Q.y - P.y) });
    }
  cands.sort((a, b) => a.d - b.d);
  const used = new Set();
  const out = [];
  for (const c of cands) {
    if (used.has(c.p) || used.has(c.q)) continue;
    used.add(c.p);
    used.add(c.q);
    // Recortar los muros hasta el arranque de la diagonal.
    for (const [e, P] of [
      [c.p, c.P],
      [c.q, c.Q],
    ]) {
      e.s[e.end] = e.s.o === 'h' ? P.x : P.y;
      e.s[e.end + 'Linked'] = true;
    }
    out.push({ o: 'd', x1: c.P.x, y1: c.P.y, x2: c.Q.x, y2: c.Q.y, t: c.t });
  }
  return out;
}

function classifyOpening(op, D, s1, walls) {
  const { gray, W, H, inkThr } = s1;
  const xy = (al, pe) => {
    const x = Math.round(op.o === 'h' ? al : pe);
    const y = Math.round(op.o === 'h' ? pe : al);
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
  };
  const get = (al, pe) => {
    const i = xy(al, pe);
    return i < 0 ? 0 : D[i];
  };
  const w = op.b - op.a;
  const half = op.t / 2;
  // Tono de referencia de una zona: el 85 % más claro (el papel o el suelo de color).
  // "Tinta" es lo que es bastante más oscuro que esa referencia: así un suelo de color
  // no se confunde con líneas dibujadas.
  const refOf = (p0, p1, a0, a1) => {
    const vals = [];
    const step = Math.max(1, Math.floor(Math.sqrt(((p1 - p0) * (a1 - a0)) / 900)));
    for (let pe = Math.round(p0); pe <= p1; pe += step)
      for (let al = Math.round(a0); al <= a1; al += step) {
        const i = xy(al, pe);
        if (i >= 0) vals.push(gray[i]);
      }
    if (!vals.length) return 255;
    vals.sort((p, q) => p - q);
    return vals[Math.floor(vals.length * 0.85)];
  };
  const gapThr = Math.min(225, refOf(op.c - half, op.c + half, op.a + 2, op.b - 2) - 40);

  // Ventana: líneas que cruzan todo el hueco a lo largo del muro. Corredera: hojas que cubren
  // solo parte del hueco, a distintas alturas. Puerta abatible: hueco vacío.
  let groups = 0;
  let partialGroups = 0;
  let prev = false;
  let prevPartial = false;
  let inked = 0;
  let rows = 0;
  for (let pe = Math.round(op.c - half); pe <= op.c + half; pe++) {
    let cnt = 0;
    let n = 0;
    for (let al = Math.ceil(op.a + 2); al < op.b - 2; al++) {
      const i = xy(al, pe);
      if (i < 0) continue;
      n++;
      if (gray[i] < gapThr) cnt++;
    }
    if (!n) continue;
    rows++;
    const f = cnt / n;
    const isLine = f > 0.6;
    const isPartial = f >= 0.3 && f <= 0.6;
    if (isLine) inked++;
    if (isLine && !prev) groups++;
    if (isPartial && !prevPartial) partialGroups++;
    prev = isLine;
    prevPartial = isPartial;
  }
  // Puerta: el lado con más tinta (hoja y arco) es hacia donde abre; la hoja marca la bisagra.
  const region = (p0, p1, a0, a1) => {
    let c = 0;
    for (let pe = Math.round(p0); pe <= p1; pe++) for (let al = Math.round(a0); al <= a1; al++) c += get(al, pe);
    return c;
  };
  const pos = region(op.c + half + 1, op.c + half + w, op.a, op.b);
  const neg = region(op.c - half - w, op.c - half - 1, op.a, op.b);
  // Buscar la hoja (recta perpendicular al muro desde la bisagra) y el arco de giro en las
  // 4 combinaciones de lado y bisagra. Cada punto se acepta si hay tinta a 1-2 px.
  const sideThr = {};
  for (const side of [1, -1]) {
    const p0 = side > 0 ? op.c + half + 1 : op.c - half - w;
    const p1 = side > 0 ? op.c + half + w : op.c - half - 1;
    sideThr[side] = Math.min(inkThr, refOf(p0, p1, op.a, op.b) - 40);
  }
  let thr = inkThr;
  const inkNear = (al, pe) => {
    for (let da = -2; da <= 2; da++)
      for (let dp = -2; dp <= 2; dp++) {
        const i = xy(al + da, pe + dp);
        if (i >= 0 && gray[i] < thr) return 1;
      }
    return 0;
  };
  let best = null;
  let bestArc = null;
  for (const side of [1, -1])
    for (const atStart of [true, false]) {
      thr = sideThr[side];
      const hAl = atStart ? op.a : op.b;
      const hPe = op.c + side * half;
      const dir = atStart ? 1 : -1;
      // Si la "hoja" coincide con un muro perpendicular, no es una puerta sino el propio muro.
      const lo = Math.min(hPe, hPe + side * w);
      const hi = Math.max(hPe, hPe + side * w);
      const onWall = walls.some((q) => q.o !== op.o && Math.abs(q.c - hAl) < q.t / 2 + 3 && Math.min(q.b, hi) - Math.max(q.a, lo) > w * 0.4);
      if (onWall) continue;
      let leaf = 0;
      let arcHits = 0;
      const N = 16;
      for (let k = 0; k < N; k++) {
        const f = 0.15 + (0.75 * k) / (N - 1);
        leaf += inkNear(hAl, hPe + side * w * f);
        const t = ((10 + (70 * k) / (N - 1)) * Math.PI) / 180;
        arcHits += inkNear(hAl + dir * w * Math.cos(t), hPe + side * w * Math.sin(t));
      }
      const score = leaf / N + arcHits / N;
      if (!best || score > best.score) best = { score, side, atStart };
      if (!bestArc || arcHits / N > bestArc.arc) bestArc = { arc: arcHits / N, side, atStart };
    }
  // Un arco de giro nítido junto al hueco es una puerta, aunque dentro haya líneas
  // (algunos planos dibujan la hoja cerrada, en el propio hueco).
  if (bestArc && bestArc.arc >= 0.8) return { kind: 'door', side: bestArc.side, hingeAtStart: bestArc.atStart };
  if (groups >= 2 || (rows && inked / rows > 0.5)) return { kind: 'window' };
  if (partialGroups >= 2 || (partialGroups >= 1 && groups === 1)) return { kind: 'sliding' };

  // Una sola línea en el hueco y ningún arco alrededor: es una ventana dibujada con una línea.
  if (groups === 1 && Math.max(pos, neg) / (w * w) < 0.015) return { kind: 'window' };

  if (best && best.score >= 0.9) return { kind: 'door', side: best.side, hingeAtStart: best.atStart };
  // Hueco vacío, sin hoja, arco ni líneas: es un paso abierto entre dos espacios.
  if (groups === 0 && (!best || best.score < 0.5)) return { kind: 'passage' };

  // Sin hoja ni arco claros: el lado con más tinta suele ser hacia donde abre.
  const side = pos >= neg ? 1 : -1;
  const p0 = side > 0 ? op.c + half + 1 : op.c - half - w;
  const p1 = side > 0 ? op.c + half + w : op.c - half - 1;
  const strip = Math.max(2, w * 0.18);
  const start = region(p0, p1, op.a - 1, op.a + strip);
  const end = region(p0, p1, op.b - strip, op.b + 1);
  return { kind: 'door', side, hingeAtStart: start >= end };
}

/**
 * Con muros dibujados como contorno, las ventanas son líneas paralelas dentro del muro
 * (el relleno automático las une al muro). Se buscan tramos con líneas largas en el interior
 * del muro: el rayado de un muro, en cambio, son trazos cortos.
 */
function windowsInsideWalls(walls, existing, D, W, H, px) {
  const out = [];
  const minLen = px(45);
  const maxLen = px(300);
  for (const w of walls) {
    if (w.o === 'd') continue;
    const L = w.b - w.a;
    const inset = Math.max(2, w.t * 0.2);
    const runs = [];
    for (let pe = Math.round(w.c - w.t / 2 + inset); pe <= w.c + w.t / 2 - inset; pe++) {
      let start = -1;
      for (let al = Math.round(w.a); al <= w.b; al++) {
        const x = w.o === 'h' ? al : pe;
        const y = w.o === 'h' ? pe : al;
        const dark = al < w.b && x >= 0 && y >= 0 && x < W && y < H && D[y * W + x];
        if (dark && start < 0) start = al;
        if (!dark && start >= 0) {
          const len = al - start;
          if (len >= minLen && len <= maxLen && len < L * 0.9) runs.push({ a: start, b: al });
          start = -1;
        }
      }
    }
    // Agrupar tramos de varias filas que coinciden: cada grupo con 2 o más líneas es una ventana.
    runs.sort((p, q) => p.a - q.a);
    const groups = [];
    for (const r of runs) {
      const g = groups.find((x) => Math.min(x.b, r.b) - Math.max(x.a, r.a) > 0.7 * Math.min(x.b - x.a, r.b - r.a));
      if (g) {
        g.list.push(r);
        g.a = Math.min(g.a, r.a);
        g.b = Math.max(g.b, r.b);
      } else groups.push({ a: r.a, b: r.b, list: [r] });
    }
    for (const g of groups) {
      if (g.list.length < 2) continue;
      const as = g.list.map((r) => r.a).sort((p, q) => p - q);
      const bs = g.list.map((r) => r.b).sort((p, q) => p - q);
      const a = as[Math.floor(as.length / 2)];
      const b = bs[Math.floor(bs.length / 2)];
      const clash = [...existing, ...out].some((o) => o.o === w.o && Math.abs(o.c - w.c) < 1 && Math.min(o.b, b) - Math.max(o.a, a) > 0);
      if (!clash) out.push({ o: w.o, c: w.c, a, b, t: w.t, kind: 'window' });
    }
  }
  return out;
}

/** Habitaciones = zonas cerradas de la rejilla formada por los ejes de los muros. */
function detectRooms(walls, minArea, minSide) {
  const uniq = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const out = [];
    for (const v of s) if (!out.length || v - out[out.length - 1] > 0.5) out.push(v);
    return out;
  };
  const hs = walls.filter((w) => w.o === 'h');
  const vs = walls.filter((w) => w.o === 'v');
  const ds = walls.filter((w) => w.o === 'd');
  let X = uniq([...vs.map((w) => w.c), ...hs.flatMap((w) => [w.a, w.b]), ...ds.flatMap((w) => [w.x1, w.x2])]);
  let Y = uniq([...hs.map((w) => w.c), ...vs.flatMap((w) => [w.a, w.b]), ...ds.flatMap((w) => [w.y1, w.y2])]);
  if (X.length < 2 || Y.length < 2) return [];
  X = [X[0] - 10, ...X, X[X.length - 1] + 10];
  Y = [Y[0] - 10, ...Y, Y[Y.length - 1] + 10];
  const nx = X.length - 1;
  const ny = Y.length - 1;
  const near = (a, b) => Math.abs(a - b) < 0.75;
  // bV[i][j]: línea vertical x = X[i] entre Y[j] e Y[j+1]; bH[i][j]: línea horizontal y = Y[j] entre X[i] y X[i+1].
  const bV = X.map((x) =>
    Y.slice(0, -1).map((y0, j) => {
      const y1 = Y[j + 1];
      return vs.some((w) => near(w.c, x) && Math.min(w.b, y1) - Math.max(w.a, y0) >= (y1 - y0) * 0.5);
    }),
  );
  const bH = Y.map((y) =>
    X.slice(0, -1).map((x0, i) => {
      const x1 = X[i + 1];
      return hs.some((w) => near(w.c, y) && Math.min(w.b, x1) - Math.max(w.a, x0) >= (x1 - x0) * 0.5);
    }),
  );
  const label = new Int32Array(nx * ny).fill(0);
  const id = (i, j) => j * nx + i;
  // Las celdas que atraviesa un muro diagonal quedan bloqueadas (no pertenecen a ningún lado).
  for (const d of ds)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) if (segmentCrossesRect(d, X[i], Y[j], X[i + 1], Y[j + 1])) label[id(i, j)] = -2;
  const flood = (si, sj, lab) => {
    const st = [[si, sj]];
    label[id(si, sj)] = lab;
    const cells = [];
    while (st.length) {
      const [i, j] = st.pop();
      cells.push([i, j]);
      const tryGo = (ni, nj, blocked) => {
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || blocked || label[id(ni, nj)]) return;
        label[id(ni, nj)] = lab;
        st.push([ni, nj]);
      };
      tryGo(i + 1, j, bV[i + 1]?.[j]);
      tryGo(i - 1, j, bV[i]?.[j]);
      tryGo(i, j + 1, bH[j + 1]?.[i]);
      tryGo(i, j - 1, bH[j]?.[i]);
    }
    return cells;
  };
  flood(0, 0, -1); // exterior
  const rooms = [];
  let lab = 1;
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (label[id(i, j)]) continue;
      const cells = flood(i, j, lab);
      const L = lab++;
      let area = 0;
      for (const [ci, cj] of cells) area += (X[ci + 1] - X[ci]) * (Y[cj + 1] - Y[cj]);
      if (area < minArea) continue;
      let poly = cellsToPolygon(cells, (ci, cj) => ci >= 0 && cj >= 0 && ci < nx && cj < ny && label[id(ci, cj)] === L, X, Y);
      if (!poly) continue;
      for (const d of ds) poly = straightenAlong(poly, d);
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      if (Math.max(...xs) - Math.min(...xs) < minSide || Math.max(...ys) - Math.min(...ys) < minSide) continue;
      rooms.push({ points: poly, area: polyArea(poly) });
    }
  return rooms.sort((a, b) => b.area - a.area);
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** ¿El segmento d atraviesa el interior del rectángulo? (recorte de Liang–Barsky) */
function segmentCrossesRect(d, x0, y0, x1, y1) {
  const e = 0.01;
  x0 += e;
  y0 += e;
  x1 -= e;
  y1 -= e;
  if (x1 <= x0 || y1 <= y0) return false;
  const dx = d.x2 - d.x1;
  const dy = d.y2 - d.y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, d.x1 - x0],
    [dx, x1 - d.x1],
    [-dy, d.y1 - y0],
    [dy, y1 - d.y1],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
    }
  }
  return t1 - t0 > 1e-6;
}

/**
 * Sustituye el "escalón" que dejan las celdas bloqueadas por el muro diagonal (de un extremo
 * a otro del muro) por la propia diagonal.
 */
function straightenAlong(poly, d) {
  const same = (p, x, y) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01;
  const i = poly.findIndex((p) => same(p, d.x1, d.y1));
  const j = poly.findIndex((p) => same(p, d.x2, d.y2));
  if (i < 0 || j < 0) return poly;
  const n = poly.length;
  const minX = Math.min(d.x1, d.x2) - 0.01;
  const maxX = Math.max(d.x1, d.x2) + 0.01;
  const minY = Math.min(d.y1, d.y2) - 0.01;
  const maxY = Math.max(d.y1, d.y2) + 0.01;
  const inBox = (p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  // Probar el camino i → j y el j → i: el que solo pasa por dentro de la caja del muro es el escalón.
  for (const [s, e] of [
    [i, j],
    [j, i],
  ]) {
    const mids = [];
    for (let k = (s + 1) % n; k !== e; k = (k + 1) % n) mids.push(k);
    if (mids.length && mids.length < n - 2 && mids.every((k) => inBox(poly[k]))) return poly.filter((_, k) => !mids.includes(k));
  }
  return poly;
}

function cellsToPolygon(cells, inside, X, Y) {
  // Aristas dirigidas del contorno (sentido horario en pantalla) indexadas por vértice de la rejilla.
  const next = new Map();
  const add = (i0, j0, i1, j1) => {
    const k = i0 + ',' + j0;
    if (!next.has(k)) next.set(k, []);
    next.get(k).push([i1, j1]);
  };
  for (const [i, j] of cells) {
    if (!inside(i, j - 1)) add(i, j, i + 1, j);
    if (!inside(i + 1, j)) add(i + 1, j, i + 1, j + 1);
    if (!inside(i, j + 1)) add(i + 1, j + 1, i, j + 1);
    if (!inside(i - 1, j)) add(i, j + 1, i, j);
  }
  let best = null;
  let bestArea = 0;
  while (next.size) {
    const startKey = next.keys().next().value;
    const loop = [];
    let k = startKey;
    for (let guard = 0; guard < 100000; guard++) {
      const list = next.get(k);
      if (!list || !list.length) break;
      const [i1, j1] = list.pop();
      if (!list.length) next.delete(k);
      const [i0, j0] = k.split(',').map(Number);
      loop.push([i0, j0]);
      k = i1 + ',' + j1;
      if (k === startKey) break;
    }
    const pts = loop.map(([i, j]) => ({ x: X[i], y: Y[j] }));
    let a = 0;
    for (let n = 0; n < pts.length; n++) {
      const p = pts[n];
      const q = pts[(n + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    if (Math.abs(a) > bestArea) {
      bestArea = Math.abs(a);
      best = pts;
    }
  }
  if (!best) return null;
  // Quitar vértices intermedios en líneas rectas.
  const out = best.filter((p, n) => {
    const a = best[(n - 1 + best.length) % best.length];
    const b = best[(n + 1) % best.length];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
  return out.length >= 3 ? out : null;
}
