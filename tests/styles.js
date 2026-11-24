// Más estilos de plano para probar la detección. Todos dibujan la misma vivienda base
// (1 px = 1 cm a escala 1) con distintos estilos gráficos:
//
//   (0,0) ──── ventana 200-350 ─────── (500) ──────────── (900,0)
//   │  A (5,0 × 4,0 m)            puerta│ C (4,0 × 7,0 m)      │ ventana
//   │                               150-235                     │ 250-400
//   ├──puerta 150-235──── (y=400) ──────┤                       │
//   │  B (5,0 × 3,0 m)                  │                       │
//   entrada 500-590                     │                       │
//   └──────────────────────────────────┴──── ventana 600-750 ──┘ (900,700)
//
// Esperado: 3 puertas, 3 ventanas, 3 habitaciones.

const E = 25;
const I = 12;

function makeCanvas(w, h, bg = '#fff') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  return { c, g };
}

/**
 * Dibuja la vivienda base.
 * o: { ox, oy, s, bg, wall, ink, floors, furniture, hollow, text, door1: 'swing' | 'sliding', chamfer, tiles, pillars, windowStyle }
 */
export function drawPlan(g, o = {}) {
  const { ox = 100, oy = 100, s = 1, bg = '#fff', wall = '#111', ink = '#222', floors = null, furniture = null, hollow = false, text = '#333', door1 = 'swing', chamfer = false, tiles = false, pillars = false, windowStyle = 'double' } = o;
  const X = (v) => ox + v * s;
  const Y = (v) => oy + v * s;
  const S = (v) => v * s;
  const rect = (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(X(x), Y(y), S(w), S(h));
  };

  // Suelos de color
  if (floors) {
    rect(0, 0, 500, 400, floors[0]);
    rect(0, 400, 500, 300, floors[1]);
    rect(500, 0, 400, 700, floors[2]);
  }
  // Baldosas: rejilla fina en B
  if (tiles) {
    g.strokeStyle = '#9a9a9a';
    g.lineWidth = 1;
    for (let x = 0; x <= 500; x += 20) {
      g.beginPath();
      g.moveTo(X(x), Y(400));
      g.lineTo(X(x), Y(700));
      g.stroke();
    }
    for (let y = 400; y <= 700; y += 20) {
      g.beginPath();
      g.moveTo(X(0), Y(y));
      g.lineTo(X(500), Y(y));
      g.stroke();
    }
  }
  // Muebles de color (no deben confundirse con muros)
  if (furniture) {
    rect(60, 250, 200, 85, furniture.sofa);
    rect(620, 380, 160, 200, furniture.bed);
    rect(640, 390, 50, 30, '#ffffff');
    rect(710, 390, 50, 30, '#ffffff');
    g.fillStyle = furniture.table;
    g.beginPath();
    g.arc(X(250), Y(560), S(50), 0, Math.PI * 2);
    g.fill();
  }

  // Muros
  const walls = [
    [0, 0, chamfer ? 800 : 900, E],
    [900 - E, chamfer ? 100 : 0, E, chamfer ? 600 : 700],
    [0, 700 - E, 900, E],
    [0, 0, E, 700],
    [500 - I / 2, 0, I, 700],
    [0, 400 - I / 2, 500, I],
  ];
  if (hollow) {
    g.save();
    g.beginPath();
    walls.forEach(([x, y, w, h]) => g.rect(X(x), Y(y), S(w), S(h)));
    g.clip();
    g.strokeStyle = ink;
    g.lineWidth = 1;
    for (let k = -3000; k < 4000; k += 6) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k + 3000, 3000);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = wall;
    g.lineWidth = 2;
    walls.forEach(([x, y, w, h]) => g.strokeRect(X(x), Y(y), S(w), S(h)));
  } else walls.forEach(([x, y, w, h]) => rect(x, y, w, h, wall));

  if (chamfer) {
    // Esquina en diagonal: muro de (800,0) a (900,100) con el mismo grosor
    g.strokeStyle = wall;
    g.lineWidth = S(E);
    g.lineCap = 'square';
    g.beginPath();
    g.moveTo(X(800), Y(E / 2));
    g.lineTo(X(900 - E / 2), Y(100));
    g.stroke();
    g.lineCap = 'butt';
  }

  // Huecos (se rellenan con el color del suelo o del fondo)
  const gap = (x, y, w, h, color = bg) => rect(x, y, w, h, color);
  const fA = floors?.[0] ?? bg;
  const fB = floors?.[1] ?? bg;
  const fC = floors?.[2] ?? bg;
  gap(500 - I / 2 - 1, 150, I + 2, 85, fC); // puerta A–C
  gap(150, 400 - I / 2 - 1, 85, I + 2, fB); // puerta A–B
  gap(-1, 500, E + 2, 90, fB); // entrada
  gap(200, -1, 150, E + 2, fA); // ventana superior
  gap(900 - E - 1, 250, E + 2, 150, fC); // ventana derecha
  gap(600, 700 - E - 1, 150, E + 2, fC); // ventana inferior

  // Ventanas
  g.strokeStyle = ink;
  g.lineWidth = Math.max(1, S(1.5));
  const winLines = (x, y, w, h) => {
    const hor = w > h;
    const fracs = windowStyle === 'double' ? [0.3, 0.7] : [0.5];
    if (windowStyle === 'frame') g.strokeRect(X(x), Y(y), S(w), S(h));
    for (const f of fracs) {
      g.beginPath();
      if (hor) {
        g.moveTo(X(x), Y(y + h * f));
        g.lineTo(X(x + w), Y(y + h * f));
      } else {
        g.moveTo(X(x + w * f), Y(y));
        g.lineTo(X(x + w * f), Y(y + h));
      }
      g.stroke();
    }
  };
  winLines(200, 0, 150, E);
  winLines(900 - E, 250, E, 150);
  winLines(600, 700 - E, 150, E);

  // Puertas
  const arc = (hx, hy, len, a0, a1, lx, ly) => {
    g.beginPath();
    g.moveTo(X(hx), Y(hy));
    g.lineTo(X(lx), Y(ly));
    g.stroke();
    g.beginPath();
    g.arc(X(hx), Y(hy), S(len), a0, a1);
    g.stroke();
  };
  if (door1 === 'sliding') {
    // Corredera: dos hojas finas desplazadas dentro del hueco
    g.fillStyle = ink;
    g.fillRect(X(500 - 4), Y(150), S(3), S(50));
    g.fillRect(X(500 + 1), Y(185), S(3), S(50));
  } else arc(500 + I / 2, 150, 85, 0, Math.PI / 2, 500 + I / 2 + 85, 150);
  arc(150, 400 + I / 2, 85, 0, Math.PI / 2, 150, 400 + I / 2 + 85);
  arc(E, 590, 90, -Math.PI / 2, 0, E, 500);

  // Pilares exentos
  if (pillars) {
    rect(680, 240, 30, 30, wall);
    rect(680, 500, 30, 30, wall);
  }
  // Textos
  if (text) {
    g.fillStyle = text;
    g.font = `bold ${Math.round(S(26))}px sans-serif`;
    g.fillText('SALÓN', X(180), Y(200));
    g.fillText('COCINA', X(170), Y(560));
    g.fillText('DORMITORIO', X(560), Y(300));
    g.font = `${Math.round(S(16))}px sans-serif`;
    g.fillText('20,0 m²', X(200), Y(225));
  }
}

