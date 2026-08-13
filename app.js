/**
 * Estado de Rutas - Neuquén (Dirección Provincial de Vialidad)
 * Aplicación Web Interactiva basada en Leaflet.js y APIs estáticas.
 * 
 * Reglas de diseño y arquitectura:
 * 1. JavaScript Vanilla ES6 limpio, modular y bien comentado.
 * 2. Idioma: Español rioplatense.
 * 3. Biblioteca de mapas: Leaflet.js con basemap oscuro de CartoDB.
 */

// Estado global de la aplicación
const state = {
  allTramos: [],
  tramosByRouteKey: new Map(),
  tramosByNumber: new Map(),
  map: null,
  geoJsonLayer: null,
  featureLayerMap: new Map(), // featureIndex -> { layer, tramos, bounds, feature }
  routeBoundsMap: new Map(),  // routeKey -> LatLngBounds
  filters: {
    search: '',
    route: '',
    status: 'ALL'
  }
};

/**
 * Normaliza claves de rutas para comparación insensible a espacios o mayúsculas.
 * Ejemplo: "RP 7" -> "RP7", "Ruta Nacional 40" -> "RN40"
 */
function normalizeRouteKey(str) {
  if (!str) return '';
  let upper = String(str).toUpperCase().trim();
  if (upper.startsWith('RUTA NACIONAL')) upper = upper.replace('RUTA NACIONAL', 'RN');
  if (upper.startsWith('RUTA PROVINCIAL')) upper = upper.replace('RUTA PROVINCIAL', 'RP');
  return upper.replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
}

/**
 * 1. Carga de Datos CSV
 * fetchCSVData(): Intenta en orden:
 * 1. Directo: https://w2.dpvneuquen.gov.ar/ParteDiario.csv
 * 2. Proxy CORS: https://api.allorigins.win/raw?url=https://w2.dpvneuquen.gov.ar/ParteDiario.csv
 * 3. Fallback local: data/ParteDiario.csv
 */
async function fetchCSVData() {
  const urls = [
    'https://w2.dpvneuquen.gov.ar/ParteDiario.csv',
    'https://api.allorigins.win/raw?url=https://w2.dpvneuquen.gov.ar/ParteDiario.csv',
    'data/ParteDiario.csv'
  ];

  for (const url of urls) {
    try {
      console.log(`Cargando parte diario CSV desde: ${url}`);
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        if (text && text.includes('CodigoTramo')) {
          console.log(`Parte diario CSV cargado con éxito desde: ${url}`);
          return text;
        }
      }
    } catch (err) {
      console.warn(`No se pudo cargar el CSV desde ${url}:`, err);
    }
  }
  throw new Error('Imposible obtener el parte diario de rutas desde ninguna de las fuentes configuradas.');
}

/**
 * parseCSV(csvText): Convierte el texto CSV en un array de objetos con las columnas:
 * CodigoTramo, RutaNumero, RutaProvincial, RutaTramo, RutaTipo, RutaLongitud,
 * RutaEstado, RutaSeccion, RutaObservacion, Fecha, Hora.
 * Formatea el nombre de la ruta: "RP 1" si RutaProvincial === "1", "RN 40" si es "0".
 */
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
    let insideQuotes = false;
    let currentValue = '';

    for (let char of line) {
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.replace(/^"|"$/g, '').trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.replace(/^"|"$/g, '').trim());

    const row = {};
    headers.forEach((h, index) => {
      row[h] = values[index] !== undefined ? values[index] : '';
    });

    // Formatear nombre de la ruta: "RP 1" si RutaProvincial === "1", "RN 40" si RutaProvincial === "0"
    const isProv = String(row.RutaProvincial).trim() === '1';
    const prefix = isProv ? 'RP' : 'RN';
    const rutaNumStr = String(row.RutaNumero).trim();
    row.routeName = `${prefix} ${rutaNumStr}`;
    row._routeKey = normalizeRouteKey(row.routeName);
    row._routeNum = rutaNumStr;

    records.push(row);
  }

  return records;
}

/**
 * Devuelve el estilo de línea para la capa vectorial Leaflet por estado:
 * - I (Intransitable): #ef4444, grosor 5.
 * - TCP (Precaución): #f59e0b, grosor 4.5.
 * - T / otros (Normal): #10b981, grosor 4.
 */
