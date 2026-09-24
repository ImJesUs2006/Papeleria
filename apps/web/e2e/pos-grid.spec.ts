import { expect, test, type Page } from "@playwright/test";

// UX Fase 1: el centro del POS debe mostrar el catálogo táctil (grid)
// con al menos un producto clicable que agregue al carrito sin lector.

async function login(page: Page, username = "admin", password = "admin123") {
  await page.goto("/login");
  await page.getByPlaceholder("Tu usuario").fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(cobro|setup)/);
  if (page.url().includes("/setup")) {
    await page.getByRole("button", { name: /Papelería \/ Retail/ }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: /Guardar y empezar/ }).click();
    await page.waitForURL(/\/cobro/);
  }
}

test.describe("POS — catálogo táctil (Fase 1)", () => {
  test("el grid de productos se renderiza con tarjetas interactivas", async ({ page }) => {
    await login(page);
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
    await page.goto("/cobro");

    const tarjetas = page.locator('[data-testid="product-card"]:not([disabled])');
    await expect(tarjetas.first()).toBeVisible();
    await tarjetas.first().click();

    // El cart panel refleja la línea agregada (1 artículo).
    await expect(page.getByText(/1 artículo/)).toBeVisible();
  });

  test("el grid coexiste con el escaneo por código", async ({ page }) => {
    await login(page);
    await page.goto("/cobro");

    await expect(page.getByRole("button", { name: /Enfoca tu lector/ })).toBeVisible();
    const grid = page.locator('[data-testid="product-grid"]');
    await expect(grid).toBeVisible();
    await expect(grid.locator('[data-testid="product-card"]').first()).toBeVisible();
  });
});