/**
 * Módulo de interfaz de usuario, listas, contadores, filtros y modales
 */
import { state } from './state.js';
import { getStatusBadge, getStatusStyle, getHighestSeverityStatus } from './utils.js';
import { updateURL } from './url.js';
import { onRouteItemClick, highlightMapFeature, unhighlightMapFeature, toggleTheme } from './map.js';

/**
 * Actualiza contadores en el header
 */
export function updateStats(tramos) {
  let total = tramos.length;
  let intransitable = 0;
  let precaucion = 0;
  let normal = 0;

  tramos.forEach(t => {
    if (t.RutaEstado === 'I') intransitable++;
    else if (t.RutaEstado === 'TCP') precaucion++;
    else normal++;
  });

  const setElText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('stat-total', total);
  setElText('stat-intransitable', intransitable);
  setElText('stat-precaucion', precaucion);
  setElText('stat-normal', normal);
}

/**
 * Actualiza el texto de última actualización
 */
export function updateLastUpdated(tramos) {
  const el = document.getElementById('last-updated');
  if (!el || tramos.length === 0) return;

  const vnTramos = tramos.filter(t => t.Fuente === 'Vialidad Nacional');
  if (vnTramos.length > 0) {
    const vnText = `${vnTramos[0].Fecha || 'Hoy'} ${vnTramos[0].Hora || ''}`.trim();
    el.textContent = `Última actualización: ${vnText}`;
  } else {
    const first = tramos[0];
    el.textContent = `Última actualización: ${first.Fecha || 'Hoy'} ${first.Hora || ''}`;
  }
}

/**
 * Pobla el selector de provincias
 */
export function populateProvinceSelect(tramos) {
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
 * Pobla el selector de rutas
 */
export function populateRouteSelect(tramos) {
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
 * Configura opciones del selector de estado
 */
export function populateStatusSelect() {
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
 * Renderiza el listado de tarjetas en el sidebar
 */
export function renderRoutesList(tramos) {
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
               onclick="window.onRouteItemClick('${t.CodigoTramo}', '${t._routeKey}')" 
               onmouseenter="window.highlightMapFeature('${t.CodigoTramo}')" 
               onmouseleave="window.unhighlightMapFeature('${t.CodigoTramo}')"
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
 * Filtrado puro de tramos
 */
export function filterTramos(tramos, filters) {
  const { search = '', province = '', route = '', status = 'ALL' } = filters;
  const searchVal = search.trim().toLowerCase();

  return tramos.filter(t => {
    if (province && t.Provincia !== province) return false;
    if (route && t.routeName !== route) return false;
    if (status && status !== 'ALL') {
      if (status === 'T') {
        if (t.RutaEstado === 'I' || t.RutaEstado === 'TCP') return false;
      } else if (t.RutaEstado !== status) {
        return false;
      }
    }
    if (searchVal) {
      const fullText = `${t.routeName} ${t.Provincia} ${t.RutaTramo} ${t.RutaSeccion} ${t.RutaObservacion} ${t.RutaTipo} ${t.Fuente}`.toLowerCase();
      if (!fullText.includes(searchVal)) return false;
    }
    return true;
  });
}

/**
 * Aplica los filtros del DOM y refresca la vista
 */
export function applyFilters() {
  const searchInput = document.getElementById('search-input');
  const provinceSelect = document.getElementById('province-select');
  const routeSelect = document.getElementById('route-select');
  const statusSelect = document.getElementById('status-select');

  state.filters.search = searchInput ? searchInput.value : '';
  state.filters.province = provinceSelect ? provinceSelect.value : '';
  state.filters.route = routeSelect ? routeSelect.value : '';
  state.filters.status = statusSelect ? statusSelect.value : 'ALL';

  const filtered = filterTramos(state.allTramos, state.filters);

  renderRoutesList(filtered);
  updateStats(filtered);
  updateMapFeaturesVisibility(filtered);
}

/**
 * Actualiza la visibilidad y estilos en el mapa
 */
export function updateMapFeaturesVisibility(tramosFiltrados) {
  if (!state.geoJsonLayer) return;

  const activeCodes = new Set(tramosFiltrados.map(t => t.CodigoTramo));

  state.featureLayerMap.forEach(({ layer, tramos }) => {
    if (!tramos || tramos.length === 0) {
      const style = getStatusStyle('NO_DATA');
      layer.setStyle({ opacity: style.opacity, weight: style.weight, color: style.color, dashArray: style.dashArray });
      return;
    }

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
      layer.setStyle({ opacity: 0.15, weight: 2, dashArray: '4, 6', color: '#10b981' });
    }
  });
}

/**
 * Abre el modal con el detalle completo del tramo
 */
export function openModal(tramo) {
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

export function openModalByCode(codigoTramo) {
  const tramo = state.allTramos.find(t => t.CodigoTramo === String(codigoTramo));
  if (tramo) {
    openModal(tramo);
  }
}

export function closeModal() {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');

  state.activeRouteCode = null;
  updateURL();
  applyFilters();
}

/**
 * Registra listeners de eventos del DOM
 */
export function initEventListeners() {
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
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
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

  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

  const searchInput = document.getElementById('search-input');
  const provinceSelect = document.getElementById('province-select');
  const routeSelect = document.getElementById('route-select');
  const statusSelect = document.getElementById('status-select');

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (provinceSelect) provinceSelect.addEventListener('change', applyFilters);
  if (routeSelect) routeSelect.addEventListener('change', applyFilters);
  if (statusSelect) statusSelect.addEventListener('change', applyFilters);
}