function getStatusStyle(status) {
  switch (status) {
    case 'I':
      return { color: '#ef4444', weight: 5, opacity: 0.85 };
    case 'TCP':
      return { color: '#f59e0b', weight: 4.5, opacity: 0.85 };
    case 'T':
    default:
      return { color: '#10b981', weight: 4, opacity: 0.85 };
  }
}

/**
 * Retorna la etiqueta HTML formateada para los badges de estado.
 */
function getStatusBadge(status) {
  switch (status) {
    case 'I':
      return '<span class="status-tag danger">Intransitable</span>';
    case 'TCP':
      return '<span class="status-tag warning">Precaución</span>';
    case 'T':
    default:
      return '<span class="status-tag normal">Normal</span>';
  }
}

/**
 * Calcula el estado de mayor severidad en un listado de tramos (I > TCP > T).
 */
function getHighestSeverityStatus(tramos) {
  if (!tramos || tramos.length === 0) return 'T';
  if (tramos.some(t => t.RutaEstado === 'I')) return 'I';
  if (tramos.some(t => t.RutaEstado === 'TCP')) return 'TCP';
  return 'T';
}

/**
 * Inicialización del mapa Leaflet en #map.
 * Centro: [-38.95, -70.05], Zoom: 7.
 * TileLayer: CartoDB Dark All con atribución OpenStreetMap / CARTO.
 */
function initMap() {
  const map = L.map('map', {
    zoomControl: true,
    attributionControl: true
  }).setView([-38.95, -70.05], 7);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  }).addTo(map);

  state.map = map;
}

/**
 * Carga la capa GeoJSON data/neuquen_routes.geojson y la vincula con los datos del CSV.
 */
async function loadGeoJSONData() {
  try {
    const response = await fetch('data/neuquen_routes.geojson');
    if (!response.ok) {
      throw new Error(`Respuesta HTTP no válida (${response.status}) al obtener GeoJSON`);
    }
    const geojsonData = await response.json();

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

        // Guardar bounds y asociación para zoom interactivo
        const bounds = layer.getBounds ? layer.getBounds() : null;
        state.featureLayerMap.set(featureId, { layer, tramos, bounds, feature });

        if (tramos.length > 0) {
          const routeKey = tramos[0]._routeKey;
          if (bounds && bounds.isValid()) {
            if (!state.routeBoundsMap.has(routeKey)) {
              state.routeBoundsMap.set(routeKey, L.latLngBounds(bounds.getSouthWest(), bounds.getNorthEast()));
            } else {
              state.routeBoundsMap.get(routeKey).extend(bounds);
            }
          }
        }

        // Popup interactivo con información completa
        const popupContent = createPopupContent(feature, tramos);
        layer.bindPopup(popupContent);

        // Efectos al pasar el mouse por encima
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

    console.log(`Capa GeoJSON montada con ${geojsonData.features.length} trazas.`);
  } catch (err) {
    console.error('Error al cargar la capa GeoJSON:', err);
  }
}

/**
 * Empareja las trazas del GeoJSON con los tramos del CSV por coincidencia de ref o name
 * (ej. RP 7, RN 40, RP7, RN40).
 */
function findTramosForFeature(feature) {
  const ref = feature.properties ? feature.properties.ref : '';
  const name = feature.properties ? feature.properties.name : '';

  // 1. Coincidencia directa por ref
  if (ref) {
    const parts = ref.split(';');
    for (const part of parts) {
      const key = normalizeRouteKey(part);
      if (state.tramosByRouteKey.has(key)) {
        return state.tramosByRouteKey.get(key);
      }
    }
  }

  // 2. Coincidencia por name
  if (name) {
    const key = normalizeRouteKey(name);
    if (state.tramosByRouteKey.has(key)) {
      return state.tramosByRouteKey.get(key);
    }
  }

  // 3. Fallback por número de ruta (ej. si ref="RP13" pero en el CSV el tramo vino como "RN 13")
  if (ref) {
    const numMatch = ref.match(/\d+/);
    if (numMatch) {
      const num = numMatch[0];
      if (state.tramosByNumber.has(num)) {
        return state.tramosByNumber.get(num);
      }
    }
  }

  return [];
}

/**
 * Construye la plantilla HTML para el popup interactivo del mapa.
 * Incluye: badge de estado, número de ruta, tramo, tipo de calzada, observación y fecha/hora.
 */
