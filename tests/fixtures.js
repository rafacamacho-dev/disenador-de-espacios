// Planos sintéticos para probar la detección. Escala: 1 px = 1 cm.
// Cada función devuelve { canvas, expected, opts } con lo que la detección debería encontrar.

/** Estilo CAD: muros huecos (dos líneas con rayado), ventanas con tres líneas, puertas con arco. */
export function cadPlan() {
  const c = document.createElement('canvas');
  c.width = 1400;
  c.height = 1000;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  const T = 20;
  const walls = [
    [100, 100, 1200, T],
    [100, 880, 1200, T],
    [100, 100, T, 800],
    [1280, 100, T, 800],
    [690, 100, T, 800],
    [100, 490, 600, T],
    [700, 560, 600, T],
  ];
  const doors = [
    [690, 250, T, 85],
    [300, 490, 85, T],
    [900, 560, 90, T],
  ];
  const windows = [
    [880, 100, 150, T],
    [300, 880, 140, T],
    [1280, 300, T, 140],
  ];
  g.save();
  g.beginPath();
  walls.forEach((r) => g.rect(...r));
  g.clip();
  g.strokeStyle = '#555';
  g.lineWidth = 1;
  for (let k = -1000; k < 2400; k += 7) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 1000, 1000);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  walls.forEach((r) => g.strokeRect(...r));
  for (const r of [...doors, ...windows]) {
    const hor = r[3] === T;
    g.fillStyle = '#fff';
    g.fillRect(r[0] - (hor ? 0 : 1), r[1] - (hor ? 1 : 0), r[2] + (hor ? 0 : 2), r[3] + (hor ? 2 : 0));
  }
  g.strokeStyle = '#222';
  g.lineWidth = 1.5;
  for (const r of windows) {
    const hor = r[3] === T;
    for (const f of [0.2, 0.5, 0.8]) {
      g.beginPath();
      if (hor) {
        g.moveTo(r[0], r[1] + T * f);
        g.lineTo(r[0] + r[2], r[1] + T * f);
      } else {
        g.moveTo(r[0] + T * f, r[1]);
        g.lineTo(r[0] + T * f, r[1] + r[3]);
      }
      g.stroke();
    }
  }
  g.lineWidth = 2;
  g.strokeStyle = '#111';
  const door = (hx, hy, len, a0, a1, lx, ly) => {
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(lx, ly);
    g.stroke();
    g.setLineDash([5, 4]);
    g.beginPath();
    g.arc(hx, hy, len, a0, a1);
    g.stroke();
    g.setLineDash([]);
  };
  door(710, 250, 85, 0, Math.PI / 2, 795, 250);
  door(300, 510, 85, 0, Math.PI / 2, 300, 595);
  door(990, 580, 90, Math.PI / 2, Math.PI, 990, 670);
  g.fillStyle = '#111';
  g.font = '28px sans-serif';
  g.fillText('SALÓN', 300, 300);
  g.fillText('COCINA', 950, 350);
  g.fillText('DORMITORIO', 250, 700);
  g.fillText('BAÑO', 950, 750);
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(100, 60);
  g.lineTo(1300, 60);
  g.stroke();
  g.font = '18px sans-serif';
  g.fillText('12.00', 680, 52);
  g.strokeRect(200, 600, 160, 200);
  g.strokeRect(1000, 700, 170, 75);
  return {
    name: 'CAD (muros huecos)',
    canvas: c,
    opts: { hollow: true },
    expected: { walls: 7, doors: 3, windows: 3, rooms: 4 },
  };
}

