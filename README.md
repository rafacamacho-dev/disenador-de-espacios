# Diseñador de Espacios

Aplicación web para diseñar habitaciones, casas, baños, cocinas y espacios en general:
dibujas el plano en 2D y lo ves al instante en 3D, con recorrido virtual en primera persona.

## Cómo ejecutarlo

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```powershell
npm install
npm run dev
```

Abre <http://localhost:5173> en el navegador.

Para generar una versión publicable (carpeta `dist/`):

```powershell
npm run build
```

## Qué puedes hacer

- **Muros**: herramienta *Muro* (M). Clic en cada esquina; doble clic, Enter o clic derecho para terminar.
  Si cierras el contorno volviendo al primer punto, se crea también el suelo de la habitación.
  Se ajusta a la cuadrícula, a esquinas y muros existentes, y alinea con otros vértices.
- **Habitaciones**: herramienta *Habitación* (H). Arrastra un rectángulo y se crean el suelo y los cuatro muros
  (sin duplicar los muros que ya existen).
- **Muebles**: más de 30 elementos en 8 categorías (dormitorio, sala, comedor, cocina, baño, oficina,
  decoración y aberturas). Arrástralos al plano o haz clic para añadirlos. Se "imantan" a las paredes.
- **Puertas y ventanas**: se pegan al muro más cercano, se alinean con él y abren el hueco en 3D.
- **Editar**: mover, rotar (asa azul o teclas R / Q / E), redimensionar (asa de la esquina), cambiar
  medidas exactas, color, elevación y tipo de suelo desde el panel derecho. Arrastrar una esquina de un
  muro estira también los muros y suelos conectados.
- **Selección múltiple**: arrastra en una zona vacía o usa Shift + clic.
- **Medir**: herramienta *Medir* (D).
- **Corregir escala**: herramienta *Corregir escala* (K). Arrastra sobre una medida conocida
  (un muro, una cota del plano de fondo…) y escribe cuánto mide en la realidad: todo el proyecto
  y el plano de fondo se reescalan. Los muebles conservan su tamaño real. Se puede deshacer.
- **Vista 3D**: órbita con el ratón, opción de *muros bajos* para ver el interior y *recorrido virtual*
  (W A S D + ratón, Esc para salir). Clic en un objeto 3D para seleccionarlo.
- **Plantillas**: dormitorio, baño, cocina, sala-comedor y un apartamento de 2 habitaciones.
- **Importar un plano** (imagen PNG/JPG/WEBP… o PDF): botón *Importar plano* o arrastra el archivo
  sobre el lienzo. El programa detecta muros, puertas (con su lado de apertura y bisagra), ventanas,
  pasos abiertos y habitaciones, y crea el proyecto en 2D y 3D. Antes de crear puedes:
  - **Calibrar la escala**: marca dos puntos sobre una medida conocida y escribe cuánto mide.
    Sin calibrar, la escala se estima a partir del grosor de los muros.
  - **Ajustar la detección** con la vista previa en vivo (umbral, grosor mínimo de muro).
  - Conservar el plano como **fondo para calcar** (se puede ocultar, atenuar o quitar).

  Se ha probado con planos de muros rellenos, tipo CAD (muros con contorno, también a color),
  a color de catálogo inmobiliario, cianotipos (blanco sobre azul), láminas técnicas con marco,
  cajetín, cotas y ejes, varias plantas en una hoja, escaneos torcidos (hasta ±12°) y planos de
  baja resolución. Distingue puertas abatibles (con su lado de apertura y bisagra), puertas
  correderas, ventanas y pasos abiertos, muros exteriores e interiores de distinto grosor y
  chaflanes (muros en diagonal entre dos muros rectos). No reconoce muros curvos. Las habitaciones
  se crean como «Espacio 1, 2…» para que les pongas nombre.
- **Guardar**: el proyecto se guarda solo en el navegador. También puedes guardarlo/abrirlo como
  archivo `.json` y exportar el plano o la vista 3D como imagen PNG.
- **Deshacer / rehacer** ilimitado durante la sesión (Ctrl+Z / Ctrl+Y).

## Estructura del código

| Archivo | Contenido |
| --- | --- |
| `src/main.js` | Arranque y conexión de la interfaz (barra superior, teclado, archivos) |
| `src/state.js` | Estado global: proyecto, selección, historial y autoguardado |
| `src/model.js` | Modelo de datos (muros, habitaciones, objetos) y operaciones |
| `src/editor2d.js` | Editor del plano en `<canvas>`: herramientas, ajustes, selección y dibujo |
| `src/view3d.js` | Escena Three.js: suelos, muros con huecos, muebles, cámara y recorrido |
| `src/catalog.js` | Catálogo de muebles: medidas y símbolos 2D |
| `src/furniture3d.js` | Modelos 3D de cada mueble |
| `src/textures.js` | Texturas de suelo generadas por código |
| `src/templates.js` | Plantillas de proyectos |
| `src/props.js` / `src/catalogPanel.js` | Paneles de propiedades y de catálogo |
| `src/planDetect.js` | Detección de muros, aberturas y habitaciones en la imagen de un plano |
| `src/planImport.js` | Diálogo de importación: carga de imagen/PDF, escala, vista previa y creación del proyecto |
| `tests/deteccion.html` | Pruebas de la detección con 12 planos sintéticos de distintos estilos (abrir con `npm run dev`) |
| `tests/fixtures.js`, `tests/styles.js` | Generadores de esos planos de prueba |

Todas las medidas del plano se guardan en centímetros; en 3D se usan metros.

### Añadir un mueble nuevo

1. Agrega una entrada a `CATALOG` en `src/catalog.js` con su tipo, nombre, categoría, medidas, color,
   una función `draw` (símbolo en planta) y el nombre de su constructor 3D en `build`.
2. Si necesita un modelo propio, añade una función con ese nombre al objeto `B` de `src/furniture3d.js`.
