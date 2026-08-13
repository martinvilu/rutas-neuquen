/**
 * Módulo de gestión del mapa Leaflet, capas vectoriales y marcadores
 */
import { state } from './state.js';
import { getStatusStyle, getStatusBadge, getHighestSeverityStatus } from './utils.js';
import { updateURL } from './url.js';
import { fetchGeoJSONLayers } from './api.js';
import { openModal, applyFilters } from './ui.js';

/**
 * Inicialización del mapa Leaflet
 */
export function initMap(initialView) {
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: true
  }).setView([initialView.lat, initialView.lng], initialView.zoom);

  state.darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });

  state.lightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });

  const savedTheme = localStorage.getItem('theme') || 'dark';
  state.currentTheme = savedTheme;
  document.documentElement.setAttribute('data-theme', state.currentTheme);

  if (state.currentTheme === 'light') {
    state.lightTileLayer.addTo(map);
  } else {
    state.darkTileLayer.addTo(map);
  }

  map.on('moveend', updateURL);
  map.on('zoomend', updateURL);

  state.map = map;
}

/**
 * Conmuta entre tema claro y oscuro
 */
export function toggleTheme() {
  state.currentTheme = state.currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.currentTheme);
  localStorage.setItem('theme', state.currentTheme);

  if (state.map) {
    if (state.currentTheme === 'light') {
      if (state.map.hasLayer(state.darkTileLayer)) state.map.removeLayer(state.darkTileLayer);
      state.lightTileLayer.addTo(state.map);
    } else {
      if (state.map.hasLayer(state.lightTileLayer)) state.map.removeLayer(state.lightTileLayer);
      state.darkTileLayer.addTo(state.map);
    }
  }
}

/**
 * Macheo estricto de trazas GeoJSON con tramos de partes oficiales
 */
export function findTramosForFeature(feature) {
  const codigo = feature.properties ? feature.properties.codigo : '';
  if (codigo) {
    const match = state.allTramos.filter(t => t.CodigoTramo === codigo);
    if (match.length > 0) return match;
  }

  const name = feature.properties ? feature.properties.name : '';
  const prov = feature.properties ? feature.properties.provincia : '';
  if (name) {
    let exactMatches = state.allTramos.filter(t => t.RutaTramo && t.RutaTramo.toUpperCase() === name.toUpperCase());
    if (prov) {
      exactMatches = exactMatches.filter(t => t.Provincia === prov);
    }
    if (exactMatches.length > 0) return exactMatches;
  }

  return [];
}

/**
 * Plantilla HTML para popup interactivo del mapa
 */
export function createPopupContent(feature, tramos) {
  const ref = (feature.properties && feature.properties.ref) || 'Ruta';
  const routeName = tramos.length > 0 ? tramos[0].routeName : ref;
  const status = getHighestSeverityStatus(tramos);

  if (tramos.length === 0) {
    return `
      <div style="min-width: 200px;">
        <div class="popup-title">${routeName}</div>
        <div style="margin-bottom: 0.5rem;">${getStatusBadge(status)}</div>
        <p style="font-size: 0.8rem; color: var(--text-secondary);">Sin tramos registrados en los partes de vialidad.</p>
      </div>
    `;
  }

  const tramo = tramos[0];
  const extraCount = tramos.length > 1 ? ` (+${tramos.length - 1} tramos más)` : '';

  return `
    <div style="min-width: 230px; max-width: 290px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; gap: 0.5rem;">
        <span class="popup-title" style="margin-bottom: 0;">${tramo.routeName} (${tramo.Provincia})</span>
        ${getStatusBadge(tramo.RutaEstado)}
      </div>
      <div class="popup-subtitle">${tramo.RutaTramo}${extraCount}</div>
      <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.4rem; line-height: 1.4;">
        <strong>Calzada:</strong> ${tramo.RutaTipo || 'Sin datos'}<br>
        <strong>Longitud:</strong> ${tramo.RutaLongitud ? tramo.RutaLongitud + ' km' : 'N/I'}<br>
        <strong>Fuente:</strong> ${tramo.Fuente} (${tramo.Fecha} ${tramo.Hora})
      </div>
      ${tramo.RutaObservacion ? `
        <div style="font-size: 0.75rem; background: rgba(255,255,255,0.05); padding: 0.35rem 0.5rem; border-radius: 4px; margin-bottom: 0.5rem; border-left: 2px solid var(--accent-blue);">
          ${tramo.RutaObservacion.length > 100 ? tramo.RutaObservacion.substring(0, 97) + '...' : tramo.RutaObservacion}
        </div>
      ` : ''}
      <button class="popup-btn" onclick="window.openModalByCode('${tramo.CodigoTramo}')">
        Ver Detalle Completo
      </button>
    </div>
  `;
}

