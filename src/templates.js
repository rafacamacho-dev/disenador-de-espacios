// Plantillas de proyectos listos para editar. Coordenadas en cm; muros de 15 cm,
// por lo que la cara interior de un muro está a 7,5 cm de su eje.
//
// Rotaciones para apoyar un mueble contra un muro (el respaldo mira al muro):
//   muro de arriba: 0 · muro derecho: 90 · muro de abajo: 180 · muro izquierdo: 270

import { emptyProject, addRoom, addItem, rectPoints } from './model.js';

function make(name) {
  const p = emptyProject();
  p.name = name;
  return {
    p,
    room: (n, x, y, w, h, floor) => addRoom(p, n, rectPoints(x, y, w, h), floor, true),
    item: (type, x, y, rot = 0, over = {}) => addItem(p, type, x, y, rot, over),
  };
}

function dormitorio() {
  const { p, room, item } = make('Dormitorio');
  room('Dormitorio', 0, 0, 400, 360, 'madera');
  item('alfombra', 200, 200, 0, { w: 220, d: 150, color: '#b9a88f' });
  item('cama_doble', 200, 107.5);
  item('mesa_noche', 97.5, 27.5);
  item('mesa_noche', 302.5, 27.5);
  item('armario', 37.5, 260, 270);
  item('comoda', 125, 330, 180);
  item('escritorio', 362.5, 250, 90);
  item('silla_oficina', 300, 250, 270);
  item('planta', 370, 40);
  item('ventana', 400, 250, 90);
  item('puerta', 330, 360, 180);
  return p;
}

function bano() {
  const { p, room, item } = make('Baño');
  room('Baño', 0, 0, 260, 220, 'ceramica');
  item('banera', 92.5, 45);
  item('inodoro', 220, 70, 90);
  item('lavabo', 190, 190, 180, { w: 70 });
  item('espejo', 190, 211, 180, { w: 70 });
  item('alfombra', 92.5, 112, 0, { w: 70, d: 45, color: '#9fc5d6' });
  item('ventana', 260, 150, 90, { w: 60, h: 60, elev: 150 });
  item('puerta', 70, 220, 180, { w: 75 });
  return p;
}

function cocina() {
  const { p, room, item } = make('Cocina');
  room('Cocina', 0, 0, 360, 300, 'baldosa');
  item('nevera', 42.5, 42.5);
  item('encimera', 127.5, 37.5);
  item('fregadero', 217.5, 37.5);
  item('estufa', 287.5, 37.5);
  item('encimera', 335, 37.5, 0, { w: 35 });
  item('alacena', 127.5, 25, 0);
  item('alacena', 305, 25, 0, { w: 95 });
  item('ventana', 217.5, 0, 0, { w: 100, h: 100, elev: 105 });
  item('mesa_redonda', 240, 180);
  item('silla', 165, 180, 270);
  item('silla', 315, 180, 90);
  item('silla', 240, 255, 180);
  item('planta', 40, 160);
  item('puerta', 0, 230, 270);
  return p;
}

function sala() {
  const { p, room, item } = make('Sala y comedor');
  room('Sala y comedor', 0, 0, 600, 420, 'madera');
  item('alfombra', 160, 270, 0, { w: 240, d: 170 });
  item('sofa_3', 160, 367.5, 180);
  item('mesa_centro', 160, 270);
  item('mueble_tv', 160, 30);
  item('tv', 160, 30);
  item('sillon', 60, 240, 270);
  item('estanteria', 25, 110, 270);
  item('lampara_pie', 35, 385);
  item('planta', 295, 385);
  item('mesa_comedor', 450, 210);
  for (const x of [420, 480]) {
    item('silla', x, 140, 0);
    item('silla', x, 280, 180);
  }
  item('silla', 345, 210, 270);
  item('silla', 555, 210, 90);
  item('ventana', 450, 0, 0, { w: 150 });
  item('ventanal', 600, 210, 90, { w: 200 });
  item('puerta', 450, 420, 180, { w: 90 });
  return p;
}