function createPopupContent(feature, tramos) {
  const ref = (feature.properties && feature.properties.ref) || 'Ruta';
  const routeName = tramos.length > 0 ? tramos[0].routeName : ref;
  const status = getHighestSeverityStatus(tramos);

  if (tramos.length === 0) {
    return `
      <div style="min-width: 200px;">
        <div class="popup-title">${routeName}</div>
        <div style="margin-bottom: 0.5rem;">${getStatusBadge(status)}</div>
        <p style="font-size: 0.8rem; color: var(--text-secondary);">Sin tramos registrados en el parte diario.</p>
      </div>
    `;
  }

  const tramo = tramos[0];
  const extraCount = tramos.length > 1 ? ` (+${tramos.length - 1} tramos más)` : '';

  return `
    <div style="min-width: 230px; max-width: 290px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.4rem; gap: 0.5rem;">
        <span class="popup-title" style="margin-bottom: 0;">${tramo.routeName}</span>
        ${getStatusBadge(tramo.RutaEstado)}
      </div>
      <div class="popup-subtitle">${tramo.RutaTramo}${extraCount}</div>
      <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.4rem; line-height: 1.4;">
        <strong>Calzada:</strong> ${tramo.RutaTipo || 'Sin datos'}<br>
        <strong>Longitud:</strong> ${tramo.RutaLongitud ? tramo.RutaLongitud + ' km' : 'N/I'}<br>
        <strong>Fecha / Hora:</strong> ${tramo.Fecha} ${tramo.Hora} hs
      </div>
      ${tramo.RutaObservacion ? `<div style="font-size: 0.78rem; color: var(--text-primary); background: var(--bg-dark); padding: 0.45rem; border-radius: 6px; border: 1px solid var(--border-color); max-height: 90px; overflow-y: auto; margin-top: 0.4rem;">${tramo.RutaObservacion}</div>` : ''}
      <button class="popup-btn" onclick="openModalByCode('${tramo.CodigoTramo}')">Ver detalle completo</button>
    </div>
  `;
}

/**
 * Actualiza los contadores en las tarjetas de estadísticas:
 * #stat-total, #stat-intransitable, #stat-precaucion, #stat-normal.
 */
function updateStats(tramosFiltrados) {
  const total = tramosFiltrados.length;
  const intransitable = tramosFiltrados.filter(t => t.RutaEstado === 'I').length;
  const precaucion = tramosFiltrados.filter(t => t.RutaEstado === 'TCP').length;
  const normal = tramosFiltrados.filter(t => t.RutaEstado === 'T' || (t.RutaEstado !== 'I' && t.RutaEstado !== 'TCP')).length;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-intransitable').textContent = intransitable;
  document.getElementById('stat-precaucion').textContent = precaucion;
  document.getElementById('stat-normal').textContent = normal;
}

/**
 * Actualiza el texto #last-updated con la fecha y hora del reporte.
 */
function updateLastUpdated(tramos) {
  const el = document.getElementById('last-updated');
  if (!el || tramos.length === 0) return;
  const t = tramos[0];
  el.textContent = `Actualizado: ${t.Fecha} — ${t.Hora} hs`;
}

/**
 * Pobla el selector #route-select con la lista única de rutas presentes en el CSV.
 */
function populateRouteSelect(tramos) {
  const select = document.getElementById('route-select');
  if (!select) return;

  const routesSet = new Set();
  tramos.forEach(t => {
    if (t.routeName) routesSet.add(t.routeName);
  });

  const sortedRoutes = Array.from(routesSet).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });

  select.innerHTML = '<option value="">Todas las rutas</option>';
  sortedRoutes.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    select.appendChild(opt);
  });
}

/**
 * Configura las opciones del selector #status-select (ALL, I, TCP, T).
 */
function populateStatusSelect() {
  const select = document.getElementById('status-select');
  if (!select) return;

  select.innerHTML = `
    <option value="ALL">Todos los estados</option>
    <option value="I">Intransitable (I)</option>
    <option value="TCP">Precaución (TCP)</option>
    <option value="T">Normal / Transitable (T)</option>
  `;
}

/**
 * Renderiza el listado de tarjetas en el contenedor #routes-list.
 */
