// Estado global: proyecto, selección, historial (deshacer/rehacer) y autoguardado.

import { emptyProject, normalizeProject } from './model.js';
import { uid } from './geometry.js';

const KEY = 'disenador-espacios:v1';
const MAX_HISTORY = 150;

class Store extends EventTarget {
  constructor() {
    super();
    this.project = emptyProject();
    this.selection = []; // [{ kind: 'wall' | 'room' | 'item', id }]
    this.undoStack = [];
    this.redoStack = [];
    this._saveTimer = null;
    // Imágenes (planos de fondo) guardadas aparte del proyecto, para que el historial
    // de deshacer no duplique datos pesados. El proyecto solo guarda su identificador.
    this.assets = {};
    this._savedAssets = '';
  }

  addAsset(dataUrl) {
    const id = 'img_' + uid();
    this.assets[id] = dataUrl;
    return id;
  }
  referencedAssets() {
    const out = {};
    const id = this.project.background?.asset;
    if (id && this.assets[id]) out[id] = this.assets[id];
    return out;
  }

  emit(type) {
    this.dispatchEvent(new Event(type));
  }

  collection(kind) {
    return this.project[kind + 's'];
  }
  find(kind, id) {
    return this.collection(kind)?.find((e) => e.id === id);
  }

  // ---- Historial ----
  checkpoint() {
    this.undoStack.push(JSON.stringify(this.project));
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack.length = 0;
    this.emit('history');
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.undoStack.pop());
    this.afterHistoryJump();
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.redoStack.pop());
    this.afterHistoryJump();
  }
  afterHistoryJump() {
    this.pruneSelection();
    this.changed();
    this.emit('history');
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  changed() {
    this.emit('change');
    this.queueSave();
  }

  // ---- Selección ----
  setSelection(sel) {
    this.selection = sel;
    this.emit('selection');
  }
  isSelected(kind, id) {
    return this.selection.some((s) => s.kind === kind && s.id === id);
  }
  selectedEntities() {
    return this.selection.map((s) => ({ ...s, obj: this.find(s.kind, s.id) })).filter((s) => s.obj);
  }
  pruneSelection() {
    this.selection = this.selection.filter((s) => this.find(s.kind, s.id));
    this.emit('selection');
  }
  deleteSelection() {
    if (!this.selection.length) return;
    this.checkpoint();
    for (const s of this.selection) {
      const arr = this.collection(s.kind);
      const i = arr.findIndex((e) => e.id === s.id);
      if (i >= 0) arr.splice(i, 1);
    }
    this.selection = [];
    this.emit('selection');
    this.changed();
  }

  // ---- Carga / guardado ----
  load(project, { keepHistory = false } = {}) {
    if (keepHistory) this.checkpoint();
    else {
      this.undoStack = [];
      this.redoStack = [];
    }
    const { assets, ...rest } = project || {};
    if (assets && typeof assets === 'object') Object.assign(this.assets, assets);
    this.project = normalizeProject(rest);
    this.selection = [];
    this.emit('selection');
    this.changed();
    this.emit('history');
    this.emit('loaded');
  }
  queueSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.project));
      } catch {
        /* almacenamiento lleno o no disponible */
      }
      const assetKey = Object.keys(this.referencedAssets()).join(',');
      if (assetKey !== this._savedAssets) {
        try {
          localStorage.setItem(KEY + ':assets', JSON.stringify(this.referencedAssets()));
          this._savedAssets = assetKey;
        } catch {
          /* la imagen no cabe en el navegador: se conserva al guardar el proyecto como archivo */
        }
      }
    }, 400);
  }
  /** Proyecto listo para guardar en un archivo, con sus imágenes incluidas. */
  exportData() {
    const assets = this.referencedAssets();
    return Object.keys(assets).length ? { ...this.project, assets } : this.project;
  }
  restore() {
    try {
      const a = localStorage.getItem(KEY + ':assets');
      if (a) {
        this.assets = JSON.parse(a) || {};
        this._savedAssets = Object.keys(this.assets).join(',');
      }
    } catch {
      /* se ignora */
    }
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        this.project = normalizeProject(JSON.parse(s));
        return true;
      }
    } catch {
      /* datos corruptos: se ignora */
    }
    return false;
  }
}

export const store = new Store();
