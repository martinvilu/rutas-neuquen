/**
 * Estado de Rutas - Neuquén y Río Negro (DPV & Vialidad Nacional)
 * Aplicación Web Interactiva basada en Leaflet.js y APIs estáticas.
 */

// Estado global de la aplicación
const state = {
  map: null,
  geoJsonLayer: null,
  featureLayerMap: new Map(),
  allTramos: [],
  tramosByRouteKey: new Map(),
  tramosByNumber: new Map(),
  routeBoundsMap: new Map(),
  activeRouteCode: null,
  filters: {
    search: '',
    province: '',
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
 * Carga de datos DPV Neuquén (CSV)
 */
async function fetchDPVNeuquenData() {
  const urls = [
    'data/ParteDiario.csv',
    'https://api.allorigins.win/raw?url=https://w2.dpvneuquen.gov.ar/ParteDiario.csv',
    'https://corsproxy.io/?https://w2.dpvneuquen.gov.ar/ParteDiario.csv'
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        if (text && text.includes('CodigoTramo')) {
          return parseDPVCSV(text);
        }
      }
    } catch (err) {
      // Continuar silenciosamente al siguiente fallback
    }
  }
  console.error('No se pudo cargar DPV Neuquén');
  return [];
}

/**
 * Parser de CSV de DPV Neuquén
 */
function parseDPVCSV(csvText) {
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

    const isProv = String(row.RutaProvincial).trim() === '1';
    const prefix = isProv ? 'RP' : 'RN';
    const rutaNumStr = String(row.RutaNumero).trim();

    records.push({
      CodigoTramo: `DPV-${row.CodigoTramo}`,
      Provincia: 'Neuquén',
      RutaNumero: rutaNumStr,
      RutaProvincial: isProv ? '1' : '0',
      routeName: `${prefix} ${rutaNumStr}`,
      RutaTramo: row.RutaTramo,
      RutaTipo: row.RutaTipo,
      RutaLongitud: row.RutaLongitud,
      RutaEstado: row.RutaEstado || 'T',
      RutaSeccion: row.RutaSeccion,
      RutaObservacion: row.RutaObservacion,
      Fecha: row.Fecha,
      Hora: row.Hora,
      Fuente: 'DPV Neuquén',
      _routeKey: normalizeRouteKey(`${prefix}${rutaNumStr}`),
      _routeNum: rutaNumStr
    });
  }

  return records;
}

/**
 * Carga de datos de Vialidad Nacional desde Google Sheets API
 */