function renderRoutesList(tramos) {
  const container = document.getElementById('routes-list');
  if (!container) return;

  if (tramos.length === 0) {
    container.innerHTML = `
      <div class="routes-empty">
        <p>No se encontraron tramos de ruta que coincidan con la búsqueda.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = tramos.map(t => {
    const badge = getStatusBadge(t.RutaEstado);
    return `
      <article class="route-item" onclick="onRouteItemClick('${t.CodigoTramo}', '${t._routeKey}')" data-code="${t.CodigoTramo}">
        <header class="route-item-header">
          <span class="route-name">${t.routeName}</span>
          ${badge}
        </header>
        <div class="route-section-title">${t.RutaTramo}</div>
        ${t.RutaSeccion ? `<div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.3;">${t.RutaSeccion}</div>` : ''}
        <footer class="route-meta">
          <span>🛣️ ${t.RutaTipo || 'Calzada n/d'}</span>
          <span>📏 ${t.RutaLongitud ? t.RutaLongitud + ' km' : 's/d'}</span>
        </footer>
      </article>
    `;
  }).join('');
}

/**
 * Filtrado dinámico por:
 * - Buscador #search-input (búsqueda por texto en localidad, tramo o ruta).
 * - Desplegable #route-select.
 * - Desplegable #status-select (ALL, I, TCP, T).
 */
function applyFilters() {
  const searchInput = document.getElementById('search-input');
  const routeSelect = document.getElementById('route-select');
  const statusSelect = document.getElementById('status-select');

  const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const routeVal = routeSelect ? routeSelect.value : '';
  const statusVal = statusSelect ? statusSelect.value : 'ALL';

  const filtered = state.allTramos.filter(t => {
    // 1. Desplegable por ruta
    if (routeVal && t.routeName !== routeVal) {
      return false;
    }

    // 2. Desplegable por estado
    if (statusVal && statusVal !== 'ALL' && statusVal !== '') {
      if (statusVal === 'T') {
        if (t.RutaEstado === 'I' || t.RutaEstado === 'TCP') return false;
      } else if (t.RutaEstado !== statusVal) {
        return false;
      }
    }

    // 3. Buscador por texto libre
    if (searchVal) {
      const fullText = `${t.routeName} ${t.RutaTramo} ${t.RutaSeccion} ${t.RutaObservacion} ${t.RutaTipo}`.toLowerCase();
      if (!fullText.includes(searchVal)) {
        return false;
      }
    }

    return true;
  });

  renderRoutesList(filtered);
  updateStats(filtered);
  updateMapFeaturesVisibility(filtered);
}

/**
 * Muestra o atenúa los elementos vectoriales en el mapa según los tramos filtrados.
 */
function updateMapFeaturesVisibility(tramosFiltrados) {
  if (!state.geoJsonLayer) return;

  const activeRouteKeys = new Set(tramosFiltrados.map(t => t._routeKey));
  const activeCodes = new Set(tramosFiltrados.map(t => t.CodigoTramo));

  state.featureLayerMap.forEach(({ layer, tramos }) => {
    if (tramos.length === 0) {
      if (activeRouteKeys.size === state.tramosByRouteKey.size) {
        layer.setStyle({ opacity: 0.35, weight: 3 });
      } else {
        layer.setStyle({ opacity: 0.05, weight: 1 });
      }
      return;
    }

    const matchesFilter = tramos.some(t => activeCodes.has(t.CodigoTramo));
    if (matchesFilter) {
      const status = getHighestSeverityStatus(tramos.filter(t => activeCodes.has(t.CodigoTramo)));
      const style = getStatusStyle(status);
      layer.setStyle({ opacity: style.opacity, weight: style.weight, color: style.color });
    } else {
      layer.setStyle({ opacity: 0.08, weight: 1.5 });
    }
  });
}

/**
 * Evento al hacer click en una tarjeta de la lista #routes-list:
 * Centra el mapa en la ruta y despliega el modal del tramo.
 */
function onRouteItemClick(codigoTramo, routeKey) {
  const tramo = state.allTramos.find(t => t.CodigoTramo === codigoTramo);

  // Centrar mapa si se cuenta con los límites de la ruta
  if (routeKey && state.routeBoundsMap.has(routeKey)) {
    const bounds = state.routeBoundsMap.get(routeKey);
    if (bounds && bounds.isValid()) {
      state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }

  // Abrir modal de detalles
  if (tramo) {
    openModal(tramo);
  }
}

/**
 * Función expuesta globalmente para abrir el modal desde botones en Popups HTML.
 */
function openModalByCode(codigoTramo) {
  const tramo = state.allTramos.find(t => t.CodigoTramo === String(codigoTramo));
  if (tramo) {
    openModal(tramo);
  }
}

/**
 * Despliega el modal #detail-modal con los datos de un tramo.
 */
function openModal(tramo) {
  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('modal-title');
  const statusBadge = document.getElementById('modal-status');
  const detailsBody = document.getElementById('modal-details');

  if (!modal || !title || !statusBadge || !detailsBody) return;

  title.textContent = `${tramo.routeName} — ${tramo.RutaTramo}`;
  statusBadge.innerHTML = getStatusBadge(tramo.RutaEstado);

  detailsBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-row">
        <span class="detail-label">Código de Tramo</span>
        <span class="detail-value">${tramo.CodigoTramo}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Tipo de Calzada</span>
        <span class="detail-value">${tramo.RutaTipo || 'No especificado'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Longitud</span>
        <span class="detail-value">${tramo.RutaLongitud ? tramo.RutaLongitud + ' km' : 'N/I'}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Fecha y Hora</span>
        <span class="detail-value">${tramo.Fecha} — ${tramo.Hora} hs</span>
      </div>
    </div>

    ${tramo.RutaSeccion ? `
      <div style="background-color: var(--bg-dark); padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <span class="detail-label">Sección</span>
        <div class="detail-value" style="margin-top: 0.25rem;">${tramo.RutaSeccion}</div>
      </div>
    ` : ''}

    <div class="observations-box">
      <span class="detail-label">Observaciones del Parte Diario</span>
      <p class="detail-value" style="margin-top: 0.35rem; line-height: 1.5;">${tramo.RutaObservacion || 'Sin observaciones registradas para este tramo.'}</p>
    </div>
  `;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

/**
 * Cierra el modal #detail-modal.
 */
function closeModal() {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Inicializa los manejadores de eventos DOM para sidebar, filtros y modal.
 */
function initEventListeners() {
  // Desplegar / colapsar #sidebar con #sidebar-toggle
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 300);
    });
  }

  // Abrir sidebar en dispositivos móviles
  const mobileBtn = document.getElementById('mobile-sidebar-open');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 300);
    });
  }

  // Cerrar modal #detail-modal
  const modalCloseBtn = document.getElementById('modal-close');
  const modal = document.getElementById('detail-modal');
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
  }
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeModal();
    }
  });

  // Eventos de filtros dinámicos
  const searchInput = document.getElementById('search-input');
  const routeSelect = document.getElementById('route-select');
  const statusSelect = document.getElementById('status-select');

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (routeSelect) routeSelect.addEventListener('change', applyFilters);
  if (statusSelect) statusSelect.addEventListener('change', applyFilters);
}