/** Estilo inmobiliaria: muros rellenos negros, puertas con arco, ventanas como líneas finas, textos. */
export function filledPlan() {
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 900;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1a1a1a';
  const T = 18;
  const walls = [
    [80, 80, 1000, T],
    [80, 780, 1000, T],
    [80, 80, T, 718],
    [1062, 80, T, 718],
    [500, 80, T, 718],
    [80, 420, 420, T],
    [500, 470, 580, T],
  ];
  walls.forEach((r) => g.fillRect(...r));
  const clear = (r) => {
    g.fillStyle = '#fff';
    g.fillRect(...r);
  };
  // Puertas
  clear([500, 200, T, 80]);
  clear([250, 420, 80, T]);
  clear([700, 470, 90, T]);
  clear([80, 600, T, 90]); // entrada
  g.strokeStyle = '#333';
  g.lineWidth = 1.5;
  const arc = (hx, hy, len, a0, a1, lx, ly) => {
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(lx, ly);
    g.stroke();
    g.beginPath();
    g.arc(hx, hy, len, a0, a1);
    g.stroke();
  };
  arc(518, 200, 80, 0, Math.PI / 2, 598, 200);
  arc(250, 438, 80, 0, Math.PI / 2, 250, 518);
  arc(790, 488, 90, Math.PI / 2, Math.PI, 790, 578);
  arc(98, 690, 90, -Math.PI / 2, 0, 188, 690);
  // Ventanas: hueco con dos líneas finas
  for (const r of [
    [200, 80, 160, T],
    [700, 80, 200, T],
    [1062, 250, T, 120],
    [700, 780, 150, T],
  ]) {
    clear(r);
    const hor = r[3] === T;
    g.strokeStyle = '#444';
    g.lineWidth = 1;
    g.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    g.beginPath();
    if (hor) {
      g.moveTo(r[0], r[1] + T / 2);
      g.lineTo(r[0] + r[2], r[1] + T / 2);
    } else {
      g.moveTo(r[0] + T / 2, r[1]);
      g.lineTo(r[0] + T / 2, r[1] + r[3]);
    }
    g.stroke();
  }
  g.fillStyle = '#333';
  g.font = 'bold 26px sans-serif';
  g.fillText('Salón-comedor', 160, 260);
  g.fillText('Dormitorio', 650, 300);
  g.fillText('Cocina', 200, 640);
  g.fillText('Baño', 720, 650);
  g.font = '16px sans-serif';
  g.fillText('24,5 m²', 200, 290);
  g.strokeStyle = '#999';
  g.strokeRect(150, 120, 200, 90);
  g.strokeRect(600, 140, 160, 200);
  return {
    name: 'Inmobiliaria (muros rellenos)',
    canvas: c,
    opts: { hollow: false },
    expected: { walls: 7, doors: 4, windows: 4, rooms: 4 },
  };
}

/** Reprocesa un canvas para que parezca escaneado: gira, desenfoca, papel gris, ruido y JPEG. */
async function scanify(src, { angle = 1.5, blur = 1, quality = 0.6 } = {}) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e3d6';
  g.fillRect(0, 0, c.width, c.height);
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.rotate((angle * Math.PI) / 180);
  g.translate(-c.width / 2, -c.height / 2);
  g.filter = `blur(${blur}px)`;
  g.globalCompositeOperation = 'multiply';
  g.drawImage(src, 0, 0);
  g.restore();
  const img = g.getImageData(0, 0, c.width, c.height);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 40;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL('image/jpeg', quality);
  const im = new Image();
  await new Promise((r) => {
    im.onload = r;
    im.src = url;
  });
  const out = document.createElement('canvas');
  out.width = c.width;
  out.height = c.height;
  out.getContext('2d').drawImage(im, 0, 0);
  return out;
}

/** El plano de inmobiliaria, pero escaneado torcido y con ruido. */
export async function scannedPlan() {
  const fx = filledPlan();
  return { ...fx, name: 'Escaneado (girado 1,5°, ruido, JPEG)', canvas: await scanify(fx.canvas) };
}

/** Plano pequeño: muros de pocos píxeles. */
export function lowResPlan() {
  const fx = filledPlan();
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(fx.canvas, 0, 0, c.width, c.height);
  return { ...fx, name: 'Baja resolución (480 px)', canvas: c, scale: 0.4 };
}

/**
 * Vivienda en L: muros exteriores gruesos (26) e interiores finos (12), salón en forma de L,
 * puerta doble de entrada, armario empotrado dibujado con línea fina y textos grandes.
 *
 *   (100,100) ─────────── (500) ─────────────── (1200,100)
 *   │  SALÓN (parte alta)  │      DORM. 1            │
 *   │                      ├──────────────────────── │ y=500
 *   │                      │   (salón, zona cocina)  │
 *   ├──────────(y=650)─────┼──── (700,600) ──────────┘
 *   │  DORM. 2   │  BAÑO   │
 *   └────────────┴─────────┘ (700,1000)
 */
