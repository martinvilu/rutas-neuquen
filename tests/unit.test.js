import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRouteKey, getStatusStyle, getStatusBadge, getHighestSeverityStatus } from '../js/utils.js';
import { parseCSV, parseVialidadNacional, parseVialidadRionegrina } from '../js/parsers.js';
import { filterTramos } from '../js/ui.js';

test('normalizeRouteKey - Normalización de nombres de rutas', () => {
  assert.equal(normalizeRouteKey('RP 7'), 'RP7');
  assert.equal(normalizeRouteKey('Ruta Provincial 7'), 'RP7');
  assert.equal(normalizeRouteKey('RN 22'), 'RN22');
  assert.equal(normalizeRouteKey('Ruta Nacional 40'), 'RN40');
  assert.equal(normalizeRouteKey('RP 65'), 'RP65');
  assert.equal(normalizeRouteKey('rp 13'), 'RP13');
  assert.equal(normalizeRouteKey('rn 237'), 'RN237');
  assert.equal(normalizeRouteKey('Ruta 5'), 'RP5');
  assert.equal(normalizeRouteKey('Balsa Sauce Blanco'), 'BALSASAUCEBLANCO');
  assert.equal(normalizeRouteKey(''), '');
  assert.equal(normalizeRouteKey(null), '');
});

test('getHighestSeverityStatus - Jerarquía de severidad', () => {
  assert.equal(getHighestSeverityStatus([]), 'NO_DATA');
  assert.equal(getHighestSeverityStatus(null), 'NO_DATA');
  assert.equal(getHighestSeverityStatus([{ RutaEstado: 'T' }]), 'T');
  assert.equal(getHighestSeverityStatus([{ RutaEstado: 'T' }, { RutaEstado: 'TCP' }]), 'TCP');
  assert.equal(getHighestSeverityStatus([{ RutaEstado: 'T' }, { RutaEstado: 'TCP' }, { RutaEstado: 'I' }]), 'I');
  assert.equal(getHighestSeverityStatus([{ RutaEstado: 'I' }, { RutaEstado: 'TCP' }]), 'I');
});

test('getStatusStyle - Estilos y colores según estado', () => {
  const intransitable = getStatusStyle('I');
  assert.equal(intransitable.color, '#ef4444');
  assert.equal(intransitable.dashArray, null);

  const precaucion = getStatusStyle('TCP');
  assert.equal(precaucion.color, '#f59e0b');

  const normal = getStatusStyle('T');
  assert.equal(normal.color, '#10b981');
  assert.equal(normal.dashArray, null);

  const noData = getStatusStyle('NO_DATA');
  assert.equal(noData.color, '#10b981');
  assert.ok(noData.dashArray.length > 0, 'NO_DATA debe tener línea punteada');
});

test('getStatusBadge - Generación de tags HTML', () => {
  assert.ok(getStatusBadge('I').includes('danger'));
  assert.ok(getStatusBadge('TCP').includes('warning'));
  assert.ok(getStatusBadge('T').includes('normal'));
  assert.ok(getStatusBadge('NO_DATA').includes('Sin Información'));
});

test('parseCSV - Parser de DPV Neuquén', () => {
  const sampleCSV = `CodigoTramo,RutaNumero,RutaProvincial,RutaTramo,RutaTipo,RutaLongitud,RutaEstado,RutaSeccion,RutaObservacion,Fecha,Hora
20,2,1,"Chos Malal - Tricao Malal",Ripio,48.5,TCP,"Norte","Transitable con precaución",13/08/2026,08:30
401,40,0,"Zapala - Las Lajas",Asfalto,58.0,T,"Centro","Calzada despejada",13/08/2026,08:30`;

  const parsed = parseCSV(sampleCSV);
  assert.equal(parsed.length, 2);

  assert.equal(parsed[0].CodigoTramo, 'DPV-20');
  assert.equal(parsed[0].Provincia, 'Neuquén');
  assert.equal(parsed[0].routeName, 'RP 2');
  assert.equal(parsed[0].RutaEstado, 'TCP');
  assert.equal(parsed[0].Fuente, 'DPV Neuquén');
  assert.equal(parsed[0]._routeKey, 'RP2');

  assert.equal(parsed[1].CodigoTramo, 'DPV-401');
  assert.equal(parsed[1].routeName, 'RN 40');
  assert.equal(parsed[1].RutaEstado, 'T');
  assert.equal(parsed[1]._routeKey, 'RN40');
});