async function fetchVialidadNacionalData() {
  const urlApi = 'https://sheets.googleapis.com/v4/spreadsheets/17AqjqeNvM4nG6cOUsUFKFaKXMiNmztYfzHIxeM9FcXk/values/tablavisible?key=AIzaSyCq2wEEKL9-6RmX-TkW23qJsrmnFHFf5tY&alt=json';
  const urls = [
    'data/vialidad_nacional.json',
    urlApi,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(urlApi)}`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        if (json && json.values && json.values.length > 2) {
          return parseVialidadNacional(json.values);
        }
      }
    } catch (err) {
      // Continuar silenciosamente al siguiente fallback
    }
  }
  console.error('No se pudo cargar Vialidad Nacional');
  return [];
}

/**
 * Parser de datos de Vialidad Nacional (Google Sheet)
 * Incluye todas las provincias del dataset nacional.
 */
function parseVialidadNacional(rows) {
  const records = [];
  let idCounter = 1000;

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const rawProv = (r[0] || '').trim();
    if (!rawProv) continue;

    let provNorm = rawProv;
    if (/neuqu[eé]n/i.test(rawProv)) provNorm = 'Neuquén';
    else if (/r[ií]o negro/i.test(rawProv)) provNorm = 'Río Negro';
    else if (/chubut/i.test(rawProv)) provNorm = 'Chubut';
    else if (/c[oó]rdoba/i.test(rawProv)) provNorm = 'Córdoba';
    else if (/tucum[aá]n/i.test(rawProv)) provNorm = 'Tucumán';
    else if (/entre r[ií]os/i.test(rawProv)) provNorm = 'Entre Ríos';

    const rutaNum = (r[1] || '').trim();
    const tramoStr = (r[2] || '').trim();
    const estadoRaw = (r[3] || '').toUpperCase();
    const calzada = (r[4] || '').trim();
    const extension = (r[5] || '').trim();
    const obs = (r[7] || '').trim();
    const actualizado = (r[8] || '').trim();

    // Mapeo de estado a I, TCP, T
    let estado = 'T';
    if (estadoRaw.includes('INTRANSITABLE') || estadoRaw.includes('CORTE') || estadoRaw.includes('INTERRUMPIDO')) {
      estado = 'I';
    } else if (estadoRaw.includes('RESTRINGIDA') || estadoRaw.includes('PRECAUCIÓN') || estadoRaw.includes('PRECAUCION') || estadoRaw.includes('ALERTA')) {
      estado = 'TCP';
    }

    const routeName = `RN ${rutaNum}`;

    records.push({
      CodigoTramo: `VN-${idCounter++}`,
      Provincia: provNorm,
      RutaNumero: rutaNum,
      RutaProvincial: '0',
      routeName: routeName,
      RutaTramo: tramoStr,
      RutaTipo: calzada,
      RutaLongitud: extension,
      RutaEstado: estado,
      RutaSeccion: '',
      RutaObservacion: obs,
      Fecha: actualizado.split(' ')[0] || 'Hoy',
      Hora: actualizado.split(' ')[1] || '',
      Fuente: 'Vialidad Nacional',
      _routeKey: normalizeRouteKey(routeName),
      _routeNum: rutaNum
    });
  }

  return records;
}

/**
 * Devuelve el estilo de línea para la capa vectorial Leaflet por estado:
 * - I (Intransitable): #ef4444, grosor 5.5, línea continua.
 * - TCP (Precaución): #f59e0b, grosor 4.8, línea continua.
 * - T (Normal / Transitable): #10b981, grosor 4, línea continua.
 * - NO_DATA / Sin Información: #10b981, grosor 2.2, opacidad 0.45, línea verde punteada suave (sin ruido visual).
 */
function getStatusStyle(status) {
  switch (status) {
    case 'I':
      return { color: '#ef4444', weight: 5.5, opacity: 0.9, dashArray: null };
    case 'TCP':
      return { color: '#f59e0b', weight: 4.8, opacity: 0.85, dashArray: null };
    case 'T':
      return { color: '#10b981', weight: 4, opacity: 0.85, dashArray: null };
    case 'NO_DATA':
    default:
      return { color: '#10b981', weight: 2.2, opacity: 0.45, dashArray: '4, 8' };
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
      return '<span class="status-tag normal">Normal</span>';
    case 'NO_DATA':
    default:
      return '<span class="status-tag normal" style="opacity: 0.85; border-style: dashed;">Sin Información</span>';
  }
}

/**
 * Calcula el estado de mayor severidad en un listado de tramos (I > TCP > T > NO_DATA).
 */
function getHighestSeverityStatus(tramos) {
  if (!tramos || tramos.length === 0) return 'NO_DATA';
  if (tramos.some(t => t.RutaEstado === 'I')) return 'I';
  if (tramos.some(t => t.RutaEstado === 'TCP')) return 'TCP';
  if (tramos.some(t => t.RutaEstado === 'T')) return 'T';
  return 'NO_DATA';
}

// Capas de mapas para modo oscuro y claro
let darkTileLayer = null;
let lightTileLayer = null;
let currentTheme = 'dark';

/**
 * Inicialización del mapa Leaflet en #map con capas para modo oscuro y claro.
 */
function initMap() {
  const urlParams = new URLSearchParams(window.location.search);
  const lat = parseFloat(urlParams.get('lat')) || -39.5;
  const lng = parseFloat(urlParams.get('lng')) || -67.5;
  const zoom = parseInt(urlParams.get('z'), 10) || 6;

  const map = L.map('map', {
    zoomControl: true,
    attributionControl: true
  }).setView([lat, lng], zoom);

  map.on('moveend', updateURL);
  map.on('zoomend', updateURL);

  darkTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });

  lightTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  });

  // Cargar tema guardado en localStorage o por defecto 'dark'
  const savedTheme = localStorage.getItem('theme') || 'dark';
  currentTheme = savedTheme;
  document.documentElement.setAttribute('data-theme', currentTheme);

  if (currentTheme === 'light') {
    lightTileLayer.addTo(map);
  } else {
    darkTileLayer.addTo(map);
  }

  state.map = map;
}

/**
 * Conmuta el tema entre modo claro y oscuro.
 */
function toggleTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);

  if (state.map) {
    if (currentTheme === 'light') {
      if (state.map.hasLayer(darkTileLayer)) state.map.removeLayer(darkTileLayer);
      lightTileLayer.addTo(state.map);
    } else {
      if (state.map.hasLayer(lightTileLayer)) state.map.removeLayer(lightTileLayer);
      darkTileLayer.addTo(state.map);
    }
  }
}

/**
 * Carga la capa GeoJSON de segmentos refinados (data/segments_geojson.json) o fallback.
 */
async function loadGeoJSONData() {
    let geojsonData = { type: 'FeatureCollection', features: [] };
    
    // Cargar capa base (todas las rutas)
    try {
      const respBase = await fetch('data/routes.geojson');
      if (respBase.ok) {
        const base = await respBase.json();
        geojsonData.features.push(...base.features);
      } else {
        const respNeu = await fetch('data/neuquen_routes.geojson');
        if (respNeu.ok) {
          const neu = await respNeu.json();
          geojsonData.features.push(...neu.features);
        }
      }
    } catch (e) {
      console.warn('No se pudo cargar la capa base de rutas.');
    }

    // Cargar capa OSRM (segmentos exactos)
    try {
      const respSeg = await fetch('data/segments_geojson.json');
      if (respSeg.ok) {
        const seg = await respSeg.json();
        geojsonData.features.push(...seg.features);
      }
    } catch (e) {
      console.warn('No se pudo cargar la capa de segmentos exactos.');
    }

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

          // Agrega marcador en la mitad del segmento
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
 * Empareja las trazas del GeoJSON con los tramos.
 * Primero busca por coincidencia exacta de `codigo` de tramo.
 */
function findTramosForFeature(feature) {
  const codigo = feature.properties ? feature.properties.codigo : '';
  if (codigo) {
    const match = state.allTramos.filter(t => t.CodigoTramo === codigo);
    if (match.length > 0) return match;
  }

  // Fallback solo para nombres exactos mapeados previamente, ignorar ref general para no agrupar toda la ruta
  const name = feature.properties ? feature.properties.name : '';
  if (name) {
    const exactMatches = state.allTramos.filter(t => t.RutaTramo && t.RutaTramo.toUpperCase() === name.toUpperCase());
    if (exactMatches.length > 0) return exactMatches;
  }

  return [];
}

/**
 * Plantilla HTML para popup interactivo del mapa.
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
      ${tramo.RutaObservacion ? `<div style="font-size: 0.78rem; color: var(--text-primary); background: var(--bg-dark); padding: 0.45rem; border-radius: 6px; border: 1px solid var(--border-color); max-height: 90px; overflow-y: auto; margin-top: 0.4rem;">${tramo.RutaObservacion}</div>` : ''}
      <button class="popup-btn" onclick="openModalByCode('${tramo.CodigoTramo}')">Ver detalle completo</button>
    </div>
  `;
}

