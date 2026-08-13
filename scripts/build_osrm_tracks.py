import json, csv, re, os, time
import urllib.request

print("Iniciando generación de tracks estáticos vía OSRM...")

os.makedirs('data', exist_ok=True)

# 1. Cargar DPV Neuquén
dpv_tramos = []
if os.path.exists('data/ParteDiario.csv'):
    with open('data/ParteDiario.csv', encoding='utf-8-sig', errors='ignore') as f:
        dpv_tramos = list(csv.DictReader(f))

# 2. Cargar Vialidad Nacional
vn_rows = []
if os.path.exists('data/vialidad_nacional.json'):
    try:
        with open('data/vialidad_nacional.json', encoding='utf-8') as f:
            vn = json.load(f)
            vn_rows = vn.get('values', [])[2:]
    except Exception as e:
        print("Error leyendo vialidad_nacional.json:", e)

# Diccionario de coordenadas
nodes = {
    # Neuquén
    'NEUQUEN': [-68.0591, -38.9516], 'CENTENARIO': [-68.1328, -38.8315], 'VISTA ALEGRE': [-68.1923, -38.7511],
    'EMP RP 51': [-68.3278, -38.7083], 'EL CRUCE': [-68.5134, -38.6011], 'AÑELO': [-68.7844, -38.3524],
    'EMP RP 5': [-69.2150, -37.8920], 'LOS RANQUILES': [-69.7810, -37.4520], 'CORTADERAS': [-70.0810, -37.4010],
    'OCTAVIO PICO': [-67.9250, -37.6044], 'CRUCERO CATRIEL': [-68.0210, -37.7850], 'RINCON DE LOS SAUCES': [-68.9281, -37.3922],
    'PUESTO HERNANDEZ': [-69.3120, -37.1850], 'CHOS MALAL': [-70.2709, -37.3783], 'TRICAO MALAL': [-70.3320, -37.0350],
    'CANCHA HUINGANCO': [-70.5210, -36.9150], 'HUINGANCO': [-70.5167, -36.9000], 'EL HUECU': [-70.5794, -37.6439],
    'MALLIN LARGO': [-70.4320, -37.5210], 'NAUNAUCO': [-70.3120, -37.4520], 'MARIANO MORENO': [-70.0150, -38.7478],
    'EMP RP 16': [-69.8510, -38.6520], 'TRES PIEDRAS': [-69.7510, -38.8120], 'PASO DE LOS INDIOS': [-69.5510, -38.9810],
    'PLAZA HUINCUL': [-69.2306, -38.9344], 'CUTRAL CO': [-69.2306, -38.9372], 'PICUN LEUFU': [-69.2833, -39.5167],
    'ZAPALA': [-70.0551, -38.9026], 'PRIMEROS PINOS': [-70.6333, -38.8667], 'LITRAN': [-71.1000, -38.8833],
    'ANGOSTURA': [-71.1850, -38.8850], 'BATEA MAHUIDA': [-71.2150, -38.8520], 'PASO ICALMA': [-71.2667, -38.8333],
    'MOQUEHUE': [-71.2833, -38.9000], 'ÑORQUINCO': [-71.2510, -39.1520], 'LOS CRUCEROS': [-71.2210, -38.9150],
    'COVUNCO CENTRO': [-70.1250, -38.6810], 'BAJADA DEL AGRIO': [-70.0833, -38.3500], 'RUCA CHOROI': [-71.1850, -39.2210],
    'ANDACOLLO': [-70.6728, -37.1794], 'LAS OVEJAS': [-70.7483, -36.9922], 'VARVARCO': [-70.6667, -36.8500],
    'MANZANO AMARGO': [-70.7833, -36.7500], 'EL CHOLAR': [-70.6500, -37.4500], 'PICHACHEN': [-71.1444, -37.4475],
    'LONCOPUE': [-70.6133, -38.0722], 'CAVIAHUE': [-71.0500, -37.8800], 'COPAHUE': [-71.0970, -37.8180],
    'LAS LAJAS': [-70.3683, -38.5178], 'PASO PINO HACHADO': [-70.8833, -38.6500], 'ALUMINE': [-70.9167, -39.2361],
    'JUNIN DE LOS ANDES': [-71.0694, -39.9504], 'SAN MARTIN DE LOS ANDES': [-71.3533, -40.1579],
    'VILLA LA ANGOSTURA': [-71.6428, -40.7634], 'PASO SAMORE': [-71.9420, -40.7150], 'CARDENAL SAMORE': [-71.9420, -40.7150],
    'VILLA TRAFUL': [-71.4167, -40.4833], 'CONFLUENCIA TRAFUL': [-71.1520, -40.5010], 'PIEDRA DEL AGUILA': [-70.0767, -40.0461],
    'ARROYITO': [-68.5833, -39.0833], 'PLOTTIER': [-68.2333, -38.9667],
    
    # Río Negro
    'BARILOCHE': [-71.3103, -41.1335], 'EL BOLSON': [-71.5167, -41.9667], 'VILLA MASCARDI': [-71.5167, -41.3500],
    'PASO FLORES': [-70.6510, -40.6150], 'PILCANIYEU': [-70.7220, -41.1220], 'COMALLO': [-70.2667, -41.0333],
    'INGENIERO JACOBACCI': [-69.5500, -41.3333], 'MAQUINCHAO': [-68.7000, -41.2500], 'LOS MENUCOS': [-68.1000, -40.8333],
    'RAMOS MEXIA': [-67.2500, -40.7000], 'VALCHETA': [-66.1500, -40.7000], 'SAN ANTONIO OESTE': [-64.9500, -40.7333],
    'SIERRA GRANDE': [-65.3500, -41.6000], 'VIEDMA': [-62.9967, -40.8135], 'GENERAL CONESA': [-64.4333, -40.1000],
    'RIO COLORADO': [-64.0833, -38.9833], 'CHOELE CHOEL': [-65.6833, -39.2667], 'CHIMPAY': [-65.6833, -39.1667],
    'GENERAL ROCA': [-67.5833, -39.0333], 'ALLEN': [-67.8333, -38.9833], 'CIPOLLETTI': [-67.9944, -38.9389],
    'CATRIEL': [-67.8000, -37.8778],
    
    # Chubut
    'COMODORO RIVADAVIA': [-67.4833, -45.8667], 'TRELEW': [-65.3000, -43.2500], 'PUERTO MADRYN': [-65.0333, -42.7667],
    'ESQUEL': [-71.3167, -42.9167], 'TREVELIN': [-71.4667, -43.0833], 'RAWSON': [-65.1000, -43.3000],
    'GAIMAN': [-65.4833, -43.2833], 'PASO DE INDIOS CHUBUT': [-69.0500, -43.8667], 'TECKA': [-70.8000, -43.4833],
    'GOBERNADOR COSTA': [-70.5833, -44.0500], 'SARMIENTO': [-69.0833, -45.5833], 'RIO MAYO': [-70.2500, -45.6833],
    'LAGO PUELO': [-71.6000, -42.0667], 'EL HOYO': [-71.5000, -42.1000], 'EPUYEN': [-71.3667, -42.2333],
    'CHOLILA': [-71.4500, -42.5167]
}