const base = { expected: { doors: 3, windows: 3, rooms: 3 }, opts: { hollow: false } };

/** Plano a color de catálogo inmobiliario: suelos de colores, muebles de tonos medios, muros gris oscuro. */
export function colorPlan() {
  const { c, g } = makeCanvas(1150, 950);
  drawPlan(g, {
    wall: '#4a4a4a',
    ink: '#555',
    floors: ['#ead8b5', '#cfe2ef', '#d8b48c'],
    furniture: { sofa: '#7a8ca3', bed: '#e9e4da', table: '#a0785a' },
    windowStyle: 'frame',
  });
  return { ...base, name: 'A color (catálogo inmobiliario)', canvas: c };
}

/** Plano tipo cianotipo: líneas blancas sobre fondo azul. */
export function blueprintPlan() {
  const { c, g } = makeCanvas(1150, 950, '#1d4f91');
  drawPlan(g, { bg: '#1d4f91', wall: '#f1f6ff', ink: '#dbe7f7', text: '#dbe7f7' });
  return { ...base, name: 'Cianotipo (blanco sobre azul)', canvas: c };
}

/** Lámina técnica: marco grueso, cajetín, cotas, ejes de replanteo y flecha de norte. */
export function sheetPlan() {
  const { c, g } = makeCanvas(1400, 1150);
  // Marco de la lámina
  g.fillStyle = '#000';
  g.fillRect(20, 20, 1360, 10);
  g.fillRect(20, 1120, 1360, 10);
  g.fillRect(20, 20, 10, 1110);
  g.fillRect(1370, 20, 10, 1110);
  g.lineWidth = 1;
  g.strokeStyle = '#000';
  g.strokeRect(40, 40, 1320, 1070);
  // Cajetín
  g.strokeRect(1040, 960, 320, 150);
  for (const y of [1000, 1040, 1075]) {
    g.beginPath();
    g.moveTo(1040, y);
    g.lineTo(1360, y);
    g.stroke();
  }
  g.font = '18px sans-serif';
  g.fillStyle = '#000';
  g.fillText('PROYECTO: VIVIENDA', 1050, 990);
  g.fillText('PLANTA DE DISTRIBUCIÓN', 1050, 1030);
  g.fillText('ESCALA 1:50', 1050, 1065);
  // Ejes de replanteo (discontinuos) con círculos
  g.setLineDash([12, 4, 2, 4]);
  g.strokeStyle = '#666';
  for (const x of [0, 500, 900]) {
    g.beginPath();
    g.moveTo(200 + x, 90);
    g.lineTo(200 + x, 950);
    g.stroke();
  }
  g.setLineDash([]);
  for (const [i, x] of [0, 500, 900].entries()) {
    g.beginPath();
    g.arc(200 + x, 75, 14, 0, Math.PI * 2);
    g.stroke();
    g.fillText(String(i + 1), 195 + x, 81);
  }
  // Cotas
  const cota = (x1, y1, x2, y2, txt) => {
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    for (const [x, y] of [
      [x1, y1],
      [x2, y2],
    ]) {
      g.moveTo(x - 5, y + 5);
      g.lineTo(x + 5, y - 5);
    }
    g.stroke();
    g.font = '16px sans-serif';
    g.fillText(txt, (x1 + x2) / 2 - 18, (y1 + y2) / 2 - 6);
  };
  cota(200, 120, 700, 120, '5.00');
  cota(700, 120, 1100, 120, '4.00');
  cota(150, 150, 150, 550, '');
  cota(150, 550, 150, 850, '');
  g.save();
  g.translate(140, 360);
  g.rotate(-Math.PI / 2);
  g.fillText('4.00', 0, 0);
  g.restore();
  // Flecha de norte
  g.beginPath();
  g.moveTo(1250, 200);
  g.lineTo(1270, 260);
  g.lineTo(1250, 245);
  g.lineTo(1230, 260);
  g.closePath();
  g.fill();
  g.fillText('N', 1243, 190);
  drawPlan(g, { ox: 200, oy: 150 });
  return { ...base, name: 'Lámina técnica (marco, cajetín, cotas, ejes)', canvas: c };
}