/**
 * Actualiza contadores en las tarjetas de estadísticas.
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
 * Actualiza fecha/hora del reporte en el encabezado.
 */
function updateLastUpdated(tramos) {
  const el = document.getElementById('last-updated');
  if (!el || tramos.length === 0) return;

  const dpvItem = tramos.find(t => t.Fuente === 'DPV Neuquén' && t.Fecha);
  const vnItem = tramos.find(t => t.Fuente === 'Vialidad Nacional' && t.Fecha);

  const dpvText = dpvItem ? `DPV Neuquén: ${dpvItem.Fecha} ${dpvItem.Hora}` : '';
  const vnText = vnItem ? `Vialidad Nacional: ${vnItem.Fecha} ${vnItem.Hora}` : '';

  if (dpvText && vnText) {
    el.textContent = `Última actualización: ${dpvText} | ${vnText}`;
  } else if (dpvText) {
    el.textContent = `Última actualización: ${dpvText}`;
  } else if (vnText) {
    el.textContent = `Última actualización: ${vnText}`;
  } else {
    const first = tramos[0];
    el.textContent = `Última actualización: ${first.Fecha || 'Hoy'} ${first.Hora || ''}`;
  }
}

/**
 * Pobla el selector #province-select con todas las provincias del dataset.
 */
