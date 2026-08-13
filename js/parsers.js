/**
 * Parsers puros para los diferentes orígenes de datos
 */
import { normalizeRouteKey } from './utils.js';

/**
 * Parser de CSV de DPV Neuquén (exclusivamente Neuquén)
 */
export function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
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
      _routeKey: normalizeRouteKey(`${prefix}${rutaNumStr}`, 'Neuquén'),
      _routeNum: rutaNumStr
    });
  }

  return records;
}

/**
 * Parser de datos de Vialidad Nacional (Google Sheet)
 */
export function parseVialidadNacional(rows) {
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
      _routeKey: normalizeRouteKey(routeName, provNorm),
      _routeNum: rutaNum
    });
  }

  return records;
}

/**
 * Parser de datos de Vialidad Rionegrina (exclusivamente Río Negro)
 */
export function parseVialidadRionegrina(records) {
  if (!Array.isArray(records)) return [];
  return records.map(r => ({
    ...r,
    Provincia: 'Río Negro',
    _routeKey: normalizeRouteKey(r.routeName, 'Río Negro'),
    _routeNum: r.RutaNumero
  }));
}
