import unittest
import json
import csv
import os

class TestDataIntegrity(unittest.TestCase):

    def test_parte_diario_csv_exists_and_valid(self):
        csv_path = 'data/ParteDiario.csv'
        self.assertTrue(os.path.exists(csv_path), "ParteDiario.csv debe existir")
        with open(csv_path, encoding='utf-8-sig', errors='ignore') as f:
            reader = list(csv.DictReader(f))
            self.assertGreater(len(reader), 0, "ParteDiario.csv no debe estar vacío")
            first = reader[0]
            for field in ['CodigoTramo', 'RutaNumero', 'RutaProvincial', 'RutaTramo', 'RutaEstado']:
                self.assertIn(field, first, f"Falta campo requerido {field} en ParteDiario.csv")

    def test_vialidad_nacional_json_exists_and_valid(self):
        json_path = 'data/vialidad_nacional.json'
        self.assertTrue(os.path.exists(json_path), "vialidad_nacional.json debe existir")
        with open(json_path, encoding='utf-8') as f:
            data = json.load(f)
            values = data.get('values', [])
            self.assertGreater(len(values), 2, "vialidad_nacional.json debe tener filas de datos")

    def test_vialidad_rionegrina_json_exists_and_valid(self):
        json_path = 'data/vialidad_rionegrina.json'
        self.assertTrue(os.path.exists(json_path), "vialidad_rionegrina.json debe existir")
        with open(json_path, encoding='utf-8') as f:
            data = json.load(f)
            self.assertIsInstance(data, list, "vialidad_rionegrina.json debe ser una lista")
            self.assertGreater(len(data), 0, "vialidad_rionegrina.json no debe estar vacío")
            first = data[0]
            for field in ['CodigoTramo', 'Provincia', 'RutaNumero', 'RutaTramo', 'RutaEstado', 'Fuente']:
                self.assertIn(field, first, f"Falta campo {field} en vialidad_rionegrina.json")
                self.assertEqual(first['Provincia'], 'Río Negro')
                self.assertEqual(first['Fuente'], 'Vialidad Rionegrina')

    def test_segments_geojson_validity(self):
        geo_path = 'data/segments_geojson.json'
        self.assertTrue(os.path.exists(geo_path), "segments_geojson.json debe existir")
        with open(geo_path, encoding='utf-8') as f:
            geojson = json.load(f)
            self.assertEqual(geojson.get('type'), 'FeatureCollection')
            features = geojson.get('features', [])
            self.assertGreater(len(features), 0, "Debe contener features")

            for feat in features:
                self.assertEqual(feat.get('type'), 'Feature')
                geom = feat.get('geometry', {})
                self.assertEqual(geom.get('type'), 'LineString')
                coords = geom.get('coordinates', [])
                self.assertGreaterEqual(len(coords), 2, "LineString debe tener al menos 2 puntos")
                
                # Validar coordenadas en el cono sur / Patagonia
                for lon, lat in coords:
                    self.assertTrue(-75.0 <= lon <= -60.0, f"Longitud {lon} fuera de rango")
                    self.assertTrue(-50.0 <= lat <= -34.0, f"Latitud {lat} fuera de rango")

    def test_routes_geojson_filtered_correctly(self):
        geo_path = 'data/routes.geojson'
        if os.path.exists(geo_path):
            with open(geo_path, encoding='utf-8') as f:
                geojson = json.load(f)
                features = geojson.get('features', [])
                self.assertGreater(len(features), 0)

if __name__ == '__main__':
    unittest.main()