function populateProvinceSelect(tramos) {
  const select = document.getElementById('province-select');
  if (!select) return;

  const provincesSet = new Set();
  tramos.forEach(t => {
    if (t.Provincia) provincesSet.add(t.Provincia);
  });

  const sortedProvinces = Array.from(provincesSet).sort((a, b) => a.localeCompare(b, 'es'));

  select.innerHTML = '<option value="">Todas las provincias</option>';
  sortedProvinces.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });
}

/**
 * Pobla el selector #route-select.
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
 * Configura las opciones del selector #status-select.
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
 * Resalta en el mapa la traza correspondiente al tramo sobre el que se hace hover en la lista.
 */
function highlightMapFeature(codigoTramo) {
  if (!state.geoJsonLayer) return;
  state.featureLayerMap.forEach(({ layer, tramos }) => {
    if (tramos && tramos.some(t => t.CodigoTramo === codigoTramo)) {
      layer.setStyle({ weight: 9, opacity: 1, color: '#38bdf8' });
      if (layer.bringToFront) layer.bringToFront();
    }
  });
}

/**
 * Restaura el estilo original de la traza al quitar el puntero de la tarjeta.
 */
function unhighlightMapFeature(codigoTramo) {
  if (!state.geoJsonLayer) return;
  state.featureLayerMap.forEach(({ layer, tramos }) => {
    if (tramos && tramos.some(t => t.CodigoTramo === codigoTramo)) {
      const status = getHighestSeverityStatus(tramos);
      const style = getStatusStyle(status);
      layer.setStyle({ weight: style.weight, opacity: style.opacity, color: style.color, dashArray: style.dashArray });
    }
  });
}

/**
 * Renderiza el listado de tarjetas en #routes-list con eventos de hover.
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
      <article class="route-item" 
               onclick="onRouteItemClick('${t.CodigoTramo}', '${t._routeKey}')" 
               onmouseenter="highlightMapFeature('${t.CodigoTramo}')" 
               onmouseleave="unhighlightMapFeature('${t.CodigoTramo}')"
               data-code="${t.CodigoTramo}">
        <header class="route-item-header">
          <span class="route-name">${t.routeName} <small style="font-size:0.75rem; color:var(--text-secondary);">(${t.Provincia})</small></span>
          ${badge}
        </header>
        <div class="route-section-title">${t.RutaTramo}</div>
        ${t.RutaSeccion ? `<div style="font-size: 0.75rem; color: var(--text-secondary); line-height: 1.3;">${t.RutaSeccion}</div>` : ''}
        <footer class="route-meta">
          <span>🛣️ ${t.RutaTipo || 'Calzada n/d'}</span>
          <span>📏 ${t.RutaLongitud ? t.RutaLongitud + ' km' : 's/d'}</span>
          <span style="font-size:0.7rem; color:var(--accent-blue);">${t.Fuente}</span>
        </footer>
      </article>
    `;
  }).join('');
}

/**
 * Aplicar todos los filtros:
 * - Buscador #search-input
 * - Provincia #province-select
 * - Ruta #route-select
 * - Estado #status-select
 */
