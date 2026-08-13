/**
 * Módulo de conexión a APIs y carga de datos asíncrona
 */
import { parseCSV, parseVialidadNacional, parseVialidadRionegrina } from './parsers.js';

/**
 * Carga de datos de DPV Neuquén (CSV) con fallbacks
 */
export async function fetchDPVNeuquenData() {
  const urlDirect = 'https://w2.dpvneuquen.gov.ar/ParteDiario.csv';
  const urls = [
    'data/ParteDiario.csv',
    urlDirect,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(urlDirect)}`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        const records = parseCSV(text);
        if (records.length > 0) {
          return records;
        }
      }
    } catch (err) {
      // Continuar al siguiente fallback
    }
  }
  console.error('No se pudo cargar DPV Neuquén');
  return [];
}

/**
 * Carga de datos de Vialidad Nacional (Google Sheets API)
 */
export async function fetchVialidadNacionalData() {
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
      // Continuar al siguiente fallback
    }
  }
  console.error('No se pudo cargar Vialidad Nacional');
  return [];
}

/**
 * Carga de datos de Vialidad Rionegrina
 */
export async function fetchVialidadRionegrinaData() {
  try {
    const response = await fetch('data/vialidad_rionegrina.json');
    if (response.ok) {
      const records = await response.json();
      return parseVialidadRionegrina(records);
    }
  } catch (err) {
    console.warn('No se pudo cargar data/vialidad_rionegrina.json:', err);
  }
  return [];
}

/**
 * Carga capas GeoJSON combinadas (base OSM + segmentos OSRM)
 */
export async function fetchGeoJSONLayers() {
  const geojsonData = { type: 'FeatureCollection', features: [] };

  // Capa base
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

  // Capa OSRM segmentos exactos
  try {
    const respSeg = await fetch('data/segments_geojson.json');
    if (respSeg.ok) {
      const seg = await respSeg.json();
      geojsonData.features.push(...seg.features);
    }
  } catch (e) {
    console.warn('No se pudo cargar la capa de segmentos exactos.');
  }

  return geojsonData;
}
