import asyncio, json, re, os
from playwright.async_api import async_playwright

print("Iniciando scraper de Vialidad Rionegrina (AppSheet)...")

os.makedirs('data', exist_ok=True)

async def scrape_appsheet():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()
        
        url = 'https://www.appsheet.com/start/362d5047-a335-45c3-ac45-d9943cdddb7c?platform=desktop'
        print(f"Navegando a {url}...")
        
        try:
            await page.goto(url, wait_until='networkidle', timeout=60000)
        except Exception as e:
            print(f"Advertencia durante goto: {e}")
            
        await page.wait_for_timeout(3000)
        
        # Click en Accept si aparece el modal de términos
        try:
            accept_btn = page.locator('button:has-text("Accept"), span:has-text("Accept")')
            if await accept_btn.count() > 0:
                await accept_btn.first.click()
                print("Aceptado diálogo de términos de AppSheet.")
                await page.wait_for_timeout(2000)
        except Exception as e:
            print(f"No se encontró o no se pudo clickear Accept: {e}")
            
        # Esperar sincronización del cliente AppSheet
        print("Esperando sincronización de tablas de AppSheet (8s)...")
        await page.wait_for_timeout(8000)
        
        # Extraer tablas de AppModel
        raw_tables = await page.evaluate('''() => {
            const m = window.AppModel;
            if (!m || !m.Tables) return null;
            const res = {};
            for (let i = 0; i < m.Tables.length; i++) {
                const tbl = m.Tables[i];
                if (tbl.Rows && Object.keys(tbl.Rows).length > 0) {
                    res[tbl.Name] = tbl.Rows;
                }
            }
            return res;
        }''')
        
        await browser.close()
        return raw_tables

def parse_and_save(raw_tables):
    if not raw_tables:
        print("Error: No se pudieron extraer tablas de AppSheet.")
        return False
        
    fecha_reporte = 'Hoy'
    if 'Fecha' in raw_tables:
        fecha_rows = raw_tables['Fecha']
        if isinstance(fecha_rows, dict):
            fecha_rows = list(fecha_rows.values())
        if fecha_rows and len(fecha_rows) > 0:
            fecha_reporte = fecha_rows[0].get('ULTIMA ACTUALIZACIÓN', 'Hoy')
            
    records = []
    id_counter = 1000
    
    # Procesar tablas de rutas (Andinas, Atlánticas, Balsas)
    target_tables = ['Andinas', 'Atlánticas', 'Balsas']
    
    for tname in target_tables:
        rows = raw_tables.get(tname, [])
        if isinstance(rows, dict):
            rows = list(rows.values())
            
        for r in rows:
            ruta_raw = (r.get('RUTA') or r.get('BALSA') or '').strip()
            tramo_raw = (r.get('TRAMO') or '').strip()
            calzada_raw = (r.get('CALZADA') or r.get('HORARIO') or '').strip()
            estado_raw = (r.get('ESTADO') or '').strip().upper()
            long_raw = str(r.get('LONG. Km.') or '').strip()
            obs_raw = (r.get('OBSERVACIONES') or '').strip()
            
            # Extraer número de ruta
            num_match = re.search(r'\d+', ruta_raw)
            ruta_num = num_match.group(0) if num_match else 'S/N'
            
            is_balsa = 'BALSA' in r or tname == 'Balsas'
            prefix = 'Balsa' if is_balsa else 'RP'
            route_name = f"{prefix} {ruta_num}" if not is_balsa else f"Balsa {ruta_raw}"
            
            # Normalizar estado
            estado = 'T'
            if any(k in estado_raw for k in ['INTRANSITABLE', 'CORTE', 'INTERRUMPIDO', 'CLAUSURADO', 'SUSPENDIDO']):
                estado = 'I'
            elif any(k in estado_raw for k in ['PRECAUCIÓN', 'PRECAUCION', 'RESTRINGIDA', 'ALERTA', 'CONDICIONAL']):
                estado = 'TCP'
                
            records.append({
                'CodigoTramo': f"VRN-{id_counter}",
                'Provincia': 'Río Negro',
                'RutaNumero': ruta_num,
                'RutaProvincial': '0' if is_balsa else '1',
                'routeName': route_name,
                'RutaTramo': tramo_raw,
                'RutaTipo': calzada_raw,
                'RutaLongitud': long_raw,
                'RutaEstado': estado,
                'RutaSeccion': tname,
                'RutaObservacion': obs_raw,
                'Fecha': fecha_reporte,
                'Hora': '',
                'Fuente': 'Vialidad Rionegrina'
            })
            id_counter += 1
            
    with open('data/vialidad_rionegrina.json', 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
        
    print(f"Éxito: Se guardaron {len(records)} tramos de Vialidad Rionegrina en data/vialidad_rionegrina.json (Fecha: {fecha_reporte}).")
    return True

if __name__ == '__main__':
    raw = asyncio.run(scrape_appsheet())
    parse_and_save(raw)
