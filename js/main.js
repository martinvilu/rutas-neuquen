/**
 * Orquestador principal de la aplicación Estado de Rutas
 */
import { state } from './state.js';
import { getURLParams } from './url.js';
import { initMap, loadGeoJSONData, onRouteItemClick, highlightMapFeature, unhighlightMapFeature, toggleTheme } from './map.js';
import { initEventListeners, populateStatusSelect, populateProvinceSelect, populateRouteSelect, updateLastUpdated, updateStats, renderRoutesList, openModalByCode, closeModal } from './ui.js';
import { fetchDPVNeuquenData, fetchVialidadNacionalData, fetchVialidadRionegrinaData } from './api.js';

// Exponer funciones globales requeridas por atributos onclick/onmouseenter inline
window.onRouteItemClick = onRouteItemClick;
window.openModalByCode = openModalByCode;
window.closeModal = closeModal;
window.highlightMapFeature = highlightMapFeature;
window.unhighlightMapFeature = unhighlightMapFeature;
window.toggleTheme = toggleTheme;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Iniciando Estado de Rutas (Neuquén, Río Negro, Nacional)...');

    const urlParams = getURLParams();
    const sidebar = document.getElementById('sidebar');
    if (urlParams.sidebar === 'collapsed' && sidebar) {
      sidebar.classList.add('collapsed');
    } else if (urlParams.sidebar === 'open' && sidebar) {
      sidebar.classList.remove('collapsed');
    }

    initMap(urlParams);
    initEventListeners();

    // Carga paralela de todas las fuentes oficiales
    const [dpvData, vnData, vrnData] = await Promise.all([
      fetchDPVNeuquenData(),
      fetchVialidadNacionalData(),
      fetchVialidadRionegrinaData()
    ]);

    const tramos = [...dpvData, ...vnData, ...vrnData];
    state.allTramos = tramos;
    console.log(`Total tramos fusionados: ${tramos.length} (DPV: ${dpvData.length}, VN: ${vnData.length}, VRN: ${vrnData.length})`);

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

    // Si la URL contiene código de tramo, abrir y centrar automáticamente
    if (urlParams.code) {
      const matchedTramo = tramos.find(t => t.CodigoTramo === urlParams.code);
      if (matchedTramo) {
        onRouteItemClick(matchedTramo.CodigoTramo, matchedTramo._routeKey);
      }
    }

    console.log('Aplicación modularizada inicializada con éxito.');
  } catch (err) {
    console.error('Error durante la inicialización:', err);
  }
});