export function lShapePlan() {
  const c = document.createElement('canvas');
  c.width = 1300;
  c.height = 1100;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  const E = 26;
  const I = 12;
  const R = (x, y, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(x, y, w, h);
  };
  const clear = (x, y, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(x, y, w, h);
  };
  // Contorno en L
  R(100, 100, 1100, E); // superior
  R(1200 - E, 100, E, 500); // derecho
  R(700, 600 - E, 500 + E, E); // inferior derecho
  R(700, 600 - E, E, 400 + E); // escalón de la L
  R(100, 1000 - E, 600 + E, E); // inferior izquierdo
  R(100, 100, E, 900); // izquierdo
  // Interiores
  R(500 - I / 2, 100, I, 400); // salón | dormitorio 1
  R(500, 500 - I / 2, 700, I); // dormitorio 1 | zona cocina del salón
  R(100, 650 - I / 2, 600, I); // salón | dormitorio 2 y baño
  R(500 - I / 2, 650, I, 350); // dormitorio 2 | baño
  // Huecos
  clear(500 - I / 2 - 1, 250, I + 2, 85); // puerta dormitorio 1
  clear(300, 650 - I / 2 - 1, 85, I + 2); // puerta dormitorio 2
  clear(560, 650 - I / 2 - 1, 75, I + 2); // puerta baño
  clear(900, 600 - E - 1, 140, E + 2); // puerta doble de entrada
  clear(1200 - E - 1, 250, E + 2, 160); // ventana dormitorio 1
  clear(99, 200, E + 2, 200); // ventana salón
  // Ventanas: marco y línea central
  g.strokeStyle = '#000';
  g.lineWidth = 1.5;
  g.strokeRect(1200 - E, 250, E, 160);
  g.strokeRect(100, 200, E, 200);
  g.beginPath();
  g.moveTo(1200 - E / 2, 250);
  g.lineTo(1200 - E / 2, 410);
  g.moveTo(100 + E / 2, 200);
  g.lineTo(100 + E / 2, 400);
  g.stroke();
  // Puertas: hoja y arco
  const arc = (hx, hy, len, a0, a1, lx, ly) => {
    g.beginPath();
    g.moveTo(hx, hy);
    g.lineTo(lx, ly);
    g.stroke();
    g.beginPath();
    g.arc(hx, hy, len, a0, a1);
    g.stroke();
  };
  arc(506, 250, 85, 0, Math.PI / 2, 591, 250); // abre hacia el dormitorio 1, bisagra arriba
  arc(300, 656, 85, 0, Math.PI / 2, 300, 741); // abre hacia el dormitorio 2
  arc(635, 656, 75, Math.PI / 2, Math.PI, 635, 731); // abre hacia el baño, bisagra a la derecha
  arc(900, 574, 70, -Math.PI / 2, 0, 900, 504); // puerta doble: abre hacia el salón
  arc(1040, 574, 70, Math.PI, (3 * Math.PI) / 2, 1040, 504);
  // Armario empotrado (línea fina, no es muro) y textos
  g.lineWidth = 1;
  g.strokeRect(520, 120, 160, 60);
  g.fillStyle = '#000';
  g.font = '30px sans-serif';
  g.fillText('SALÓN-COCINA', 160, 520);
  g.fillText('DORM. 1', 800, 300);
  g.fillText('DORM. 2', 220, 850);
  g.fillText('BAÑO', 540, 850);
  return {
    name: 'En L con grosores distintos',
    canvas: c,
    opts: { hollow: false },
    expected: { doors: 4, windows: 2, rooms: 4 },
  };
}

import { STYLE_FIXTURES } from './styles.js';

export const FIXTURES = [cadPlan, filledPlan, scannedPlan, lowResPlan, lShapePlan, ...STYLE_FIXTURES];
