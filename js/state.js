/**
 * Estado global centralizado de la aplicación
 */
export const state = {
  map: null,
  geoJsonLayer: null,
  darkTileLayer: null,
  lightTileLayer: null,
  currentTheme: 'dark',
  featureLayerMap: new Map(), // featureId -> { layer, tramos, bounds, feature }
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
