# 🛣️ Estado de Rutas — Neuquén y Río Negro

Aplicación web interactiva para visualizar en tiempo real el estado de transitabilidad de las rutas provinciales y nacionales en **Neuquén** y **Río Negro**, combinando datos de la **Dirección Provincial de Vialidad del Neuquén (DPV)** y **Vialidad Nacional**.

![Estado de Rutas - Neuquén y Río Negro](https://img.shields.io/badge/Estado-En_L%C3%ADnea-brightgreen)
![GitHub Pages](https://img.shields.io/badge/Despliegue-GitHub_Pages-blue)

## 📌 Características
- 🗺️ **Mapa Vectorial Interactivo**: Trazas de rutas renderizadas sobre un mapa interactivo con Leaflet.js.
- 🎨 **Código de Colores de Transitabilidad**:
  - 🟢 **Verde**: Normal / Transitable.
  - 🟠 **Naranja/Amarillo**: Transitable con Precaución.
  - 🔴 **Rojo**: Intransitable / Cortada.
- 🎛️ **Filtros Avanzados**: Búsqueda por localidad o tramo, filtrado por provincia (Neuquén / Río Negro), por ruta y por estado.
- 🔄 **Actualización Automática**: GitHub Actions descarga automáticamente el parte diario cada 1 hora y actualiza el sitio sin problemas de CORS.

## 📊 Fuentes de Datos
1. **Dirección Provincial de Vialidad del Neuquén**: `https://w2.dpvneuquen.gov.ar/ParteDiario.csv`
2. **Vialidad Nacional**: Google Sheets API (Neuquén y Río Negro)

---
*Desarrollado para consulta rápida y segura de rutas y caminos en la Región Patagónica.*