function applyFilters() {
  const searchInput = document.getElementById('search-input');
  const provinceSelect = document.getElementById('province-select');
  const routeSelect = document.getElementById('route-select');
  const statusSelect = document.getElementById('status-select');

  const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const provVal = provinceSelect ? provinceSelect.value : '';
  const routeVal = routeSelect ? routeSelect.value : '';
  const statusVal = statusSelect ? statusSelect.value : 'ALL';

  const filtered = state.allTramos.filter(t => {
    // 1. Provincia
    if (provVal && t.Provincia !== provVal) {
      return false;
    }

    // 2. Ruta
    if (routeVal && t.routeName !== routeVal) {
      return false;
    }

    // 3. Estado
    if (statusVal && statusVal !== 'ALL' && statusVal !== '') {
      if (statusVal === 'T') {
        if (t.RutaEstado === 'I' || t.RutaEstado === 'TCP') return false;
      } else if (t.RutaEstado !== statusVal) {
        return false;
      }
    }

    // 4. Texto libre
    if (searchVal) {
      const fullText = `${t.routeName} ${t.Provincia} ${t.RutaTramo} ${t.RutaSeccion} ${t.RutaObservacion} ${t.RutaTipo} ${t.Fuente}`.toLowerCase();
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
 * Actualiza la visibilidad y estilos en el mapa.
 * Si un tramo no tiene información de transitabilidad, se muestra como línea verde punteada.
 */
function updateMapFeaturesVisibility(tramosFiltrados) {
  if (!state.geoJsonLayer) return;

  const activeCodes = new Set(tramosFiltrados.map(t => t.CodigoTramo));

  state.featureLayerMap.forEach(({ layer, tramos }) => {
    // Caso 1: Trazas sin información oficial de transitabilidad -> Línea verde punteada
    if (!tramos || tramos.length === 0) {
      const style = getStatusStyle('NO_DATA');
      layer.setStyle({ opacity: style.opacity, weight: style.weight, color: style.color, dashArray: style.dashArray });
      return;
    }

    // Caso 2: Trazas con información oficial
    const matchesFilter = tramos.some(t => activeCodes.has(t.CodigoTramo));
    if (matchesFilter) {
      if (state.activeRouteCode && tramos.some(t => t.CodigoTramo === state.activeRouteCode)) {
        layer.setStyle({ weight: 9, opacity: 1, color: '#38bdf8', dashArray: null });
        if (layer.bringToFront) layer.bringToFront();
      } else {
        const status = getHighestSeverityStatus(tramos.filter(t => activeCodes.has(t.CodigoTramo)));
        const style = getStatusStyle(status);
        layer.setStyle({ opacity: style.opacity, weight: style.weight, color: style.color, dashArray: style.dashArray });
      }
    } else {
      // Fuera del filtro activo de búsqueda
      layer.setStyle({ opacity: 0.15, weight: 2, dashArray: '4, 6', color: '#10b981' });
    }
  });
}

/**
 * Evento al hacer click en tarjeta de tramo o marcador.
 */
function onRouteItemClick(codigoTramo, routeKey) {
  state.activeRouteCode = codigoTramo;
  updateURL();
  applyFilters(); // Re-aplica estilos para que el segmento activo se resalte

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

function openModalByCode(codigoTramo) {
  const tramo = state.allTramos.find(t => t.CodigoTramo === String(codigoTramo));
  if (tramo) {
    openModal(tramo);
  }
}

function openModal(tramo) {
  const modal = document.getElementById('detail-modal');
  const title = document.getElementById('modal-title');
  const statusBadge = document.getElementById('modal-status');
  const detailsBody = document.getElementById('modal-details');

  if (!modal || !title || !statusBadge || !detailsBody) return;

  title.textContent = `${tramo.routeName} (${tramo.Provincia}) — ${tramo.RutaTramo}`;
  statusBadge.innerHTML = getStatusBadge(tramo.RutaEstado);

  detailsBody.innerHTML = `
    <div class="detail-grid">
      <div class="detail-row">
        <span class="detail-label">Provincia / Fuente</span>
        <span class="detail-value">${tramo.Provincia} (${tramo.Fuente})</span>
      </div>
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
        <span class="detail-value">${tramo.Fecha} ${tramo.Hora}</span>
      </div>
    </div>

    ${tramo.RutaSeccion ? `
      <div style="background-color: var(--bg-dark); padding: 0.85rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <span class="detail-label">Sección</span>
        <div class="detail-value" style="margin-top: 0.25rem;">${tramo.RutaSeccion}</div>
      </div>
    ` : ''}

    <div class="observations-box">
      <span class="detail-label">Observaciones del Parte Oficial</span>
      <p class="detail-value" style="margin-top: 0.35rem; line-height: 1.5;">${tramo.RutaObservacion || 'Sin observaciones registradas para este tramo.'}</p>
    </div>
  `;

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');

  state.activeRouteCode = null;
  updateURL();
  applyFilters();
}

function initEventListeners() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      updateURL();
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 300);
    });
  }

  const openTab = document.getElementById('sidebar-open-tab');
  if (openTab && sidebar) {
    openTab.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      updateURL();
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 300);
    });
  }

  const mobileBtn = document.getElementById('mobile-sidebar-open');
  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.remove('collapsed');
      updateURL();
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 300);
    });
  }

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

  // Botón de cambio de tema claro/oscuro
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  const searchInput = document.getElementById('search-input');
  const provinceSelect = document.getElementById('province-select');
  const routeSelect = document.getElementById('route-select');
  const statusSelect = document.getElementById('status-select');

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (provinceSelect) provinceSelect.addEventListener('change', applyFilters);
  if (routeSelect) routeSelect.addEventListener('change', applyFilters);
  if (statusSelect) statusSelect.addEventListener('change', applyFilters);
}

