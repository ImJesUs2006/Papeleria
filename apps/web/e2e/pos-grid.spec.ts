import { expect, test } from "@playwright/test";
import { login, ensureCajaAbierta } from "./helpers";

// UX Fase 1: el centro del POS debe mostrar el catálogo táctil (grid)
// con al menos un producto clicable que agregue al carrito sin lector.
// Desde Fase C el /cobro exige una sesión ABIERTA (ensureCajaAbierta).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {};
  });
});

test.describe("POS — catálogo táctil (Fase 1)", () => {
  test("el grid de productos se renderiza con tarjetas interactivas", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/cobro");

    const grid = page.locator('[data-testid="product-grid"]');
    await expect(grid).toBeVisible();

    // El grid debe exponer al menos una tarjeta de producto clicable.
    const tarjetas = page.locator('[data-testid="product-card"]:not([disabled])');
    await expect(tarjetas.first()).toBeVisible();
    const count = await tarjetas.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Las tarjetas muestran precio en la moneda del negocio.
    await expect(tarjetas.first().getByText(/\$\d/)).toBeVisible();
  });

  test("tocar una tarjeta agrega el producto al carrito", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/cobro");

    const tarjetas = page.locator('[data-testid="product-card"]:not([disabled])');
    await expect(tarjetas.first()).toBeVisible();
    await tarjetas.first().click();

    // El cart panel refleja la línea agregada (1 artículo).
    await expect(page.getByText(/1 artículo/)).toBeVisible();
  });

  test("el grid coexiste con el escaneo por código", async ({ page }) => {
    await login(page);
    await ensureCajaAbierta(page);
    await page.goto("/cobro");

    await expect(page.getByRole("button", { name: /Enfoca tu lector/ })).toBeVisible();
    const grid = page.locator('[data-testid="product-grid"]');
    await expect(grid).toBeVisible();
    await expect(grid.locator('[data-testid="product-card"]').first()).toBeVisible();
  });
});