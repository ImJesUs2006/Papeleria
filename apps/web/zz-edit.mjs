import { chromium } from "@playwright/test";
const base = "http://localhost:3111";
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
await p.request.post(`${base}/api/auth/login`, { data: { username: "admin", password: "admin123" } });
await p.request.post(`${base}/api/setup`, { data: { nombreNegocio: "Papelería QA", tipoNegocio: "PAPELERIA_RETAIL", ivaRate: 16, preciosIncluyenIva: true,
  featureFlags: { inventario: true, facturacion: true, dashboard: true, proveedores: true, bitacora: true, recargas: true, imagenesCloudinary: false, lotesSeries: true, apartados: true },
  metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA"], politicaStockOffline: "PERMITIR_NEGATIVO", usarCaducidad: true, usarUbicaciones: true, requerirFondoInicial: true } });
const prods = (await (await p.request.get(`${base}/api/productos?limit=100`)).json()).data;
const fallos = [];
p.on("response", async (r) => { if (r.url().includes("/api/productos/") && r.request().method() === "PATCH" && r.status() >= 400) fallos.push(`${r.url().split("/").pop()} ${r.status()} ${await r.text()}`); });
await p.goto(`${base}/inventario`); await p.waitForLoadState("networkidle");
for (const prod of prods) {
  await p.getByPlaceholder(/Buscar por código/).fill(prod.codigoItem);
  await p.waitForTimeout(700);
  const btn = p.locator("tr", { hasText: prod.descripcion }).getByTitle("Editar producto").first();
  if (!(await btn.count())) { fallos.push(`${prod.codigoItem} sin botón`); continue; }
  await btn.click();
  await p.getByRole("button", { name: "Guardar cambios" }).waitFor();
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Guardar cambios" }).click();
  await p.waitForTimeout(900);
  const abierto = await p.getByRole("button", { name: "Guardar cambios" }).isVisible().catch(() => false);
  if (abierto) {
    const errores = await p.locator("form .text-neon-red, form [class*='neon-red']").allInnerTexts();
    fallos.push(`${prod.codigoItem} ${prod.descripcion}: NO GUARDA → ${errores.join(" | ")}`);
    await p.screenshot({ path: `zz-${prod.codigoItem}.png` });
    await p.keyboard.press("Escape");
    await p.waitForTimeout(300);
  }
}
console.log(prods.length, "productos;", fallos.length, "fallos"); for (const f of fallos) console.log(" -", f);
await b.close();
