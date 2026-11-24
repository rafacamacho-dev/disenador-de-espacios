// Modelos 3D de los muebles, construidos con primitivas. Unidades en metros.
// Origen en el centro del mueble a nivel del suelo; ancho en X, alto en Y, fondo en Z.
// El frente del mueble mira hacia +Z (equivale a +Y local del plano).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { lighten, rng, hashStr } from './geometry.js';

const cache = new Map();
export function mat(color, opts = {}) {
  const key = color + '|' + JSON.stringify(opts);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...opts });
    cache.set(key, m);
  }
  return m;
}

const C = {
  wood: '#a47b55',
  white: '#f5f5f3',
  metal: '#c3c7cc',
  dark: '#2b2e34',
  counter: '#5f6368',
};
const glass = () => mat('#cfe9f5', { transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.2, depthWrite: false });
const metal = () => mat(C.metal, { metalness: 0.8, roughness: 0.3 });
const porcelain = () => mat(C.white, { roughness: 0.2 });

function finish(g, mesh, m) {
  mesh.castShadow = !m.transparent;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
function box(g, w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), m);
  mesh.position.set(x, y + h / 2, z);
  return finish(g, mesh, m);
}
function rbox(g, w, h, d, r, m, x = 0, y = 0, z = 0) {
  w = Math.max(w, 0.01);
  h = Math.max(h, 0.01);
  d = Math.max(d, 0.01);
  const rad = Math.max(0.001, Math.min(r, w / 2, h / 2, d / 2) - 0.001);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, rad), m);
  mesh.position.set(x, y + h / 2, z);
  return finish(g, mesh, m);
}
function cyl(g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  return finish(g, mesh, m);
}
function sph(g, r, m, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), m);
  mesh.position.set(x, y, z);
  return finish(g, mesh, m);
}
function legs(g, W, D, h, t, m, inset = 0.03) {
  const x = W / 2 - inset - t / 2;
  const z = D / 2 - inset - t / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, t, h, t, m, sx * x, 0, sz * z);
}
function table(g, W, H, D, top, legMat) {
  box(g, W, 0.04, D, top, 0, H - 0.04, 0);
  legs(g, W, D, H - 0.04, 0.05, legMat);
}
function cabinet(g, W, H, D, color, { top = true } = {}) {
  box(g, W, 0.1, D - 0.08, mat(C.dark), 0, 0, -0.04);
  box(g, W, H - (top ? 0.14 : 0.1), D - 0.03, mat(color), 0, 0.1, -0.015);
  if (top) box(g, W, 0.04, D, mat(C.counter, { roughness: 0.35 }), 0, H - 0.04, 0);
  const n = Math.max(1, Math.round(W / 0.6));
  for (let i = 1; i < n; i++) box(g, 0.006, H - 0.2, 0.004, mat(C.dark), -W / 2 + (W / n) * i, 0.12, D / 2 - 0.028);
  for (let i = 0; i < n; i++) box(g, 0.12, 0.015, 0.02, metal(), -W / 2 + (W / n) * (i + 0.5), H - 0.16, D / 2 - 0.02);
}

const BOOKS = ['#8c3b3b', '#2f5d7c', '#d9a441', '#3f6b4a', '#6d4c7d', '#c7c2b8', '#22313f', '#b4643c'];

