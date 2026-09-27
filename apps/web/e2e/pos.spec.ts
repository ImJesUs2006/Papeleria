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
    await expect(page).toHaveURL(/\/cobro/);
    await expect(page.getByText("Punto de Venta")).toBeVisible();
  });

  test("cobro en efectivo genera una venta", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);

    await page.goto("/cobro");
    await agregarPrimerProducto(page);
    await expect(page.getByText(/1 artículo/)).toBeVisible();

    await page.getByRole("button", { name: "Efectivo" }).click();
    await page.getByRole("button", { name: /Cobrar \$/ }).click();

    await expect(page.getByText("¡Venta registrada!")).toBeVisible();
    await expect(page.getByText(/Folio: F-/)).toBeVisible();
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

    const iniciar = page.getByRole("button", { name: /Iniciar corte ciego/ });
    if (await iniciar.isVisible().catch(() => false)) {
      await iniciar.click();
    }

    // Nunca deben mostrarse los montos esperados durante el conteo.
    await expect(page.getByText(/Efectivo esperado/)).toHaveCount(0);

    await page.getByPlaceholder("Ej. 1250.50").fill("0");
    await page.getByRole("button", { name: "Confirmar conteo" }).click();

    await expect(page.getByText(/Caja cuadrada|Descuadre detectado/)).toBeVisible();
    await page.getByRole("button", { name: "Terminar" }).click();

    await expect(page.getByRole("button", { name: "Abrir Caja" })).toBeVisible();
  });

  test("venta sin conexión se guarda en la cola offline", async ({ page, context }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/cobro");
    await agregarPrimerProducto(page);
    await expect(page.getByText(/1 artículo/)).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: /Cobrar \$/ }).click();
    await expect(page.getByText("¡Venta guardada offline!")).toBeVisible();
    await expect(page.getByText(/Folio: OF-/)).toBeVisible();
    await context.setOffline(false);
  });
});