test('parseVialidadNacional - Parser de Google Sheets VN', () => {
  const sampleRows = [
    ['Header 1', 'Header 2'],
    ['Subheader 1', 'Subheader 2'],
    ['Neuquén', '22', 'Arroyito - Zapala', 'TRANSITABLE', 'Pavimento', '98', '', 'Viento moderado', '13/08/2026 09:00'],
    ['Río Negro', '23', 'Pilcaniyeu - Comallo', 'TRANSITABLE CON PRECAUCIÓN', 'Ripio', '45', '', 'Sectores con barro', '13/08/2026 09:00'],
    ['Chubut', '40', 'Esquel - Epuyén', 'INTRANSITABLE POR NIEVE', 'Pavimento', '110', '', 'Corte preventivo', '13/08/2026 09:00']
  ];

  const parsed = parseVialidadNacional(sampleRows);
  assert.equal(parsed.length, 3);

  assert.equal(parsed[0].Provincia, 'Neuquén');
  assert.equal(parsed[0].routeName, 'RN 22');
  assert.equal(parsed[0].RutaEstado, 'T');
  assert.equal(parsed[0].Fuente, 'Vialidad Nacional');

  assert.equal(parsed[1].Provincia, 'Río Negro');
  assert.equal(parsed[1].routeName, 'RN 23');
  assert.equal(parsed[1].RutaEstado, 'TCP');

  assert.equal(parsed[2].Provincia, 'Chubut');
  assert.equal(parsed[2].routeName, 'RN 40');
  assert.equal(parsed[2].RutaEstado, 'I');
});

test('parseVialidadRionegrina - Parser de JSON de AppSheet', () => {
  const sampleVRN = [
    {
      CodigoTramo: 'VRN-1000',
      Provincia: 'Río Negro',
      RutaNumero: '5',
      RutaProvincial: '1',
      routeName: 'RP 5',
      RutaTramo: 'Maquinchao - El Caín',
      RutaTipo: 'Ripio',
      RutaLongitud: '94.6',
      RutaEstado: 'TCP',
      RutaSeccion: 'Andinas',
      RutaObservacion: 'Barro en calzada',
      Fecha: '08/13/2026',
      Hora: '',
      Fuente: 'Vialidad Rionegrina'
    }
  ];

  const parsed = parseVialidadRionegrina(sampleVRN);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].CodigoTramo, 'VRN-1000');
  assert.equal(parsed[0]._routeKey, 'RP5');
  assert.equal(parsed[0].Provincia, 'Río Negro');
});

test('filterTramos - Filtrado combinado de tramos', () => {
  const data = [
    { CodigoTramo: '1', Provincia: 'Neuquén', routeName: 'RP 7', RutaEstado: 'T', RutaTramo: 'Añelo', RutaObservacion: 'Normal', Fuente: 'DPV' },
    { CodigoTramo: '2', Provincia: 'Neuquén', routeName: 'RN 22', RutaEstado: 'TCP', RutaTramo: 'Zapala', RutaObservacion: 'Viento', Fuente: 'VN' },
    { CodigoTramo: '3', Provincia: 'Río Negro', routeName: 'RP 6', RutaEstado: 'I', RutaTramo: 'General Roca', RutaObservacion: 'Corte', Fuente: 'VRN' },
    { CodigoTramo: '4', Provincia: 'Chubut', routeName: 'RN 40', RutaEstado: 'TCP', RutaTramo: 'Esquel', RutaObservacion: 'Nieve', Fuente: 'VN' }
  ];

  // 1. Sin filtros
  assert.equal(filterTramos(data, {}).length, 4);

  // 2. Filtro por provincia
  assert.equal(filterTramos(data, { province: 'Neuquén' }).length, 2);
  assert.equal(filterTramos(data, { province: 'Río Negro' }).length, 1);

  // 3. Filtro por ruta
  assert.equal(filterTramos(data, { route: 'RN 22' }).length, 1);

  // 4. Filtro por estado
  assert.equal(filterTramos(data, { status: 'I' }).length, 1);
  assert.equal(filterTramos(data, { status: 'TCP' }).length, 2);
  assert.equal(filterTramos(data, { status: 'T' }).length, 1);

  // 5. Búsqueda de texto libre
  assert.equal(filterTramos(data, { search: 'esquel' }).length, 1);
  assert.equal(filterTramos(data, { search: 'corte' }).length, 1);
  assert.equal(filterTramos(data, { search: 'viento' }).length, 1);
  assert.equal(filterTramos(data, { search: 'inexistente' }).length, 0);

  // 6. Filtro cruzado combinado
  const combined = filterTramos(data, { province: 'Neuquén', status: 'TCP', search: 'zapala' });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].CodigoTramo, '2');
});