/**
 * Carga y montaje de las capas GeoJSON
 */
export async function loadGeoJSONData() {
  try {
    const geojsonData = await fetchGeoJSONLayers();
    let featureIdCounter = 0;

    state.geoJsonLayer = L.geoJSON(geojsonData, {
      style: (feature) => {
        const tramos = findTramosForFeature(feature);
        const status = getHighestSeverityStatus(tramos);
        return getStatusStyle(status);
      },
      onEachFeature: (feature, layer) => {
        const featureId = featureIdCounter++;
        const tramos = findTramosForFeature(feature);

        const bounds = layer.getBounds ? layer.getBounds() : null;
        state.featureLayerMap.set(featureId, { layer, tramos, bounds, feature });

        if (tramos.length > 0) {
          tramos.forEach(t => {
            const tramoCode = t.CodigoTramo;
            state.featureLayerMap.set(`code-${tramoCode}`, { layer, tramos, bounds, feature });
            
            const routeKey = t._routeKey;
            if (bounds && bounds.isValid()) {
              if (!state.routeBoundsMap.has(routeKey)) {
                state.routeBoundsMap.set(routeKey, L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast()));
              } else {
                state.routeBoundsMap.get(routeKey).extend(bounds);
              }
            }
          });

          // Marcador en el centro del segmento
          if (feature.geometry && feature.geometry.type === 'LineString' && feature.geometry.coordinates.length > 0) {
            const coords = feature.geometry.coordinates;
            const midIndex = Math.floor(coords.length / 2);
            const midCoord = coords[midIndex];
            const status = getHighestSeverityStatus(tramos);
            const style = getStatusStyle(status);
            
            const marker = L.circleMarker([midCoord[1], midCoord[0]], {
              radius: 6,
              fillColor: style.color,
              color: '#000',
              weight: 2,
              opacity: 1,
              fillOpacity: 1
            }).addTo(state.map);
            
            marker.on('click', () => {
              onRouteItemClick(tramos[0].CodigoTramo, tramos[0]._routeKey);
            });
            
            const popupContent = createPopupContent(feature, tramos);
            marker.bindPopup(popupContent);
          }
        }

        const popupContent = createPopupContent(feature, tramos);
        layer.bindPopup(popupContent);

        layer.on({
          mouseover: (e) => {
            const l = e.target;
            l.setStyle({ weight: (l.options.weight || 4) + 2.5, opacity: 1 });
            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
              l.bringToFront();
            }
          },
          mouseout: (e) => {
            state.geoJsonLayer.resetStyle(e.target);
          }
        });
      }
    }).addTo(state.map);

    console.log(`Capa GeoJSON de segmentos montada con ${geojsonData.features.length} trazas.`);
  } catch (err) {
    console.error('Error al cargar la capa GeoJSON:', err);
  }
}

/**
 * Click sobre tramo en el mapa o lista
 */
export function onRouteItemClick(codigoTramo, routeKey) {
  state.activeRouteCode = codigoTramo;
  updateURL();
  applyFilters();

  const tramo = state.allTramos.find(t => t.CodigoTramo === codigoTramo);

  if (routeKey && state.routeBoundsMap.has(routeKey)) {
    const bounds = state.routeBoundsMap.get(routeKey);
    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }

  if (tramo) {
    openModal(tramo);
  }
}

/**
 * Resalta en el mapa la traza al hacer hover
 */
export function highlightMapFeature(codigoTramo) {
  if (!state.geoJsonLayer) return;
  state.featureLayerMap.forEach(({ layer, tramos }) => {
    if (tramos && tramos.some(t => t.CodigoTramo === codigoTramo)) {
      layer.setStyle({ weight: 9, opacity: 1, color: '#38bdf8' });
      if (layer.bringToFront) layer.bringToFront();
    }
  });
}

/**
 * Restaura el estilo al salir del hover
 */
export function unhighlightMapFeature(codigoTramo) {
  if (!state.geoJsonLayer) return;
  state.featureLayerMap.forEach(({ layer, tramos }) => {
    if (tramos && tramos.some(t => t.CodigoTramo === codigoTramo)) {
      const status = getHighestSeverityStatus(tramos);
      const style = getStatusStyle(status);
      layer.setStyle({ weight: style.weight, opacity: style.opacity, color: style.color, dashArray: style.dashArray });
    }
  });
}
