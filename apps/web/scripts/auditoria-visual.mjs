// ============================================================
// npm run auditoria:visual -w @papeleria/web
//
// Recorre las pantallas en los 4 temas y 2 anchos y reporta:
//   - textos con contraste menor a 3:1 contra su fondo;
//   - textos que se salen de su contenedor.
// Requiere la app corriendo (BASE, por defecto http://localhost:3000) con
// la base de pruebas (usuario admin del seed). Sale con código 1 si hay
// hallazgos, para usarla en CI.
//
// Variables: BASE, NEGOCIO (código), PAGINAS (coma), TEMAS (coma), ANCHOS (coma),
//            USUARIO, CLAVE, PLAYWRIGHT_CHANNEL (msedge en Windows).
// ============================================================
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:3000";
const paginas = (
  process.env.PAGINAS ??
  "/cobro,/dashboard,/caja,/apartados,/devoluciones,/inventario,/lotes,/traspasos,/promociones,/clientes,/reportes,/bitacora,/configuracion,/pedidos,/proveedores"
).split(",");
const temas = (process.env.TEMAS ?? "neon,minimalista,corporativo,brutalista").split(",");
const anchos = (process.env.ANCHOS ?? "1280,1024").split(",").map(Number);
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined);

const auditar = () => {
  const lum = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return null;
    const [r, g, b, a] = m.map(Number);
    if (a === 0) return null;
    return [r, g, b]
      .map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const fondo = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      const m = c.match(/[\d.]+/g);
      if (m && (m[3] === undefined || Number(m[3]) > 0.5)) return c;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
  const contraste = [];
  const desborde = [];
  for (const el of document.querySelectorAll("main *, aside *")) {
    if (!(el instanceof HTMLElement) || !el.offsetParent) continue;
    const texto = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (texto.length < 2) continue;
    // Texto solo para lectores de pantalla: va recortado a propósito.
    if (el.closest(".sr-only")) continue;
    const cs = getComputedStyle(el);
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    if (op < 0.6 || el.closest("[disabled]")) continue;
    const l1 = lum(cs.color);
    const l2 = lum(fondo(el));
    if (l1 != null && l2 != null) {
      const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (r < 3) {
        const clases = el.className.toString().split(" ").filter((c) => /^(text-|hover:text)/.test(c)).join(" ");
        contraste.push(`${clases || el.tagName} · "${texto.slice(0, 28)}" (${r.toFixed(1)})`);
      }
    }
    const recorta = cs.textOverflow === "ellipsis" && cs.whiteSpace === "nowrap";
    if (!recorta && el.scrollWidth > el.clientWidth + 2 && !["auto", "scroll"].includes(cs.overflowX)) {
      desborde.push(`${el.className.toString().split(" ").slice(0, 3).join(".")} · "${texto.slice(0, 28)}"`);
    }
  }
  return { contraste: [...new Set(contraste)], desborde: [...new Set(desborde)] };
};

const browser = await chromium.launch(channel ? { channel } : {});
const page = await (await browser.newContext()).newPage();
await page.goto(`${base}/login`);
const login = await page.request.post(`${base}/api/auth/login`, {
  data: { negocio: process.env.NEGOCIO, username: process.env.USUARIO ?? "admin", password: process.env.CLAVE ?? "admin123" },
});
if (!login.ok()) {
  console.error(`No se pudo iniciar sesión (${login.status()})`);
  process.exit(2);
}

const resultado = {};
for (const ancho of anchos) {
  await page.setViewportSize({ width: ancho, height: 800 });
  for (const p of paginas) {
    await page.goto(`${base}${p}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(700);
    for (const tema of temas) {
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
        document.querySelectorAll("*").forEach((e) => (e.style.transition = "none"));
      }, tema);
      await page.waitForTimeout(150);
      const r = await page.evaluate(auditar);
      for (const c of r.contraste) (resultado[`contraste ${tema}`] ??= new Set()).add(`${p} ${c}`);
      for (const d of r.desborde) (resultado[`desborde ${ancho}px`] ??= new Set()).add(`${p} ${d}`);
    }
  }
}
await browser.close();

const hallazgos = Object.values(resultado).reduce((s, v) => s + v.size, 0);
for (const [k, v] of Object.entries(resultado)) {
  console.log(`\n### ${k} (${v.size})`);
  for (const x of [...v].slice(0, 60)) console.log("  " + x);
}
console.log(
  hallazgos === 0
    ? `\nSin hallazgos: ${paginas.length} pantallas × ${temas.length} temas × ${anchos.length} anchos.`
    : `\n${hallazgos} hallazgo(s).`
);
process.exitCode = hallazgos === 0 ? 0 : 1;
