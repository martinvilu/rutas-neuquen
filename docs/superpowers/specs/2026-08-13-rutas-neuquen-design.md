# Especificación de Diseño: Mapa de Rutas de Neuquén (GitHub Pages)

## 1. Objetivo
Crear una aplicación web estática desplegada en GitHub Pages que descargue e interprete el archivo `ParteDiario.csv` de la Dirección Provincial de Vialidad del Neuquén (`https://w2.dpvneuquen.gov.ar/ParteDiario.csv`) y muestre el estado de las rutas sobre un mapa vectorial interactivo de la provincia.

## 2. Arquitectura de Datos y GitHub Pages
- **Repositorio**: `martinvilu/rutas-neuquen` en GitHub.
- **Workflow de GitHub Actions** (`.github/workflows/deploy.yml`):
  - Ejecución programada (cron cada hora) y por push/dispatch.
  - Descarga `ParteDiario.csv` a `data/ParteDiario.csv`.
  - Publica la aplicación estática directamente en GitHub Pages (`actions/deploy-pages`).
- **Resiliencia de Carga en Frontend**:
  1. Intenta fetch dinámico con proxy CORS.
  2. Si el servidor provincial está caído o bloqueado por CORS, recae automáticamente en `data/ParteDiario.csv` servido desde el propio origen de GitHub Pages.

## 3. Componentes de Interfaz y Mapa Vectorial
- **Mapa Interactivo (Leaflet.js + GeoJSON Vectorial)**:
  - Visualización del límite provincial de Neuquén y las trazas de las rutas (RN 40, RN 22, RN 237, RP 7, RP 13, RP 17, RP 23, RP 43, RP 46, RP 5, etc.).
  - Código de colores según estado de `ParteDiario.csv`:
    - 🔴 **Rojo (`I`)**: Intransitable.
    - 🟠 **Naranja/Amarillo (`TCP`)**: Transitable con Precaución.
    - 🟢 **Verde (`T`)**: Transitable Normal.
  - Interacción: Click en tramos abre popup con detalle (`RutaTramo`, `RutaTipo`, `RutaLongitud`, `RutaObservacion`, `RutaSeccion`, `Fecha`, `Hora`).
- **Panel Desplegable / Lateral Responsive**:
  - Buscador de tramos por localidad o número de ruta.
  - Dropdown desplegable para filtrar por ruta específica o estado de transitabilidad.
  - Estadísticas rápidas (total de tramos, intransitables, precaución).
  - Indicador de última actualización.

## 4. Estructura del Proyecto
```
.
├── .github/
│   └── workflows/
│       └── deploy.yml
├── data/
│   ├── ParteDiario.csv
│   └── neuquen_routes.geojson
├── index.html
├── styles.css
├── app.js
└── README.md
```
