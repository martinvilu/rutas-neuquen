import unittest
import http.server
import socketserver
import threading
import time
import asyncio
from playwright.async_api import async_playwright

PORT = 8089

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silenciar logs del servidor de pruebas

class TestE2EApp(unittest.TestCase):
    server = None
    server_thread = None

    @classmethod
    def setUpClass(cls):
        socketserver.TCPServer.allow_reuse_address = True
        cls.server = socketserver.TCPServer(("", PORT), QuietHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.5)

    @classmethod
    def tearDownClass(cls):
        if cls.server:
            cls.server.shutdown()
            cls.server.server_close()

    def test_full_e2e_flow(self):
        async def run_flow():
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()

                # 1. Cargar aplicación
                await page.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
                await page.wait_for_timeout(2000)

                # Verificar título
                title = await page.title()
                self.assertIn("Estado de Rutas", title)

                # 2. Verificar contadores de estadísticas
                stat_total = await page.locator('#stat-total').inner_text()
                self.assertTrue(int(stat_total) > 0, "El contador total de tramos debe ser mayor a 0")

                # 3. Verificar listado de tarjetas en el sidebar
                items = page.locator('.route-item')
                items_count = await items.count()
                self.assertTrue(items_count > 0, "Debe haber tarjetas de rutas renderizadas")

                # 4. Probar cambio de tema claro / oscuro
                theme_btn = page.locator('#theme-toggle')
                initial_theme = await page.evaluate("() => document.documentElement.getAttribute('data-theme')")
                await theme_btn.click()
                new_theme = await page.evaluate("() => document.documentElement.getAttribute('data-theme')")
                self.assertNotEqual(initial_theme, new_theme, "El tema debe haber cambiado tras el click")

                # 5. Probar filtro de búsqueda de texto
                search_input = page.locator('#search-input')
                await search_input.fill('Añelo')
                await page.wait_for_timeout(300)
                filtered_count = await page.locator('.route-item').count()
                self.assertTrue(filtered_count > 0 and filtered_count < items_count, "El buscador debe reducir los resultados")

                # Limpiar buscador
                await search_input.fill('')
                await page.wait_for_timeout(300)

                # 6. Probar filtro por provincia
                prov_select = page.locator('#province-select')
                await prov_select.select_option('Río Negro')
                await page.wait_for_timeout(300)
                rn_cards = page.locator('.route-item')
                rn_count = await rn_cards.count()
                self.assertTrue(rn_count > 0, "Debe mostrar tramos de Río Negro")
                first_text = await rn_cards.first.inner_text()
                self.assertIn("Río Negro", first_text)

                # Volver a todas las provincias
                await prov_select.select_option('')
                await page.wait_for_timeout(300)

                # 7. Probar click en tarjeta -> abrir modal y verificar URL
                first_card = page.locator('.route-item').first
                code = await first_card.get_attribute('data-code')
                await first_card.click()
                await page.wait_for_timeout(500)

                # Verificar modal activo
                modal = page.locator('#detail-modal')
                is_active = await modal.evaluate("el => el.classList.contains('active')")
                self.assertTrue(is_active, "El modal de detalle debe estar abierto")

                # Verificar código en la URL
                current_url = page.url
                self.assertIn(f"code={code}", current_url, "La URL debe contener el código del tramo activo")

                # 8. Cerrar modal y verificar remoción de código en la URL
                close_btn = page.locator('#modal-close')
                await close_btn.click()
                await page.wait_for_timeout(500)
                is_closed = await modal.evaluate("el => !el.classList.contains('active')")
                self.assertTrue(is_closed, "El modal debe haberse cerrado")
                self.assertNotIn("code=", page.url, "La URL no debe tener el parámetro code tras cerrar modal")

                # 9. Probar carga directa desde URL parametrizada
                param_url = f'http://localhost:{PORT}/?lat=-38.95&lng=-70.05&z=8&sidebar=collapsed&code={code}'
                await page.goto(param_url, wait_until='networkidle')
                await page.wait_for_timeout(1000)

                # Verificar que el sidebar esté colapsado y el modal abierto
                sidebar = page.locator('#sidebar')
                is_collapsed = await sidebar.evaluate("el => el.classList.contains('collapsed')")
                self.assertTrue(is_collapsed, "El sidebar debe restaurarse colapsado desde la URL")

                modal_restored = await modal.evaluate("el => el.classList.contains('active')")
                self.assertTrue(modal_restored, "El modal debe abrirse automáticamente desde el parámetro code")

                await browser.close()

        asyncio.run(run_flow())

if __name__ == '__main__':
    unittest.main()
