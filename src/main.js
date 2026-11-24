// Punto de entrada: conecta el estado, el editor 2D, la vista 3D y los paneles de la interfaz.

import './styles.css';
import { store } from './state.js';
import { Editor2D } from './editor2d.js';
import { View3D } from './view3d.js';
import { PropsPanel } from './props.js';
import { buildCatalog } from './catalogPanel.js';
import { TEMPLATES } from './templates.js';
import { openPlanImport, isPlanFile, PLAN_ACCEPT } from './planImport.js';
import { openScaleDialog } from './scaleDialog.js';
import { h } from './dom.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// Primer arranque: se muestra el apartamento de ejemplo.
if (!store.restore()) store.project = TEMPLATES.find((t) => t.id === 'casa').build();

const editor = new Editor2D($('#canvas2d'));
const view3d = new View3D($('#pane3d'));
new PropsPanel($('#props'), editor);
buildCatalog($('#catalogList'), $('#catalogSearch'), editor);

// ---------------------------------------------------------------- Vistas
let viewMode = localStorage.getItem('disenador-espacios:vista') || '2d';
function setView(mode) {
  viewMode = mode;
  localStorage.setItem('disenador-espacios:vista', mode);
  $('#viewport').dataset.view = mode;
  $$('#viewMode button').forEach((b) => b.classList.toggle('active', b.dataset.view === mode));
  requestAnimationFrame(() => {
    editor.resize();
    view3d.setActive(mode !== '2d');
  });
}
$$('#viewMode button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
setView(viewMode);
requestAnimationFrame(() => requestAnimationFrame(() => editor.fit()));

// ---------------------------------------------------------------- Herramientas
const HINTS = {
  select: 'Clic: seleccionar · Arrastrar: mover · Arrastrar en vacío: selección múltiple · Rueda: zoom · Clic derecho o Espacio + arrastrar: desplazar',
  wall: 'Clic para empezar y clic en cada esquina · Doble clic, Enter o clic derecho para terminar · Cierra el contorno para crear el suelo · Shift: ángulos de 15°',
  room: 'Arrastra para dibujar una habitación rectangular con sus cuatro muros',
  measure: 'Arrastra para medir una distancia',
  scale: 'Corregir escala: arrastra sobre una medida conocida (un muro, una cota del plano de fondo…) y luego indica cuánto mide en la realidad',
};
function setTool(t) {
  editor.setTool(t);
}
editor.addEventListener('tool', (e) => {
  $$('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === e.detail));
  $('#statusHint').textContent = HINTS[e.detail] || '';
});
$$('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
$('#statusHint').textContent = HINTS.select;

editor.addEventListener('cursor', (e) => {
  const { x, y } = e.detail;
  $('#statusCoords').textContent = `X ${(x / 100).toFixed(2)} m · Y ${(y / 100).toFixed(2)} m`;
});
const updateZoom = () => ($('#statusZoom').textContent = `Zoom ${Math.round(editor.scale * 100)} %`);
editor.addEventListener('view', updateZoom);
updateZoom();

$('#zoomIn').addEventListener('click', () => editor.zoomBy(1.25));
$('#zoomOut').addEventListener('click', () => editor.zoomBy(0.8));
$('#zoomFit').addEventListener('click', () => editor.fit());

// ---------------------------------------------------------------- 3D
$('#btn3dFit').addEventListener('click', () => view3d.fit());
$('#chkLowWalls').addEventListener('change', (e) => view3d.setLowWalls(e.target.checked));
$('#btnWalk').addEventListener('click', () => view3d.startWalk());
view3d.addEventListener('walkchange', () => ($('#walkHint').hidden = !view3d.walking));

// ---------------------------------------------------------------- Proyecto
const nameInput = $('#projectName');
const syncName = () => {
  if (document.activeElement !== nameInput) nameInput.value = store.project.name;
};
syncName();
nameInput.addEventListener('change', () => {
  store.project.name = nameInput.value.trim() || 'Proyecto sin título';
  store.changed();
});
nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && nameInput.blur());
store.addEventListener('change', syncName);
store.addEventListener('loaded', () => {
  syncName();
  requestAnimationFrame(() => editor.fit());
});

const updateHistory = () => {
  $('#btnUndo').disabled = !store.canUndo;
  $('#btnRedo').disabled = !store.canRedo;
};
store.addEventListener('history', updateHistory);
updateHistory();
$('#btnUndo').addEventListener('click', () => store.undo());
$('#btnRedo').addEventListener('click', () => store.redo());

const hasContent = () => store.project.walls.length + store.project.items.length + store.project.rooms.length > 0;
function loadTemplate(t) {
  if (hasContent() && !confirm(`Se reemplazará el proyecto actual por «${t.name}».\nPuedes recuperarlo con Deshacer (Ctrl+Z). ¿Continuar?`)) return;
  store.load(t.build(), { keepHistory: true });
}
$('#btnNew').addEventListener('click', () => loadTemplate(TEMPLATES[0]));
$('#templatesMenu').append(
  ...TEMPLATES.map((t) =>
    h('button', { onclick: () => (closeMenus(), loadTemplate(t)) }, h('strong', {}, t.name), h('small', {}, t.desc)),
  ),
);

// Menús desplegables
function closeMenus() {
  $$('.dropdown.open').forEach((d) => d.classList.remove('open'));
}
$$('[data-menu]').forEach((b) =>
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = b.parentElement;
    const open = dd.classList.contains('open');
    closeMenus();
    dd.classList.toggle('open', !open);
  }),
);
document.addEventListener('click', closeMenus);