// Exponer manejadores globales en el objeto window
window.onRouteItemClick = onRouteItemClick;
window.openModalByCode = openModalByCode;
window.closeModal = closeModal;

/**
 * Punto de entrada principal de la aplicación.
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Iniciando Estado de Rutas Neuquén...');

    // 1. Inicializar mapa Leaflet
    initMap();

    // 2. Escuchadores de eventos de la interfaz
    initEventListeners();

    // 3. Cargar y parsear datos del CSV
    const csvText = await fetchCSVData();
    const tramos = parseCSV(csvText);
    state.allTramos = tramos;

    // Agrupar tramos en Maps para búsqueda eficiente
    tramos.forEach(t => {
      const key = t._routeKey;
      if (!state.tramosByRouteKey.has(key)) {
        state.tramosByRouteKey.set(key, []);
      }
      state.tramosByRouteKey.get(key).push(t);

      const num = t._routeNum;
      if (!state.tramosByNumber.has(num)) {
        state.tramosByNumber.set(num, []);
      }
      state.tramosByNumber.get(num).push(t);
    });

    // 4. Poblar controles e indicadores de UI
    populateStatusSelect();
    populateRouteSelect(tramos);
    updateLastUpdated(tramos);
    updateStats(tramos);
    renderRoutesList(tramos);

    // 5. Cargar capa GeoJSON
    await loadGeoJSONData();

    console.log('Aplicación cargada e inicializada con éxito.');
  } catch (err) {
    console.error('Error durante la inicialización:', err);
    const routesList = document.getElementById('routes-list');
    if (routesList) {
      routesList.innerHTML = `
        <div class="routes-empty" style="color: var(--status-danger);">
          <p>⚠️ No se pudieron obtener los datos de vialidad.</p>
          <p style="font-size: 0.8rem; margin-top: 0.5rem;">${err.message}</p>
        </div>
      `;
    }
  }
});