const B = {
  generic(g, W, H, D, it) {
    box(g, W, H, D, mat(it.color));
  },
  cama(g, W, H, D, it) {
    const wood = mat(C.wood);
    box(g, W, 0.28, D, wood);
    rbox(g, W - 0.04, Math.max(H - 0.28, 0.1), D - 0.12, 0.05, mat(C.white, { roughness: 0.9 }), 0, 0.28, 0.04);
    box(g, W + 0.02, 1.0, 0.07, wood, 0, 0, -D / 2 + 0.035);
    const n = W >= 1.2 ? 2 : 1;
    const pw = n === 2 ? (W - 0.3) / 2 : W - 0.3;
    for (let i = 0; i < n; i++) {
      const x = n === 2 ? (i ? 1 : -1) * (pw / 2 + 0.05) : 0;
      rbox(g, pw, 0.12, 0.36, 0.05, mat('#ffffff', { roughness: 1 }), x, H - 0.02, -D / 2 + 0.3);
    }
    rbox(g, W - 0.02, 0.06, D * 0.62, 0.03, mat(it.color, { roughness: 0.95 }), 0, H - 0.04, D / 2 - D * 0.31);
  },
  mesa_noche(g, W, H, D, it) {
    rbox(g, W, H, D, 0.01, mat(it.color));
    box(g, W * 0.85, 0.008, 0.004, mat(C.dark), 0, H * 0.6, D / 2 + 0.001);
    cyl(g, 0.05, 0.06, 0.03, metal(), 0, H, 0);
    cyl(g, 0.012, 0.012, 0.22, metal(), 0, H + 0.03, 0);
    cyl(g, 0.08, 0.11, 0.16, mat('#fff3d6', { emissive: '#ffe9b0', emissiveIntensity: 0.4 }), 0, H + 0.22, 0);
  },
  armario(g, W, H, D, it) {
    box(g, W, H, D, mat(it.color));
    const n = Math.max(1, Math.round(W / 0.6));
    for (let i = 1; i < n; i++) box(g, 0.006, H - 0.06, 0.004, mat(C.dark), -W / 2 + (W / n) * i, 0.03, D / 2 + 0.001);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (W / n) * (i + 0.5) + (i % 2 ? -1 : 1) * (W / n) * 0.38;
      box(g, 0.015, 0.22, 0.02, metal(), x, H * 0.45, D / 2 + 0.01);
    }
  },
  comoda(g, W, H, D, it) {
    box(g, W, H - 0.08, D, mat(it.color), 0, 0.08, 0);
    legs(g, W, D, 0.08, 0.04, mat(C.dark), 0.02);
    for (let i = 1; i < 3; i++) box(g, W * 0.96, 0.006, 0.004, mat(C.dark), 0, 0.08 + ((H - 0.08) / 3) * i, D / 2 + 0.001);
    for (let i = 0; i < 3; i++) box(g, 0.14, 0.015, 0.02, metal(), 0, 0.08 + ((H - 0.08) / 3) * (i + 0.5), D / 2 + 0.01);
  },
  mueble(g, W, H, D, it) {
    box(g, W, H - 0.06, D, mat(it.color), 0, 0.06, 0);
    legs(g, W, D, 0.06, 0.04, mat(C.dark), 0.03);
    const n = Math.max(1, Math.round(W / 0.6));
    for (let i = 1; i < n; i++) box(g, 0.006, H - 0.1, 0.004, mat(C.dark), -W / 2 + (W / n) * i, 0.08, D / 2 + 0.001);
  },
  sofa(g, W, H, D, it) {
    const f = mat(it.color, { roughness: 0.95 });
    const f2 = mat(lighten(it.color, 0.12), { roughness: 0.95 });
    const arm = Math.min(0.18, W * 0.15);
    const back = Math.min(0.22, D * 0.25);
    const foot = 0.06;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.02, 0.02, foot, mat(C.dark), sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06), 10);
    rbox(g, W, 0.3, D, 0.03, f, 0, foot, 0);
    rbox(g, W, H - foot, back, 0.05, f, 0, foot, -D / 2 + back / 2);
    for (const sx of [-1, 1]) rbox(g, arm, 0.6 - foot, D, 0.05, f, sx * (W / 2 - arm / 2), foot, 0);
    const inner = W - 2 * arm;
    const n = Math.max(1, Math.round(inner / 0.65));
    const cw = inner / n;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + arm + cw * (i + 0.5);
      rbox(g, cw - 0.02, 0.13, D - back - 0.02, 0.05, f2, x, foot + 0.3, back / 2);
      rbox(g, cw - 0.04, Math.max(0.2, H - 0.55), 0.14, 0.06, f2, x, foot + 0.42, -D / 2 + back + 0.07);
    }
  },
  mesa(g, W, H, D, it) {
    table(g, W, H, D, mat(it.color), mat(lighten(it.color, -0.1)));
  },
  escritorio(g, W, H, D, it) {
    table(g, W, H, D, mat(it.color), mat(C.dark, { metalness: 0.5, roughness: 0.4 }));
    box(g, 0.34, 0.012, 0.24, mat('#555a62', { metalness: 0.5 }), 0.05, H, 0.05);
  },
  mesa_redonda(g, W, H, D, it) {
    const m = mat(it.color);
    const top = cyl(g, W / 2, W / 2, 0.04, m, 0, H - 0.04, 0, 40);
    top.scale.z = D / W;
    cyl(g, 0.05, 0.05, H - 0.04, m, 0, 0, 0);
    cyl(g, 0.25, 0.28, 0.03, m, 0, 0, 0, 32);
  },
  mesa_auxiliar(g, W, H, D, it) {
    const m = mat(it.color);
    cyl(g, W / 2, W / 2, 0.03, m, 0, H - 0.03, 0, 32);
    cyl(g, 0.025, 0.025, H - 0.03, metal(), 0, 0, 0);
    cyl(g, W * 0.3, W * 0.3, 0.02, metal(), 0, 0, 0);
  },
  silla(g, W, H, D, it) {
    const m = mat(it.color);
    legs(g, W, D, 0.44, 0.03, m, 0.02);
    rbox(g, W, 0.05, D, 0.015, m, 0, 0.44, 0);
    box(g, W, H - 0.49, 0.03, m, 0, 0.49, -D / 2 + 0.015);
  },
  silla_oficina(g, W, H, D, it) {
    const m = mat(it.color, { roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const leg = box(g, 0.04, 0.03, 0.28, mat(C.dark), Math.sin(a) * 0.14, 0.03, Math.cos(a) * 0.14);
      leg.rotation.y = a;
    }
    cyl(g, 0.025, 0.025, 0.38, metal(), 0, 0.05, 0);
    rbox(g, W * 0.85, 0.08, D * 0.85, 0.03, m, 0, 0.42, 0.02);
    rbox(g, W * 0.8, Math.max(0.2, H - 0.58), 0.06, 0.03, m, 0, 0.56, -D / 2 + 0.08);
  },
  tv(g, W, H, D) {
    box(g, 0.3, 0.02, 0.2, mat(C.dark), 0, 0, 0);
    box(g, 0.05, 0.08, 0.03, mat(C.dark), 0, 0.02, -0.02);
    box(g, W, H - 0.08, 0.04, mat('#111216', { roughness: 0.25, metalness: 0.4 }), 0, 0.08, 0);
  },
  estanteria(g, W, H, D, it) {
    const m = mat(it.color);
    const t = 0.02;
    box(g, t, H, D, m, -W / 2 + t / 2);
    box(g, t, H, D, m, W / 2 - t / 2);
    box(g, W, t, D, m, 0, H - t);
    box(g, W, t, D, m, 0, 0);
    box(g, W, H, 0.01, m, 0, 0, -D / 2 + 0.005);
    const n = Math.max(1, Math.round(H / 0.38));
    const sh = H / n;
    const R = rng(hashStr(it.id || 'x'));
    for (let i = 1; i < n; i++) box(g, W - 2 * t, t, D, m, 0, i * sh);
    for (let i = 0; i < n; i++) {
      let x = -W / 2 + t + 0.01;
      while (x < W / 2 - t - 0.05) {
        const bw = 0.02 + R() * 0.035;
        const bh = sh * (0.5 + R() * 0.32);
        if (R() < 0.15) {
          x += bw + 0.03;
          continue;
        }
        box(g, bw, bh, D * 0.75, mat(BOOKS[Math.floor(R() * BOOKS.length)]), x + bw / 2, i * sh + t, 0.01);
        x += bw + 0.003;
      }
    }
  },
  alfombra(g, W, H, D, it) {
    const m = box(g, W, 0.012, D, mat(it.color, { roughness: 1 }));
    m.castShadow = false;
  },
  encimera(g, W, H, D, it) {
    cabinet(g, W, H, D, it.color);
  },
  fregadero(g, W, H, D, it) {
    cabinet(g, W, H, D, it.color);
    box(g, W * 0.7, 0.012, D * 0.55, mat('#9aa0a6', { metalness: 0.7, roughness: 0.35 }), 0, H - 0.008, 0.02);
    cyl(g, 0.015, 0.02, 0.25, metal(), 0, H, -D / 2 + 0.08, 12);
    box(g, 0.025, 0.025, 0.16, metal(), 0, H + 0.22, -D / 2 + 0.15);
  },
  estufa(g, W, H, D, it) {
    box(g, W, H - 0.02, D, mat(it.color, { metalness: 0.3, roughness: 0.4 }));
    box(g, W, 0.02, D, mat('#1b1c1f', { roughness: 0.2 }), 0, H - 0.02, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.07, 0.07, 0.008, mat('#3a3c40', { metalness: 0.6 }), (sx * W) / 4, H, (sz * D) / 4);
    box(g, W * 0.8, H * 0.4, 0.006, mat('#1d1f24', { roughness: 0.15 }), 0, H * 0.25, D / 2 + 0.003);
    box(g, W * 0.7, 0.02, 0.03, metal(), 0, H * 0.7, D / 2 + 0.02);
  },
  nevera(g, W, H, D, it) {
    const m = mat(it.color, { metalness: 0.35, roughness: 0.35 });
    rbox(g, W, H, D, 0.02, m);
    box(g, W * 0.98, 0.008, 0.004, mat(C.dark), 0, H * 0.62, D / 2 + 0.001);
    box(g, 0.02, 0.35, 0.03, metal(), W / 2 - 0.07, H * 0.68, D / 2 + 0.015);
    box(g, 0.02, 0.5, 0.03, metal(), W / 2 - 0.07, H * 0.25, D / 2 + 0.015);
  },
  lavadora(g, W, H, D, it) {
    rbox(g, W, H, D, 0.02, mat(it.color, { roughness: 0.4 }));
    const door = cyl(g, W * 0.3, W * 0.3, 0.03, mat('#9aa3ad', { metalness: 0.5, roughness: 0.3 }), 0, 0, 0, 32);
    door.rotation.x = Math.PI / 2;
    door.position.set(0, H * 0.45, D / 2);
    const glassDoor = cyl(g, W * 0.22, W * 0.22, 0.035, mat('#34404c', { roughness: 0.1 }), 0, 0, 0, 32);
    glassDoor.rotation.x = Math.PI / 2;
    glassDoor.position.set(0, H * 0.45, D / 2 + 0.003);
    box(g, W * 0.9, 0.08, 0.005, mat('#dfe3e7'), 0, H - 0.1, D / 2 + 0.002);
  },
  alacena(g, W, H, D, it) {
    box(g, W, H, D, mat(it.color));
    const n = Math.max(1, Math.round(W / 0.5));
    for (let i = 1; i < n; i++) box(g, 0.006, H - 0.02, 0.004, mat(C.dark), -W / 2 + (W / n) * i, 0.01, D / 2 + 0.001);
    for (let i = 0; i < n; i++) box(g, 0.1, 0.015, 0.02, metal(), -W / 2 + (W / n) * (i + 0.5), 0.05, D / 2 + 0.01);
  },
  inodoro(g, W, H, D) {
    const p = porcelain();
    const tankD = 0.18;
    rbox(g, W, Math.max(0.1, H - 0.37), tankD, 0.03, p, 0, 0.37, -D / 2 + tankD / 2);
    cyl(g, 0.13, 0.11, 0.32, p, 0, 0, 0.06);
    const bowl = cyl(g, 0.2, 0.16, 0.1, p, 0, 0.3, 0.06);
    bowl.scale.z = 1.3;
    const seat = cyl(g, 0.205, 0.205, 0.025, mat('#fbfbfb', { roughness: 0.3 }), 0, 0.4, 0.06);
    seat.scale.z = 1.3;
  },
  lavabo(g, W, H, D, it) {
    const cab = Math.max(0.3, H - 0.17);
    box(g, W, cab, D, mat(it.color));
    box(g, W * 0.97, 0.006, 0.004, mat(C.dark), 0, cab * 0.5, D / 2 + 0.001);
    box(g, W, 0.04, D, porcelain(), 0, cab, 0);
    const basin = cyl(g, Math.min(W, D) * 0.36, Math.min(W, D) * 0.28, 0.13, porcelain(), 0, cab + 0.04, 0.02, 32);
    basin.scale.x = W / D > 1.2 ? 1.3 : 1;
    cyl(g, 0.014, 0.018, 0.22, metal(), 0, cab + 0.04, -D / 2 + 0.06, 12);
    box(g, 0.02, 0.02, 0.12, metal(), 0, cab + 0.24, -D / 2 + 0.11);
  },
  ducha(g, W, H, D) {
    box(g, W, 0.04, D, porcelain());
    const gl = glass();
    box(g, W, Math.max(0.5, H - 0.05), 0.01, gl, 0, 0.04, D / 2 - 0.005);
    box(g, 0.01, Math.max(0.5, H - 0.05), D, gl, W / 2 - 0.005, 0.04, 0);
    box(g, W, 0.02, 0.02, metal(), 0, H - 0.02, D / 2 - 0.01);
    box(g, 0.02, 0.02, D, metal(), W / 2 - 0.01, H - 0.02, 0);
    box(g, 0.02, 0.5, 0.02, metal(), -W / 2 + 0.2, H - 0.45, -D / 2 + 0.03);
    cyl(g, 0.1, 0.1, 0.02, metal(), -W / 2 + 0.2, H - 0.02, -D / 2 + 0.18);
    box(g, 0.02, 0.02, 0.16, metal(), -W / 2 + 0.2, H, -D / 2 + 0.1);
    cyl(g, 0.04, 0.04, 0.005, mat('#8a9096', { metalness: 0.7 }), 0, 0.04, 0);
  },
  banera(g, W, H, D) {
    const p = porcelain();
    const t = 0.07;
    box(g, W, 0.06, D, p);
    box(g, W, H, t, p, 0, 0, -D / 2 + t / 2);
    box(g, W, H, t, p, 0, 0, D / 2 - t / 2);
    box(g, t, H, D - 2 * t, p, -W / 2 + t / 2, 0, 0);
    box(g, t, H, D - 2 * t, p, W / 2 - t / 2, 0, 0);
    const water = box(g, W - 2 * t, 0.005, D - 2 * t, mat('#a9d6ea', { transparent: true, opacity: 0.55, roughness: 0.05 }), 0, H * 0.6, 0);
    water.castShadow = false;
    cyl(g, 0.015, 0.02, 0.18, metal(), -W / 2 + 0.035, H, 0, 12);
  },
  espejo(g, W, H, D) {
    box(g, W + 0.03, H + 0.03, 0.015, mat('#d8d4cc'), 0, -0.015, -0.005);
    box(g, W, H, Math.max(0.01, D - 0.005), mat('#e6f2f8', { metalness: 0.95, roughness: 0.05 }), 0, 0, 0);
  },
  planta(g, W, H, D, it) {
    const r = Math.min(W, D) / 2;
    cyl(g, r * 0.55, r * 0.42, 0.35, mat('#b5653e', { roughness: 0.9 }), 0, 0, 0);
    cyl(g, r * 0.5, r * 0.5, 0.02, mat('#4a3626'), 0, 0.33, 0);
    const R = rng(hashStr(it.id || 'p'));
    const greens = [it.color, lighten(it.color, 0.12), '#3f7a3a'];
    const top = Math.max(0.6, H);
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2;
      const rr = R() * r * 0.45;
      const y = 0.45 + R() * (top - 0.6);
      sph(g, r * (0.4 + R() * 0.3), mat(greens[i % 3], { roughness: 0.9 }), Math.cos(a) * rr, y, Math.sin(a) * rr);
    }
  },
  lampara_pie(g, W, H, D, it) {
    cyl(g, 0.15, 0.15, 0.025, mat(C.dark, { metalness: 0.5 }), 0, 0, 0, 32);
    cyl(g, 0.012, 0.012, Math.max(0.3, H - 0.3), metal(), 0, 0.025, 0, 12);
    cyl(g, 0.14, 0.2, 0.28, mat(it.color, { emissive: '#ffe9b0', emissiveIntensity: 0.5, side: THREE.DoubleSide }), 0, Math.max(0.3, H - 0.3), 0, 32);
  },
  puerta(g, W, H, D, it) {
    const f = 0.05;
    const fd = D + 0.02;
    const fm = mat('#ebe6de');
    box(g, f, H, fd, fm, -W / 2 + f / 2, 0, 0);
    box(g, f, H, fd, fm, W / 2 - f / 2, 0, 0);
    box(g, W, f, fd, fm, 0, H - f, 0);
    const leafW = W - 2 * f;
    const leafH = H - f - 0.01;
    const m = it.mirror ? -1 : 1;
    const pivot = new THREE.Group();
    pivot.position.set(-m * (W / 2 - f), 0, D / 2);
    g.add(pivot);
    box(pivot, 0.04, leafH, leafW, mat(it.color), m * 0.02, 0.005, leafW / 2);
    box(pivot, 0.06, 0.02, 0.12, metal(), m * 0.02, 1.0, leafW - 0.1);
  },
  puerta_doble(g, W, H, D, it) {
    const f = 0.05;
    const fd = D + 0.02;
    const fm = mat('#ebe6de');
    box(g, f, H, fd, fm, -W / 2 + f / 2, 0, 0);
    box(g, f, H, fd, fm, W / 2 - f / 2, 0, 0);
    box(g, W, f, fd, fm, 0, H - f, 0);
    const leafW = (W - 2 * f) / 2;
    for (const m of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(-m * (W / 2 - f), 0, D / 2);
      g.add(pivot);
      box(pivot, 0.04, H - f - 0.01, leafW, mat(it.color), m * 0.02, 0.005, leafW / 2);
    }
  },
  puerta_corredera(g, W, H, D, it) {
    const f = 0.05;
    const fd = D + 0.02;
    const fm = mat('#ebe6de');
    box(g, f, H, fd, fm, -W / 2 + f / 2, 0, 0);
    box(g, f, H, fd, fm, W / 2 - f / 2, 0, 0);
    box(g, W, f, fd, fm, 0, H - f, 0);
    // Dos hojas con cristal esmerilado, una delante de otra, solapadas en el centro.
    const leafW = (W - 2 * f) * 0.56;
    const leafH = H - f - 0.01;
    const frame = mat(it.color);
    const frosted = mat('#e9f2f5', { transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false });
    for (const [sx, z] of [
      [-1, -0.025],
      [1, 0.025],
    ]) {
      const x = sx * ((W - 2 * f) / 2 - leafW / 2);
      box(g, leafW, 0.06, 0.03, frame, x, 0.005, z);
      box(g, leafW, 0.06, 0.03, frame, x, leafH - 0.055, z);
      box(g, 0.06, leafH, 0.03, frame, x - leafW / 2 + 0.03, 0.005, z);
      box(g, 0.06, leafH, 0.03, frame, x + leafW / 2 - 0.03, 0.005, z);
      box(g, leafW - 0.12, leafH - 0.12, 0.01, frosted, x, 0.065, z);
      box(g, 0.02, 0.25, 0.04, metal(), x - sx * (leafW / 2 - 0.1), 0.95, z);
    }
  },
  ventana(g, W, H, D, it) {
    const f = 0.05;
    const fd = Math.max(0.06, D * 0.5);
    const fm = mat(it.color || '#f2f2f2', { roughness: 0.5 });
    box(g, W, f, fd, fm, 0, 0, 0);
    box(g, W, f, fd, fm, 0, H - f, 0);
    box(g, f, H, fd, fm, -W / 2 + f / 2, 0, 0);
    box(g, f, H, fd, fm, W / 2 - f / 2, 0, 0);
    const n = Math.max(1, Math.round(W / 0.9));
    for (let i = 1; i < n; i++) box(g, f * 0.8, H, fd, fm, -W / 2 + (W / n) * i, 0, 0);
    box(g, W - 2 * f, H - 2 * f, 0.01, glass(), 0, f, 0);
    if ((it.elev || 0) > 5) box(g, W + 0.06, 0.03, D + 0.06, mat('#dcd6cc'), 0, -0.03, 0);
  },
};

export function buildItem(it, def) {
  const g = new THREE.Group();
  const fn = B[def?.build] || B.generic;
  fn(g, it.w / 100, Math.max(it.h, 1) / 100, it.d / 100, it);
  return g;
}

export function disposeChildren(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  group.clear();
}
