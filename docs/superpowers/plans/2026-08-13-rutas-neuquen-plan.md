# Implementation Plan - Estado de Rutas Neuquén (GitHub Pages)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una aplicación web estática desplegable en GitHub Pages que descargue el reporte `ParteDiario.csv` de Vialidad del Neuquén y muestre el estado de transitabilidad en un mapa vectorial interactivo con panel desplegable de navegación.

**Architecture:** Aplicación web estática (Vanilla HTML/CSS/JS + Leaflet.js). Un mapa interactivo Leaflet renderiza trazas GeoJSON vectoriales asociadas dinámicamente con los tramos del CSV. GitHub Actions descarga `ParteDiario.csv` periódicamente para garantizar alta disponibilidad sin bloqueos CORS.

**Tech Stack:** HTML5, CSS3 Vanilla (Responsive Design), JavaScript (ES6 Modules/Vanilla), Leaflet.js (Mapas Vectoriales), PapaParse/Custom CSV parser, GitHub Actions, GitHub Pages.

## Global Constraints
- **Model / Tone:** Español Rioplatense con voseo. Sin rodeos ni rellenos de cortesía.
- **Sin Tailwind:** CSS Vanilla puro con variables de diseño (Design Tokens).
- **Deployment:** Compatible 100% con GitHub Pages (`martinvilu/rutas-neuquen`).

---

### Task 1: Scaffolding y Preparación de Archivos de Datos

**Files:**
- Create: `data/ParteDiario.csv`
- Create: `data/neuquen_routes.geojson`

**Interfaces:**
- Consumes: URL `https://w2.dpvneuquen.gov.ar/ParteDiario.csv` y Overpass OSM API.
- Produces: Datasets estáticos en carpeta `data/`.

- [ ] **Step 1: Verificar existencia del GeoJSON y CSV**
  Run: `ls -l data/ParteDiario.csv data/neuquen_routes.geojson`

- [ ] **Step 2: Asegurar copias locales de datos**
  Run: `curl -s -k "https://w2.dpvneuquen.gov.ar/ParteDiario.csv" > data/ParteDiario.csv`

- [ ] **Step 3: Commit de datos iniciales**
  Run: `git add data/ && git commit -m "data: agregar geojson de rutas y copia inicial de ParteDiario.csv"`

---

### Task 2: Estructura HTML y Sistema de Estilos CSS

**Files:**
- Create: `index.html`
- Create: `styles.css`

**Interfaces:**
- Consumes: CDNs de Leaflet (`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`, JS) y Google Fonts (Inter / Outfitter).
- Produces: Estructura DOM con mapa `#map`, panel lateral desplegable `#sidebar`, barra de búsqueda, controles de filtro y modal de detalle.

- [ ] **Step 1: Crear `index.html` con semántica completa y meta SEO**
  Escribir `index.html` incluyendo:
  - Header compacto con título "Estado de Rutas - Neuquén".
  - Panel desplegable `#sidebar` con buscador, selector de ruta, filtro por estado (Todos, Intransitable, Precaución, Normal) y lista de tarjetas de tramo.
  - Div `#map` para Leaflet.
  - Modal o Drawer para observaciones completas de un tramo.

- [ ] **Step 2: Crear `styles.css` con variables CSS y diseño responsive**
  Escribir `styles.css` con tema oscuro premium (Slate/Navy):
  - Design Tokens (`--bg-primary`, `--bg-card`, `--accent-red`, `--accent-warning`, `--accent-success`, `--text-main`).
  - Layout flex/grid fluido.
  - Animaciones micro-interactivas para desplegar panel lateral y tarjetas.
  - Media queries para móviles y desktops.

- [ ] **Step 3: Validar apertura estática y estructura**
  Run: `python3 -m http.server 8080` (verificación breve)

- [ ] **Step 4: Commit UI Base**
  Run: `git add index.html styles.css && git commit -m "ui: crear estructura html y hojas de estilo css para mapa de rutas"`

---