window.onRouteItemClick = onRouteItemClick;
window.openModalByCode = openModalByCode;
window.closeModal = closeModal;
window.highlightMapFeature = highlightMapFeature;
window.unhighlightMapFeature = unhighlightMapFeature;
window.toggleTheme = toggleTheme;

/**
 * Actualiza la URL con el estado actual del mapa y sidebar
 */
function updateURL() {
  if (!state.map) return;
  const center = state.map.getCenter();
  const zoom = state.map.getZoom();
  const sidebar = document.getElementById('sidebar');
  const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;

  const url = new URL(window.location);
  url.searchParams.set('lat', center.lat.toFixed(4));
  url.searchParams.set('lng', center.lng.toFixed(4));
  url.searchParams.set('z', zoom);
  url.searchParams.set('sidebar', isCollapsed ? 'collapsed' : 'open');

  if (state.activeRouteCode) {
    url.searchParams.set('code', state.activeRouteCode);
  } else {
    url.searchParams.delete('code');
  }

  window.history.replaceState({}, '', url);
}

/**
 * Inicialización principal: Fusiona DPV Neuquén + Vialidad Nacional
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Iniciando Estado de Rutas - Neuquén y Río Negro...');

    const urlParams = new URLSearchParams(window.location.search);
    const sidebar = document.getElementById('sidebar');
    if (urlParams.get('sidebar') === 'collapsed' && sidebar) {
      sidebar.classList.add('collapsed');
    } else if (urlParams.get('sidebar') === 'open' && sidebar) {
      sidebar.classList.remove('collapsed');
    }

    initMap();
    initEventListeners();

    // Cargar ambas fuentes en paralelo
    const [dpvData, vnData] = await Promise.all([
      fetchDPVNeuquenData(),
      fetchVialidadNacionalData()
    ]);

    const tramos = [...dpvData, ...vnData];
    state.allTramos = tramos;
    console.log(`Total tramos fusionados: ${tramos.length} (DPV: ${dpvData.length}, VN: ${vnData.length})`);

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

    populateStatusSelect();
    populateProvinceSelect(tramos);
    populateRouteSelect(tramos);
    updateLastUpdated(tramos);
    updateStats(tramos);
    renderRoutesList(tramos);

    await loadGeoJSONData();

    // Check code in URL and open modal/highlight if present
    const urlCode = urlParams.get('code');
    if (urlCode) {
       const matchedTramo = tramos.find(t => t.CodigoTramo === urlCode);
       if (matchedTramo) {
          onRouteItemClick(matchedTramo.CodigoTramo, matchedTramo._routeKey);
       }
    }

    console.log('Aplicación fusionada e inicializada con éxito.');
  } catch (err) {
    console.error('Error durante la inicialización:', err);
  }
});