def get_osrm_route(coords_list):
    # coords_list is a list of [lon, lat]
    coord_str = ';'.join([f"{c[0]},{c[1]}" for c in coords_list])
    url = f"http://router.project-osrm.org/route/v1/driving/{coord_str}?overview=full&geometries=geojson"
    req = urllib.request.Request(url, headers={'User-Agent': 'PatagoniaRoutesApp/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get('code') == 'Ok' and data.get('routes'):
                return data['routes'][0]['geometry']
    except Exception as e:
        print(f"OSRM Error para {coord_str}: {e}")
    return None

features = []

# Procesar DPV
for tramo in dpv_tramos:
    codigo = f"DPV-{tramo.get('CodigoTramo')}"
    name_str = tramo.get('RutaTramo', '').upper()
    
    pts = []
    for k, coords in nodes.items():
        if k in name_str:
            pts.append(coords)
    
    if len(pts) >= 2:
        geom = get_osrm_route(pts)
        if geom:
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': {'codigo': codigo, 'name': name_str}
            })
            print(f"Ruteado: {codigo} - {name_str}")
        time.sleep(0.5)

# Procesar Vialidad Nacional
vn_counter = 1000
for r in vn_rows:
    if not r or len(r) < 3: continue
    codigo = f"VN-{vn_counter}"
    vn_counter += 1
    name_str = (r[2] if len(r) > 2 else '').strip().upper()
    
    pts = []
    for k, coords in nodes.items():
        if k in name_str:
            pts.append(coords)
    
    if len(pts) >= 2:
        geom = get_osrm_route(pts)
        if geom:
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': {'codigo': codigo, 'name': name_str}
            })
            print(f"Ruteado: {codigo} - {name_str}")
        time.sleep(0.5)

output_geojson = {'type': 'FeatureCollection', 'features': features}
with open('data/segments_geojson.json', 'w', encoding='utf-8') as f:
    json.dump(output_geojson, f, ensure_ascii=False)

print(f"Generado data/segments_geojson.json con {len(features)} tracks estáticos de OSRM sin ruido.")