function casa() {
  const { p, room, item } = make('Apartamento de 2 habitaciones');
  // Las habitaciones grandes primero, para que los muros compartidos no se dupliquen.
  room('Sala · Comedor · Cocina', 0, 0, 600, 450, 'madera');
  room('Dormitorio principal', 600, 0, 400, 450, 'madera_oscura');
  room('Dormitorio 2', 0, 450, 380, 350, 'madera');
  room('Baño', 380, 450, 220, 350, 'ceramica');
  room('Estudio', 600, 450, 400, 350, 'madera');

  // Puertas
  item('puerta', 0, 395, 270, { w: 90 });
  item('puerta', 600, 380, 270);
  item('puerta', 300, 450, 0);
  item('puerta', 490, 450, 0, { w: 75 });
  item('puerta', 940, 450, 0);

  // Ventanas
  item('ventana', 0, 170, 90);
  item('ventana', 422.5, 0, 0, { w: 100, h: 100, elev: 105 });
  item('ventana', 1000, 225, 90, { w: 150 });
  item('ventana', 190, 800, 0);
  item('ventana', 490, 800, 0, { w: 60, h: 60, elev: 150 });
  item('ventana', 1000, 625, 90, { w: 150 });
  item('ventana', 800, 800, 0);

  // Cocina
  item('encimera', 356.25, 37.5, 0, { w: 52.5 });
  item('fregadero', 422.5, 37.5);
  item('estufa', 492.5, 37.5);
  item('nevera', 557.5, 42.5);
  item('alacena', 356.25, 25, 0, { w: 52.5 });
  item('alacena', 492.5, 25, 0, { w: 60 });

  // Comedor
  item('mesa_comedor', 440, 300);
  for (const x of [400, 480]) {
    item('silla', x, 232, 0);
    item('silla', x, 368, 180);
  }
  item('silla', 337, 300, 270);
  item('silla', 543, 300, 90);

  // Sala
  item('alfombra', 175, 200, 0, { w: 240, d: 160 });
  item('mueble_tv', 150, 30);
  item('tv', 150, 30);
  item('sofa_3', 175, 300, 180);
  item('mesa_centro', 175, 200);
  item('sillon', 50, 170, 270);
  item('planta', 300, 60);

  // Dormitorio principal
  item('alfombra', 800, 230, 0, { w: 200, d: 140, color: '#9aa7b8' });
  item('cama_doble', 800, 107.5);
  item('mesa_noche', 697.5, 27.5);
  item('mesa_noche', 902.5, 27.5);
  item('armario', 780, 412.5, 180, { w: 180 });
  item('planta', 960, 40);

  // Dormitorio 2
  item('cama_individual', 102.5, 560, 270);
  item('mesa_noche', 27.5, 480, 270);
  item('escritorio', 190, 762.5, 180);
  item('silla_oficina', 190, 700, 0);
  item('armario', 342.5, 700, 90);

  // Baño
  item('banera', 472.5, 755, 180);
  item('inodoro', 420, 640, 270);
  item('lavabo', 570, 600, 90);
  item('espejo', 591, 600, 90);

  // Estudio
  item('escritorio', 957.5, 625, 90, { w: 140, d: 70 });
  item('silla_oficina', 880, 625, 270);
  item('estanteria', 625, 620, 270);
  item('estanteria', 625, 720, 270);
  item('sofa_2', 800, 747.5, 180, { color: '#a1705a' });
  item('planta', 960, 760);
  return p;
}

export const TEMPLATES = [
  { id: 'vacio', name: 'Proyecto vacío', desc: 'Empieza desde cero', build: () => make('Proyecto sin título').p },
  { id: 'dormitorio', name: 'Dormitorio', desc: '4,0 × 3,6 m', build: dormitorio },
  { id: 'bano', name: 'Baño', desc: '2,6 × 2,2 m', build: bano },
  { id: 'cocina', name: 'Cocina', desc: '3,6 × 3,0 m', build: cocina },
  { id: 'sala', name: 'Sala y comedor', desc: '6,0 × 4,2 m', build: sala },
  { id: 'casa', name: 'Apartamento 2 habitaciones', desc: '10 × 8 m · 5 espacios', build: casa },
];