### Task 3: Lógica JS, Parser CSV y Renderizado de Mapa Vectorial

**Files:**
- Create: `app.js`

**Interfaces:**
- Consumes: `data/ParteDiario.csv`, `data/neuquen_routes.geojson`, Leaflet global `L`.
- Produces: Mapeo de datos a capas vectoriales, actualización de UI en tiempo real, búsqueda y filtrado dinámico.

- [ ] **Step 1: Implementar `app.js` con parser CSV y fetching con fallbacks**
  - Función `loadData()` que intenta fetch directo / proxy CORS / `data/ParteDiario.csv`.
  - Parser robusto de CSV (manejo de comillas, saltos de línea y codificación UTF-8).

- [ ] **Step 2: Implementar renderizado en Leaflet**
  - Inicializar mapa centrado en provincia de Neuquén `[-38.95, -70.05]`, zoom 7.
  - Cargar `neuquen_routes.geojson` y emparejar trazas con `RutaNumero` / `RutaProvincial`.
  - Asignar colores según `RutaEstado`:
    - 🔴 Intransitable (`I`): `#ef4444`
    - 🟠 Transitable con Precaución (`TCP`): `#f59e0b`
    - 🟢 Transitable Normal (`T`): `#10b981`
  - Popups interactivos al hacer click sobre cualquier tramo en el mapa.

- [ ] **Step 3: Conectar buscador, filtro desplegable y lista de tramos**
  - Filtrado en tiempo real al escribir en la barra de búsqueda o cambiar el desplegable.
  - Selección de tramo en la lista centra automáticamente el mapa en esa ruta.

- [ ] **Step 4: Probar interactividad con navegador/servidor local**
  Run: `python3 -m http.server 8080 &` y verificar carga de datos.

- [ ] **Step 5: Commit Lógica JS**
  Run: `git add app.js && git commit -m "feat: implementar mapa vectorial interactivo y parser de ParteDiario.csv"`

---

### Task 4: Workflow de GitHub Actions y Publicación GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: GitHub Actions runner, `w2.dpvneuquen.gov.ar/ParteDiario.csv`.
- Produces: Despliegue automático a GitHub Pages.

- [ ] **Step 1: Crear `.github/workflows/deploy.yml`**
  Configurar workflow con:
  - Eventos: `schedule` (`0 * * * *`), `workflow_dispatch`, `push` a branch `main`.
  - Job `fetch-and-deploy`:
    - Paso `curl` para descargar `https://w2.dpvneuquen.gov.ar/ParteDiario.csv` a `data/ParteDiario.csv`.
    - Commit si hay cambios o uso directo de `actions/deploy-pages`.

- [ ] **Step 2: Crear `README.md`**
  Documentar el proyecto, origen de datos, enlace a GitHub Pages y forma de uso.

- [ ] **Step 3: Commit configuración de despliegue**
  Run: `git add .github/ README.md && git commit -m "ci: agregar workflow de GitHub Actions y documentación"`

---

### Task 5: Creación del Repositorio GitHub y Push Inicial

**Files:**
- Repository: `martinvilu/rutas-neuquen`

**Interfaces:**
- Consumes: GitHub CLI (`gh`).
- Produces: Repositorio público en GitHub con GitHub Pages habilitado.

- [ ] **Step 1: Inicializar git si no lo está**
  Run: `git init` (si aplica) y renombrar branch a `main`: `git branch -M main`

- [ ] **Step 2: Crear el repositorio en GitHub mediante `gh`**
  Run: `gh repo create martinvilu/rutas-neuquen --public --source=. --remote=origin --push`

- [ ] **Step 3: Activar GitHub Pages en el repositorio**
  Run: `gh api repos/martinvilu/rutas-neuquen/pages -X POST -f "build_type=workflow"` o `gh repo edit --enable-pages`

- [ ] **Step 4: Verificar URL publicada**
  Poner a disposición del usuario la URL final: `https://martinvilu.github.io/rutas-neuquen/`
