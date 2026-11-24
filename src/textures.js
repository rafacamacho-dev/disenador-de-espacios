// Texturas de suelo generadas por código. Cada lienzo representa 1 m × 1 m y se repite.

import { rng, lighten, darken } from './geometry.js';

export const FLOORS = {
  madera: { name: 'Madera clara', base: '#cfa77d' },
  madera_oscura: { name: 'Madera oscura', base: '#7b5639' },
  baldosa: { name: 'Baldosa beige', base: '#e4dccd' },
  ceramica: { name: 'Cerámica blanca', base: '#eef2f4' },
  marmol: { name: 'Mármol', base: '#f3f1ee' },
  ajedrez: { name: 'Ajedrez', base: '#dddddd' },
  alfombra: { name: 'Moqueta', base: '#b8b0a4' },
  concreto: { name: 'Concreto pulido', base: '#aeaeab' },
  cesped: { name: 'Césped', base: '#7aa65a' },
};

const cache = new Map();

export function floorCanvas(type, size = 256) {
  const key = type + ':' + size;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const u = size / 100; // píxeles por centímetro
  const f = FLOORS[type] || FLOORS.madera;
  const R = rng(type.length * 977 + 13);
  const vary = (hex, amt) => (R() < 0.5 ? lighten(hex, R() * amt) : darken(hex, R() * amt));
  const line = Math.max(1, u * 0.3);

  const tiles = (n, base, amt, grout, gw) => {
    const ts = size / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        g.fillStyle = vary(base, amt);
        g.fillRect(i * ts, j * ts, ts, ts);
      }
    g.fillStyle = grout;
    const w = Math.max(1, gw * u);
    for (let i = 0; i <= n; i++) {
      g.fillRect(i * ts - w / 2, 0, w, size);
      g.fillRect(0, i * ts - w / 2, size, w);
    }
  };
  const noise = (amp, tintFn) => {
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (R() - 0.5) * amp;
      d[i] += n;
      d[i + 1] += tintFn ? tintFn(n) : n;
      d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  };

  switch (type) {
    case 'madera':
    case 'madera_oscura': {
      const rowH = 20;
      for (let r = 0; r < 5; r++) {
        const y = r * rowH * u;
        const s0 = (r * 37) % 100;
        for (let k = 0; k < 2; k++) {
          const x0 = (s0 + k * 50) % 100;
          g.fillStyle = vary(f.base, 0.12);
          for (const ox of [0, -100]) g.fillRect((x0 + ox) * u, y, 50 * u, rowH * u);
        }
        g.globalAlpha = 0.13;
        g.strokeStyle = darken(f.base, 0.45);
        g.lineWidth = Math.max(1, u * 0.25);
        for (let i = 0; i < 6; i++) {
          const gy = y + (2 + R() * 16) * u;
          g.beginPath();
          g.moveTo(0, gy);
          for (let x = 0; x <= size; x += size / 10) g.lineTo(x, gy + (R() - 0.5) * u * 1.2);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = darken(f.base, 0.35);
        g.fillRect(0, y, size, line);
        for (let k = 0; k < 2; k++) g.fillRect(((s0 + k * 50) % 100) * u, y, line, rowH * u);
      }
      break;
    }
    case 'baldosa':
      tiles(2, f.base, 0.04, darken(f.base, 0.18), 0.6);
      break;
    case 'ceramica':
      tiles(5, f.base, 0.03, '#c9d2d8', 0.4);
      break;
    case 'marmol': {
      g.fillStyle = f.base;
      g.fillRect(0, 0, size, size);
      for (let i = 0; i < 7; i++) {
        const pts = [R() * size, R() * size, R() * size, R() * size, R() * size, R() * size, R() * size, R() * size];
        g.strokeStyle = `rgba(120,120,125,${0.12 + R() * 0.2})`;
        g.lineWidth = u * (0.15 + R() * 0.5);
        for (const ox of [-size, 0, size])
          for (const oy of [-size, 0, size]) {
            g.beginPath();
            g.moveTo(pts[0] + ox, pts[1] + oy);
            g.bezierCurveTo(pts[2] + ox, pts[3] + oy, pts[4] + ox, pts[5] + oy, pts[6] + ox, pts[7] + oy);
            g.stroke();
          }
      }
      g.fillStyle = '#dedad4';
      const w = Math.max(1, 0.3 * u);
      for (const p of [0, size / 2, size]) {
        g.fillRect(p - w / 2, 0, w, size);
        g.fillRect(0, p - w / 2, size, w);
      }
      break;
    }
    case 'ajedrez': {
      const n = 4;
      const ts = size / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          g.fillStyle = (i + j) % 2 ? '#2f3033' : '#f2f2f0';
          g.fillRect(i * ts, j * ts, ts, ts);
        }
      break;
    }
    case 'cesped':
      g.fillStyle = f.base;
      g.fillRect(0, 0, size, size);
      noise(40, (n) => n * 1.6);
      break;
    case 'alfombra':
      g.fillStyle = f.base;
      g.fillRect(0, 0, size, size);
      noise(28);
      break;
    case 'concreto':
    default:
      g.fillStyle = f.base;
      g.fillRect(0, 0, size, size);
      noise(18);
      break;
  }
  cache.set(key, c);
  return c;
}
