import { expect, type Page } from "@playwright/test";

// Helpers comunes del flujo POS E2E.
// Desde Fase C el cobro exige una sesión de caja ABIERTA: los flujos que
// validan el contenido del /cobro (grid, carrito, folio) DEBEN pasar por
// ensureCajaAbierta antes de navegar, igual que haría una cajera real.

export async function login(page: Page, username = "admin", password = "admin123") {
  await page.goto("/login");
  await page.getByPlaceholder("Tu usuario").fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(cobro|setup)/);
  await completarSetupSiEsNecesario(page);
  await aceptarTerminosSiSePiden(page);
}

// El dueño(a) acepta términos y aviso de privacidad la primera vez (Fase H).
export async function aceptarTerminosSiSePiden(page: Page) {
  const aviso = page.getByTestId("aceptar-legal");
  if (await aviso.waitFor({ timeout: 3000 }).then(() => true, () => false)) {
    await page.getByTestId("leido-legal").check();
    await page.getByTestId("aceptar-legal-boton").click();
    await aviso.waitFor({ state: "hidden" });
  }
}

// Primer arranque: la administradora define tipo de negocio, pagos y módulos.
export async function completarSetupSiEsNecesario(page: Page) {
  if (!page.url().includes("/setup")) return;
  await page.getByRole("button", { name: /Papelería \/ Retail/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: /Guardar y empezar/ }).click();
  await page.waitForURL(/\/cobro/);
}

// Abre la sesión de caja vía API si aún no hay una ABIERTA (idempotente).
export async function ensureCajaAbierta(page: Page) {
  const res = await page.request.get("/api/caja/estado");
  const data = await res.json().catch(() => ({}));
  if (!data?.sesion) {
    await page.request.post("/api/caja/abrir", { data: { fondoInicial: 500 } });
  }
}

export async function agregarPrimerProducto(page: Page) {
  await page.getByRole("button", { name: /Enfoca tu lector/ }).click();
  await page.getByPlaceholder(/Nombre del producto/).fill("a");
  const tarjeta = page.locator('button:has-text("uds")').first();
  await expect(tarjeta).toBeVisible();
  await tarjeta.click();
  await page.getByRole("button", { name: "Hecho" }).click();
}