// Archivos
const fileSafe = (n) => (n || 'proyecto').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'proyecto';
function download(filename, href) {
  const a = h('a', { href, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}
function saveFile() {
  const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(fileSafe(store.project.name) + '.json', url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$('#btnSave').addEventListener('click', saveFile);
$('#btnOpen').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data || typeof data !== 'object' || !Array.isArray(data.walls)) throw new Error('formato');
    store.load(data, { keepHistory: true });
  } catch {
    alert('No se pudo abrir el archivo: no parece un proyecto válido del Diseñador de Espacios.');
  }
});
// Corregir escala: al terminar de marcar la línea con la herramienta Escala.
editor.addEventListener('scalemeasure', async (e) => {
  const applied = await openScaleDialog(e.detail);
  editor.cancelOps();
  setTool('select');
  if (applied) {
    editor.fit();
    view3d.fit();
  }
});

// Importar plano (imagen o PDF): botón o soltar el archivo sobre el plano.
const planInput = h('input', { type: 'file', accept: PLAN_ACCEPT, hidden: true });
document.body.append(planInput);
$('#btnImportPlan').addEventListener('click', () => planInput.click());
planInput.addEventListener('change', () => {
  const f = planInput.files[0];
  planInput.value = '';
  if (f) openPlanImport(f);
});
editor.addEventListener('filedrop', (e) => {
  const f = e.detail;
  if (isPlanFile(f)) openPlanImport(f);
  else alert('Para importar un plano usa una imagen (PNG, JPG…) o un PDF.');
});

$$('[data-export]').forEach((b) =>
  b.addEventListener('click', () => {
    closeMenus();
    const name = fileSafe(store.project.name);
    const kind = b.dataset.export;
    if (kind === 'json') return saveFile();
    if (kind === 'png2d') return download(`${name} - plano.png`, editor.exportPNG());
    if (kind === 'png3d') {
      if (viewMode === '2d') setView('split');
      setTimeout(() => download(`${name} - 3D.png`, view3d.screenshot()), 150);
    }
  }),
);

// ---------------------------------------------------------------- Teclado
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
  if (view3d.walking || document.querySelector('.modal-backdrop')) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) {
    if (k === 'z' && !e.shiftKey) store.undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) store.redo();
    else if (k === 'd') editor.duplicateSelection();
    else if (k === 's') saveFile();
    else if (k === 'a') editor.selectAll();
    else return;
    e.preventDefault();
    return;
  }
  const step = e.shiftKey ? 10 : 1;
  switch (k) {
    case 'v':
      setTool('select');
      break;
    case 'm':
      setTool('wall');
      break;
    case 'h':
      setTool('room');
      break;
    case 'd':
      setTool('measure');
      break;
    case 'k':
      setTool('scale');
      break;
    case 'delete':
    case 'backspace':
      store.deleteSelection();
      break;
    case 'escape':
      editor.escape();
      break;
    case 'enter':
      editor.finishChain();
      break;
    case 'r':
      editor.rotateSelection(e.shiftKey ? -90 : 90);
      break;
    case 'q':
      editor.rotateSelection(-15);
      break;
    case 'e':
      editor.rotateSelection(15);
      break;
    case 'f':
      editor.fit();
      view3d.fit();
      break;
    case 'arrowleft':
      editor.nudge(-step, 0);
      break;
    case 'arrowright':
      editor.nudge(step, 0);
      break;
    case 'arrowup':
      editor.nudge(0, -step);
      break;
    case 'arrowdown':
      editor.nudge(0, step);
      break;
    case ' ':
      editor.keys.space = true;
      break;
    default:
      return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') editor.keys.space = false;
});

// Para depurar desde la consola del navegador.
window.app = { store, editor, view3d, openPlanImport };