/** Dos plantas en la misma hoja. */
export function twoFloorsPlan() {
  const { c, g } = makeCanvas(1700, 800);
  drawPlan(g, { ox: 80, oy: 120, s: 0.8 });
  drawPlan(g, { ox: 900, oy: 120, s: 0.8 });
  g.fillStyle = '#000';
  g.font = 'bold 24px sans-serif';
  g.fillText('PLANTA BAJA', 300, 80);
  g.fillText('PLANTA ALTA', 1120, 80);
  return { name: 'Dos plantas en una hoja', canvas: c, opts: { hollow: false }, expected: { doors: 6, windows: 6, rooms: 6 }, scale: 0.8 };
}

/** Puerta corredera, pilares exentos y suelo de baldosas rayado. */
export function extrasPlan() {
  const { c, g } = makeCanvas(1150, 950);
  drawPlan(g, { door1: 'sliding', pillars: true, tiles: true });
  return { ...base, name: 'Corredera, pilares y baldosas', canvas: c, expectedSliding: 1 };
}

/** Esquina achaflanada: un muro en diagonal. */
export function chamferPlan() {
  const { c, g } = makeCanvas(1150, 950);
  drawPlan(g, { chamfer: true });
  return { ...base, name: 'Esquina en diagonal (chaflán)', canvas: c };
}

/** Muros con contorno de color (CAD a color) sobre fondo blanco. */
export function coloredCadPlan() {
  const { c, g } = makeCanvas(1150, 950);
  drawPlan(g, { hollow: true, wall: '#c0392b', ink: '#e08a80', text: '#2c3e50' });
  return { ...base, name: 'CAD a color (contorno rojo)', canvas: c, opts: { hollow: true } };
}

export const STYLE_FIXTURES = [colorPlan, blueprintPlan, sheetPlan, twoFloorsPlan, extrasPlan, chamferPlan, coloredCadPlan];
