/**
 * Módulo de sincronización y lectura de estado en la URL
 */
import { state } from './state.js';

/**
 * Lee los parámetros iniciales de la URL
 */
export function getURLParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    lat: parseFloat(params.get('lat')) || -39.5,
    lng: parseFloat(params.get('lng')) || -67.5,
    zoom: parseInt(params.get('z'), 10) || 6,
    sidebar: params.get('sidebar') || 'open',
    code: params.get('code') || null
  };
}

/**
 * Actualiza la URL del navegador con el estado actual del mapa y sidebar
 */
export function updateURL() {
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
