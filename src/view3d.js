// Vista 3D con Three.js: genera suelos, muros (con huecos de puertas y ventanas) y muebles
// a partir del proyecto. Incluye órbita, recorrido en primera persona y selección con clic.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { store } from './state.js';
import { getDef } from './catalog.js';
import { buildItem, mat, disposeChildren } from './furniture3d.js';
import { floorCanvas } from './textures.js';
import { openingsOnWall, DEFAULT_WALL_COLOR } from './model.js';
import * as G from './geometry.js';

const EYE = 1.6;

export class View3D extends EventTarget {
  constructor(container) {
    super();
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e6ebf1');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
    this.camera.position.set(8, 9, 12);

    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 150;
    this.controls.screenSpacePanning = true;

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a3', 1.6));
    const sun = (this.sun = new THREE.DirectionalLight('#fff6e8', 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#dfe4ea', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.002;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.content = new THREE.Group();
    this.highlight = new THREE.Group();
    this.scene.add(this.content, this.highlight);
    this.objects = new Map();
    this.floorMats = new Map();

    this.lowWalls = false;
    this.active = false;
    this.needsRebuild = true;
    this.fitted = false;
    this.walking = false;
    this.timer = new THREE.Timer();
    this.raycaster = new THREE.Raycaster();

    this.setupWalk();
    this.setupPicking();
    new ResizeObserver(() => this.resize()).observe(container);
    store.addEventListener('change', () => this.scheduleRebuild());
    store.addEventListener('selection', () => this.updateHighlight());
    store.addEventListener('loaded', () => {
      this.fitted = false;
      if (this.active) {
        this.rebuild();
        this.fit();
        this.fitted = true;
      }
    });
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  }

  setActive(v) {
    this.active = v;
    if (!v) {
      if (this.walking) this.walkControls.unlock();
      return;
    }
    this.resize();
    if (this.needsRebuild) this.rebuild();
    if (!this.fitted) {
      this.fit();
      this.fitted = true;
    }
    if (!this.raf) this.loop();
  }

  loop = () => {
    if (!this.active) {
      this.raf = null;
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.walking) this.updateWalk(dt);
    else this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  scheduleRebuild() {
    this.needsRebuild = true;
    if (!this.active) return;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.rebuild(), 60);
  }

  setLowWalls(v) {
    this.lowWalls = v;
    this.rebuild();
  }

  floorMaterial(type) {
    if (!this.floorMats.has(type)) {
      const tex = new THREE.CanvasTexture(floorCanvas(type, 512));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const rough = { marmol: 0.25, ceramica: 0.35, ajedrez: 0.35, madera: 0.6, madera_oscura: 0.55 }[type] ?? 0.9;
      this.floorMats.set(type, new THREE.MeshStandardMaterial({ map: tex, roughness: rough }));
    }
    return this.floorMats.get(type);
  }

  rebuild() {
    this.needsRebuild = false;
    disposeChildren(this.content);
    this.objects.clear();
    const p = store.project;

    for (const r of p.rooms) {
      if (r.points.length < 3) continue;
      const shape = new THREE.Shape(r.points.map((q) => new THREE.Vector2(q.x / 100, -q.y / 100)));
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, this.floorMaterial(r.floor));
      m.position.y = 0.004;
      m.receiveShadow = true;
      m.userData.ref = { kind: 'room', id: r.id };
      this.content.add(m);
      this.objects.set('room:' + r.id, m);
    }

    for (const w of p.walls) {
      const g = this.buildWall(w, p);
      g.userData.ref = { kind: 'wall', id: w.id };
      this.content.add(g);
      this.objects.set('wall:' + w.id, g);
    }

    for (const it of p.items) {
      const def = getDef(it.type);
      if (this.lowWalls && def?.opening) continue;
      const g = buildItem(it, def);
      g.position.set(it.x / 100, (it.elev || 0) / 100, it.y / 100);
      g.rotation.y = -G.toRad(it.rotation);
      g.userData.ref = { kind: 'item', id: it.id };
      this.content.add(g);
      this.objects.set('item:' + it.id, g);
    }

    this.updateSun();
    this.updateHighlight();
  }

  buildWall(w, p) {
    const g = new THREE.Group();
    const L = G.wallLength(w);
    if (L < 1) return g;
    const ux = (w.x2 - w.x1) / L;
    const uy = (w.y2 - w.y1) / L;
    const t = w.thickness;
    const { ea, eb } = G.wallExtensions(w, p.walls);
    const H = this.lowWalls ? Math.min(w.height, 100) : w.height;
    const holes = [];
    for (const { it, def, s } of openingsOnWall(p, w)) {
      if (this.lowWalls && def.opening === 'window') continue;
      const a = Math.max(-ea, s - it.w / 2);
      const b = Math.min(L + eb, s + it.w / 2);
      if (b - a < 1) continue;
      holes.push({ a, b, bottom: it.elev || 0, top: (it.elev || 0) + it.h });
    }
    holes.sort((h1, h2) => h1.a - h2.a);
    const material = mat(w.color || DEFAULT_WALL_COLOR, { roughness: 0.92 });
    const piece = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.5 || y1 - y0 < 0.5) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry((s1 - s0) / 100, (y1 - y0) / 100, t / 100), material);
      m.position.set((s0 + s1) / 200, (y0 + y1) / 200, 0);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
    let cur = -ea;
    for (const hl of holes) {
      if (hl.a > cur) piece(cur, hl.a, 0, H);
      const a = Math.max(hl.a, cur);
      if (hl.bottom > 0) piece(a, hl.b, 0, Math.min(hl.bottom, H));
      if (hl.top < H) piece(a, hl.b, hl.top, H);
      cur = Math.max(cur, hl.b);
    }
    if (L + eb > cur) piece(cur, L + eb, 0, H);
    g.position.set(w.x1 / 100, 0, w.y1 / 100);
    g.rotation.y = -Math.atan2(uy, ux);
    return g;
  }

  bounds() {
    const b = G.projectBounds(store.project) || { minX: 0, minY: 0, maxX: 800, maxY: 600 };
    const w = Math.max(2, (b.maxX - b.minX) / 100);
    const d = Math.max(2, (b.maxY - b.minY) / 100);
    const h = Math.max(2.5, ...store.project.walls.map((x) => x.height / 100));
    return { cx: (b.minX + b.maxX) / 200, cz: (b.minY + b.maxY) / 200, size: Math.max(w, d), w, d, h };
  }

  updateSun() {
    const { cx, cz, size } = this.bounds();
    const s = this.sun;
    s.position.set(cx + size * 0.6, size * 1.3 + 4, cz + size * 0.45);
    s.target.position.set(cx, 0, cz);
    const half = size * 0.85 + 2;
    Object.assign(s.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: size * 4 + 20 });
    s.shadow.camera.updateProjectionMatrix();
  }

  fit() {
    const { cx, cz, w, d, h } = this.bounds();
    this.resize();
    // Distancia para que la esfera que envuelve el proyecto quepa en el campo de visión
    // más estrecho (vertical u horizontal), así funciona también en paneles angostos.
    const r = Math.hypot(w / 2, d / 2, h / 2);
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const dist = (r / Math.sin(Math.min(vHalf, hHalf))) * 0.95;
    const dir = new THREE.Vector3(0.3, 1.15, 0.75).normalize();
    this.controls.target.set(cx, h / 2, cz);
    this.camera.position.set(cx + dir.x * dist, h / 2 + dir.y * dist, cz + dir.z * dist);
    this.controls.update();
  }

  updateHighlight() {
    this.highlight.traverse((o) => o.geometry?.dispose());
    this.highlight.clear();
    this.content.updateMatrixWorld(true);
    for (const s of store.selection) {
      const obj = this.objects.get(s.kind + ':' + s.id);
      if (obj) this.highlight.add(new THREE.BoxHelper(obj, 0x2f7df6));
    }
  }

  setupPicking() {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (this.walking || !this.downAt || e.button !== 0) return;
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 4) return;
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      for (const h of this.raycaster.intersectObjects(this.content.children, true)) {
        let o = h.object;
        while (o && !o.userData.ref) o = o.parent;
        if (o) return store.setSelection([o.userData.ref]);
      }
      store.setSelection([]);
    });
  }

  // ---------------------------------------------------------------- Recorrido
  setupWalk() {
    this.walkControls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.move = { f: 0, b: 0, l: 0, r: 0, run: false };
    this.walkControls.addEventListener('lock', () => {
      this.walking = true;
      this.controls.enabled = false;
      this.emit('walkchange');
    });
    this.walkControls.addEventListener('unlock', () => this.exitWalk());
    const set = (e, v) => {
      if (!this.walking) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.move.f = v;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.move.b = v;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.move.l = v;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.move.r = v;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.move.run = !!v;
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', (e) => set(e, 1));
    window.addEventListener('keyup', (e) => set(e, 0));
    document.addEventListener('pointerlockerror', () => this.exitWalk());
  }

  startWalk() {
    if (this.walking) return;
    this.savedView = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    const { cx, cz } = this.bounds();
    // Empieza dentro de la habitación más grande, o en el centro del proyecto.
    let start = { x: cx, z: cz };
    const rooms = [...store.project.rooms].sort((a, b) => G.polygonArea(b.points) - G.polygonArea(a.points));
    if (rooms[0]) {
      const c = G.polygonCentroid(rooms[0].points);
      start = { x: c.x / 100, z: c.y / 100 };
    }
    this.camera.position.set(start.x, EYE, start.z);
    this.camera.lookAt(start.x + 1, EYE, start.z);
    this.walkControls.lock();
  }

  exitWalk() {
    if (!this.walking && !this.savedView) return;
    this.walking = false;
    this.move = { f: 0, b: 0, l: 0, r: 0, run: false };
    if (this.savedView) {
      this.camera.position.copy(this.savedView.pos);
      this.controls.target.copy(this.savedView.target);
      this.savedView = null;
    }
    this.camera.up.set(0, 1, 0);
    this.controls.enabled = true;
    this.controls.update();
    this.emit('walkchange');
  }

  updateWalk(dt) {
    const sp = (this.move.run ? 4 : 1.8) * dt;
    this.walkControls.moveForward((this.move.f - this.move.b) * sp);
    this.walkControls.moveRight((this.move.r - this.move.l) * sp);
    this.camera.position.y = EYE;
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
