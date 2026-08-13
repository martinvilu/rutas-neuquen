/**
 * Funciones de utilidad y normalización
 */

/**
 * Normaliza nombres de rutas para macheo uniforme y aislado por provincia
 * (ej: 'RP 7', 'Neuquén' -> 'NQN_RP7', 'RP 6', 'Río Negro' -> 'RN_RP6', 'RN 22' -> 'RN22')
 */
export function normalizeRouteKey(str, provincia = '') {
  if (!str) return '';
  let clean = String(str).toUpperCase().trim();
  clean = clean.replace(/RUTA\s+PROVINCIAL\s+/i, 'RP');
  clean = clean.replace(/RUTA\s+NACIONAL\s+/i, 'RN');
  clean = clean.replace(/RUTA\s+/i, 'RP');
  clean = clean.replace(/[^A-Z0-9]/g, '');

  const m = clean.match(/^(RP|RN|BALSA)?(\d+)/);
  let baseKey = clean;
  if (m) {
    const prefix = m[1] || 'RP';
    const num = m[2];
    baseKey = `${prefix}${num}`;
  }

  // Rutas Nacionales (RN) son corredores federales
  if (baseKey.startsWith('RN')) {
    return baseKey;
  }

  // Rutas Provinciales y Balsas se prefijan con la provincia para evitar colisiones
  if (provincia) {
    const provNorm = provincia.toLowerCase();
    if (provNorm.includes('neuqu')) return `NQN_${baseKey}`;
    if (provNorm.includes('r') || provNorm.includes('negro')) return `RN_${baseKey}`;
    if (provNorm.includes('chubut')) return `CHB_${baseKey}`;
  }

  return baseKey;
}

/**
 * Retorna el estilo de línea por estado para la capa vectorial
 */
export function getStatusStyle(status) {
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
 * Retorna el HTML del badge de estado
 */
export function getStatusBadge(status) {
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
 * Calcula el estado de mayor severidad en una lista de tramos (I > TCP > T > NO_DATA)
 */
export function getHighestSeverityStatus(tramos) {
  if (!tramos || tramos.length === 0) return 'NO_DATA';
  if (tramos.some(t => t.RutaEstado === 'I')) return 'I';
  if (tramos.some(t => t.RutaEstado === 'TCP')) return 'TCP';
  if (tramos.some(t => t.RutaEstado === 'T')) return 'T';
  return 'NO_DATA';
}
