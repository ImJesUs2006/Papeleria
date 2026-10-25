import { expect, test } from "@playwright/test";
import { login, ensureCajaAbierta, agregarPrimerProducto } from "./helpers";

// Flujo crítico del POS: login, cobro en efectivo, corte ciego y venta offline.
// Corre en serie (workers: 1) porque comparte estado de caja en la base de datos.

test.beforeEach(async ({ page }) => {
  // El corte ciego dispara window.print(); lo neutralizamos en headless.
  await page.addInitScript(() => {
    window.print = () => {};
  });
});

test.describe.serial("POS — flujo crítico", () => {
  test("login redirige al punto de venta", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/cobro");
    // En dev la primera visita compila la página: espera a que hidrate.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/cobro/);
    await expect(page.getByText("Punto de Venta")).toBeVisible();
  });

  test("cobro en efectivo genera una venta", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);

    await page.goto("/cobro");
    // En dev la primera visita compila la página: espera a que hidrate.
    await page.waitForLoadState("networkidle");
    await agregarPrimerProducto(page);
    await expect(page.getByText(/1 (artículos?|productos?)/i)).toBeVisible();

    await page.getByRole("button", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: /Cobrar \$/ }).click();

    await expect(page.getByText("¡Venta registrada!")).toBeVisible();
    // El folio aparece dos veces en el modal (encabezado y vista previa del
    // ticket): basta con que el primero sea visible.
    await expect(page.getByText(/Folio: F-/).first()).toBeVisible();
  });

  test("corte ciego cierra la caja sin filtrar esperados", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/caja");

    const abrir = page.getByRole("button", { name: "Abrir Caja" });
    if (await abrir.isVisible().catch(() => false)) {
      await page.locator('input[type="number"]').first().fill("500");
      await abrir.click();
    }

    await page.getByRole("button", { name: /Cerrar Caja|Continuar corte/ }).click();

    const iniciar = page.getByRole("button", { name: /^Iniciar corte$/ });
    if (await iniciar.isVisible().catch(() => false)) {
      await iniciar.click();
    }

    // Corte ciego: nunca se muestran los montos esperados durante el conteo.
    await expect(page.getByText(/Efectivo esperado|Lo que espera el sistema/)).toHaveCount(0);

    // Conteo por billetes: el total se suma solo.
    await page.getByLabel("Billetes de $500").fill("1");
    await expect(page.getByTestId("efectivo-contado")).toHaveText("$500.00");
    await page.getByRole("button", { name: "Confirmar conteo y cerrar caja" }).click();

    await expect(page.getByText(/Caja cuadrada|La caja no cuadra/)).toBeVisible();
    await page.getByRole("button", { name: "Terminar" }).click();

    await expect(page.getByRole("button", { name: "Abrir Caja" })).toBeVisible();
  });

  test("venta sin conexión se guarda en la cola offline", async ({ page, context }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/cobro");
    // En dev la primera visita compila la página: espera a que hidrate.
    await page.waitForLoadState("networkidle");
    await agregarPrimerProducto(page);
    await expect(page.getByText(/1 (artículos?|productos?)/i)).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: "Exacto" }).click();
    await page.getByRole("button", { name: /Cobrar \$/ }).click();
    await expect(page.getByText("¡Venta guardada offline!")).toBeVisible();
    // El folio aparece dos veces en el modal (encabezado y vista previa del
    // ticket): basta con que el primero sea visible.
    await expect(page.getByText(/Folio: OF-/).first()).toBeVisible();
    await context.setOffline(false);
  });
});