# Informe Técnico del Sistema de Gestión para Papelería — v4

**Versión evaluada:** Iteración 4 (Seguridad de dependencias · Configuración y Error Boundaries · CRUD manual de productos · Abonos a proveedores y devoluciones/notas de crédito · E2E Playwright · Scaffold Tauri · CI)
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5 + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Tailwind · Recharts · ExcelJS · idb (IndexedDB) · WebCrypto · TanStack Table · React Hook Form + Zod · Playwright · Vitest · Turbo

> Complementa y actualiza `INFORME_SISTEMAv3.md`. La iteración 3 consolidó el producto multi‑negocio y offline; la 4 **cierra los riesgos de seguridad**, **repara bugs de robustez**, aporta **operaciones financieras** (abonos y devoluciones) y dota al proyecto de **pruebas E2E, empaquetado de escritorio y CI**.

---

## 1. Resumen ejecutivo

La iteración 4 abordó cuatro frentes con prioridad descendente:

- **M1 — Seguridad de dependencias:** salto a **Next 15.5.25**, eliminación total de **`xlsx`** (sustituido por **ExcelJS**) y adaptación de *route handlers* a la API asíncrona de Next 15 (`params`, `cookies`). El vector **crítico pasó de 1 a 0**.
- **M2 — Robustez de UI y datos:** corrección del **crash de Configuración** (normalización de la configuración), incorporación de **Error Boundaries** y **alta/edición manual de productos** con `react-hook-form` + `zod` (incl. generación de **EAN‑13** con dígito verificador y compresión de imagen en cliente).
- **M3 — Operaciones financieras:** **abonos a proveedores** (con bloqueo de sobrepago) y **devoluciones / notas de crédito transaccionales**, con **reingreso de stock**, **egreso de efectivo** reflejado en el arqueo (`SesionCaja.totalEgresos`) y trazabilidad en bitácora.
- **M4 — Calidad y distribución:** **E2E con Playwright** (login, cobro, corte ciego y venta offline), **scaffold de Tauri** para escritorio y **CI** en GitHub Actions (`lint` · `typecheck` · `test` · `build` · `e2e`), habilitando **ESLint**.

**Estado de verificación:** `lint` ✅ (2 warnings) · `typecheck` ✅ · `npm test` ✅ **41/41** · `npm run build` ✅ **44 rutas** · `e2e` ✅ **4/4** · `npm audit` **critical: 0**.

---

## 2. M1 — Seguridad de dependencias ✅

### 2.1 Actualización de Next y React
- `next` `^14.2.35 → ^15.5.25`, manteniendo **React 18.3.1** (sin salto a React 19).
- Adaptación a la API asíncrona de Next 15:
  - `lib/auth.ts` → `const cookieStore = await cookies();`.
  - *Route handlers* con `params` como `Promise` + `await params`: `productos/[codigo]`, `usuarios/[id]`, `usuarios/[id]/password`, `proveedores/[id]`, `pedidos/[id]`, `ventas/[folio]`, `proveedores/[id]/pagos`.

### 2.2 Eliminación de `xlsx` → ExcelJS
- `lib/excel.ts` reescrito íntegramente con **ExcelJS** (`parseExcelBuffer` / `buildExcelBuffer`, ambas **async**, soportan `.xlsx` y `.csv`).
- `app/api/inventario/carga-masiva/route.ts` (límite 10 MB, extensiones `.xlsx,.csv`) y `app/api/bitacora/route.ts` actualizados; la UI de inventario acepta `accept=".xlsx,.csv"`.
- `xlsx` eliminado de dependencias. La vulnerabilidad alta de SheetJS queda **fuera del inventario**.

> **Deuda remanente (build‑time, no explotable en runtime):** `postcss@8.4.31` viene **embebido dentro de Next**; el bloque `overrides` de npm no logró reemplazarlo (se probó y se revirtió para no dejar configuración engañosa). Se resuelve al saltar a Next 16 cuando el ecosistema lo permita (ver §6).

---

## 3. M2 — Robustez de UI y datos ✅

### 3.1 Bug crítico de Configuración
- `app/(dashboard)/configuracion/page.tsx` accedía a `config.featureFlags` sin defensa y reventaba cuando la BD devolvía un blob incompleto.
- Se añadió **`normalizeConfig(raw)`**: rellena `featureFlags` con `DEFAULT_FEATURE_FLAGS`/`VALID_FLAG_KEYS`, filtra `metodosPago` válidos y valida `tipoNegocio` / `ivaRate` / `politicaStockOffline`.

### 3.2 Error Boundaries
- `app/global-error.tsx`, `app/error.tsx`, `app/(dashboard)/error.tsx` y `components/error-boundary.tsx` (componente de clase reutilizable con botón *Reintentar*). Usuarios y Negocio (en Configuración) quedan envueltos.

### 3.3 CRUD manual de productos
- `lib/validate-product.ts` — `PRODUCTO_INPUT_SCHEMA` / `PRODUCTO_PATCH_SCHEMA`, `sanitizeText()` (anti‑XSS), `TIPO_IMPRESION_OPCIONES`, `IMAGEN_MIMES_PERMITIDOS`, `IMAGEN_BASE64_MAX` y regla **precio de venta ≥ precio de compra**.
- `Producto.precioCompra` (`Decimal?`).
- `POST /api/productos` (solo ADMINISTRADORA; detecta duplicados de código/barras → 409; imagen; bitácora) y `PATCH/GET /api/productos/[codigo]` extendidos.
- `components/inventario/product-form.tsx` — modal **RHF + Zod** para alta/edición, **generador de código** y **EAN‑13 con dígito verificador**, foco de escáner, **margen en vivo** y compresión de imagen (≤ 2 MB → 800 px JPEG 0.82).
- Integrado en `app/(dashboard)/inventario/page.tsx` (botón *Nuevo producto* + lápiz por fila).

> **Nota de implementación:** con Zod v3.25, `.refine()` **antes** de `.min()/.max()` rompe los tipos (`ZodEffects` no expone esos métodos) y `.transform().pipe()` produce tipos `unknown`. El orden correcto es `z.number().min().max().refine()` y sanitizar por separado.

---

## 4. M3 — Operaciones financieras ✅

### 4.1 Abonos a proveedores
- `app/api/proveedores/[id]/pagos/route.ts` (`GET` historial + `POST` abono, solo **ADMINISTRADORA**):
  - Valida `monto > 0` y **rechaza sobregiro** (`monto > saldoCredito`, con tolerancia de $0.005).
  - En transacción: crea `PagoProveedor`, **decrementa `Proveedor.saldoCredito`** y audita en bitácora con saldo anterior/nuevo.
  - UI: botón **Abonar** (habilitado solo con saldo) + modal con **liquidar saldo completo** e historial en `app/(dashboard)/proveedores/page.tsx`.
- **Decisión de diseño:** los abonos son **pagos administrativos y no afectan la caja del POS** — documentado como limitación.

### 4.2 Devoluciones y notas de crédito
- Nuevos modelos `Devolucion`, `DevolucionLinea`, enum `TipoDevolucion { DEVOLUCION, NOTA_CREDITO }` y `SesionCaja.totalEgresos`.
- `lib/returns.ts` — **`executeReturn(tx, input, ctx)`** (núcleo transaccional):
  - Valida que lo devuelto **no exceda lo vendido**, descontando devoluciones previas (`calcularDevuelto`).
  - Usa el **precio congelado** de la venta (`precioMomento`), **reingresa stock** y calcula `subtotal`/`iva`/`totalNeto`.
  - Reembolso **en EFECTIVO** incrementa `SesionCaja.totalEgresos` y **exige caja ABIERTA**; `NOTA_CREDITO` fuerza `metodoReembolso = NOTA_CREDITO` y no toca caja.
  - Marca la venta como **`REEMBOLSADA`** si la devolución es total y deja log en bitácora. Folio `D-YYYYMMDD-XXXX`.
- `app/api/ventas/[folio]/route.ts` — devuelve la venta con `devuelto`/`disponible` por línea y el historial de devoluciones.
- `app/api/devoluciones/route.ts` — `GET` (historial, opcional `?folioVenta=`) y `POST` (valida el método de reembolso contra `metodosPago` del negocio).
- `app/(dashboard)/devoluciones/page.tsx` — flujo completo: buscar folio, seleccionar cantidades (con tope `disponible`), tipo (devolución/nota), método, motivo, resumen con IVA e historial.
- **Caja:** `lib/cash.ts` y `lib/reports.ts` descuentan `totalEgresos` del efectivo/total esperado y muestran la fila *"Egresos (reembolsos/abonos)"*.

---

## 5. M4 — Calidad y distribución ✅

### 5.1 E2E con Playwright
- `apps/web/playwright.config.ts` + `apps/web/e2e/pos.spec.ts` con 4 pruebas seriales: **login**, **cobro en efectivo**, **corte ciego** (verifica que los montos esperados **no** se filtren) y **venta offline** (`setOffline`).
- El CDN de Playwright estaba bloqueado en el entorno, por lo que en Windows se usa el **Microsoft Edge del sistema** (`channel: "msedge"`, sin descarga) y se desactivó `video` (requería `ffmpeg`, también bloqueado). En CI/Linux se instala **Chromium**.
- El helper de login **completa el Setup Wizard** si el negocio aún no está configurado (idempotente).
- Scripts: `npm run e2e`, `npm run e2e:install`.

### 5.2 Scaffold de Tauri
- `src-tauri/` con `Cargo.toml`, `build.rs`, `src/main.rs`, `src/lib.rs`, `tauri.conf.json`, `capabilities/default.json` e **iconos** generados (`icon.png`, `icon.ico`, `32/128/@2x`).
- Scripts raíz `tauri`, `tauri:dev`, `tauri:build` (CLI `@tauri-apps/cli`).
- ⚠️ **Alcance:** es solo andamiaje. El frontend es **SSR con API routes y Prisma**, así que un `frontendDist` estático no basta: producción requerirá un **sidecar Node** o apuntar la ventana a un servidor. Además **Rust no está instalado** en el entorno, por lo que no se pudo compilar.

### 5.3 CI y linting
- `.github/workflows/ci.yml`:
  - Job **`quality`**: `npm ci` → `prisma generate` → `lint` → `typecheck` → `test` → `build`.
  - Job **`e2e`**: servicio **PostgreSQL 16** → `db push` + seed → `playwright install --with-deps chromium` → `npm run e2e`, publicando el reporte como artefacto.
- **ESLint habilitado** (`apps/web/.eslintrc.json` = `next/core-web-vitals`, deps `eslint` + `eslint-config-next`). Se corrigieron **4 errores reales** de comillas sin escapar; quedan **2 warnings** de `react-hooks/exhaustive-deps` en `inventario`.

---

## 6. Auditoría de dependencias (`npm audit`)

Estado: **4 vulnerabilidades** — **0 críticas**, 1 alta, 3 moderadas.

| Paquete | Sev. | Advisory | Impacto real aquí | Mitigación |
|---|---|---|---|---|
| `postcss` (embebido en `next`) | alta | `GHSA-qx2v-qp2m-jg93` (XSS al *stringify*), `GHSA-6g55-p6wh-862q` / `GHSA-fxqj-rqcc-2cmp` / `GHSA-r28c-9q8g-f849` (path traversal vía `sourceMappingURL`) | **Solo tiempo de build** | Se resuelve saltando a **Next 16** (rompe React 18); mientras, riesgo de build aceptado |
| `uuid` (transitiva de `exceljs`) | moderada | `GHSA-w5hq-g745-h8pq` (bounds check en v3/v5/v6 con `buf`) | Bajo: no se usan esas funciones | Actualizar `exceljs`/`uuid` cuando haya release compatible |

> **Evolución:** la vulnerabilidad **crítica de Next** (§3 de v3) y la **alta de `xlsx`** quedaron **resueltas** en M1. No queda ningún hallazgo crítico. Revisar periódicamente con `npm audit`.

---

## 7. Historial de correcciones (Iteración 4)

| # | Módulo | Problema | Corrección |
|---|---|---|---|
| 1 | M1 | `params`/`cookies` síncronos rompían en Next 15 | `await params` / `await cookies()` en handlers y `lib/auth`. |
| 2 | M1 | `xlsx` con vulnerabilidades altas sin fix en npm | Migración completa a **ExcelJS** (async, `.xlsx`/`.csv`). |
| 3 | M2 | Configuración reventaba con `featureFlags` incompleto | `normalizeConfig()` con defaults y filtrado de valores válidos. |
| 4 | M2 | Sin captura de errores de render | **Error Boundaries** globales y de segmento. |
| 5 | M2 | Sin alta manual de productos | `POST /api/productos` + form RHF/Zod + EAN‑13. |
| 6 | M2 | Orden `.refine()`/`.min()` rompía tipos de Zod | Esquemas reordenados (`min/max` antes de `refine`). |
| 7 | M3 | Notas de crédito siempre fallaban por validar su propio método forzado | La validación de método solo aplica a `DEVOLUCION`. |
| 8 | M3 | `Number(totalEgresos)` producía `NaN` en sesiones sin el campo | Default defensivo `\|\| 0` en caja, reportes y arqueo. |
| 9 | M3 | **Reembolso en EFECTIVO sin caja abierta** creaba la devolución sin registrar el egreso | `executeReturn` **rechaza (409)** el efectivo sin caja ABIERTA. |
| 10 | M4 | `npm run lint` no ejecutaba (sin configuración ESLint) | `.eslintrc.json` + deps; 4 errores de entidades corregidos. |

---

## 8. Estado actual — checklist v4

| Módulo | v3 | v4 |
|---|---|---|
| Login + JWT + RBAC + gestión de usuarios | ✅ | ✅ |
| POS: carrito → venta real (+ offline, atajos) | ✅ | ✅ |
| Caja: apertura + **Corte Ciego** + arqueo | ✅ | ✅ + **egresos por reembolsos** |
| Inventario: imágenes, térmica, edición rápida | ✅ | ✅ + **alta manual (RHF/Zod, EAN‑13)** |
| Proveedores / Pedidos | ✅ | ✅ + **abonos con control de saldo** |
| Devoluciones / notas de crédito | ❌ | ✅ **transaccionales con reingreso de stock** |
| Configuración (negocio + usuarios) | ✅ | ✅ + **robusta + Error Boundaries** |
| Reportes Excel + vista previa | ✅ | ✅ |
| Bitácora + export | ✅ | ✅ + eventos de devoluciones/abonos |
| Operación offline con sync | ✅ | ✅ + **E2E del caso offline** |
| Seguridad de dependencias | ⚠️ 1 crítica | ✅ **0 críticas** |
| Pruebas E2E | ❌ | ✅ **Playwright (4/4)** |
| CI | ❌ | ✅ **GitHub Actions** |
| Escritorio (Tauri) | ❌ | 🟡 **scaffold** (sin compilar) |

---

## 9. Cómo levantar y verificar

> Guía paso a paso: **[`docs/GUIA_INSTALACION.md`](GUIA_INSTALACION.md)**.

```powershell
docker compose up -d
cd packages/database; npx prisma db push; npx prisma db seed
cd apps/web; npm run dev        # http://localhost:3000

# Verificación de calidad
npm run lint                    # ESLint (next/core-web-vitals)
npm run typecheck               # tsc --noEmit (sin errores)
npm test                        # Vitest (41/41)
npm run build                   # Next build (44 rutas)
npm run e2e                     # Playwright (requiere DB arriba)
```

Credenciales: **admin / admin123** (ADMINISTRADORA) · **cajera1 / cajera123** (CAJERA).

---

## 10. Siguientes pasos priorizados

1. 🟠 **Empaquetado Tauri real**: definir el arranque del servidor Next (sidecar Node) y generar instaladores; requiere instalar el toolchain de **Rust**.
2. 🟡 **Next 16** (React 19) para eliminar la `postcss` embebida y cerrar la última alta.
3. 🟡 **Migrar de `next lint` a ESLint CLI** (deprecado) y resolver los 2 warnings de `exhaustive-deps`.
4. 🟡 **E2E de devoluciones/abonos** y de sincronización offline con servidor real.
5. 🟢 **Cobertura de contrato de APIs** (auth, ventas, reportes) con supertest/Vitest.

---

## 11. Conclusión

La iteración 4 transforma un producto ya operativo en uno **más seguro, robusto y verificable**. Se eliminó el riesgo crítico de dependencias, se repararon fallos de estabilidad, se sumaron las **operaciones financieras** que faltaban (abonos y devoluciones con impacto correcto en caja e inventario) y se blindó el proyecto con **pruebas E2E y CI**. Lo pendiente es de **distribución** (empaquetado de escritorio con Tauri) y **actualización mayor** (Next 16), no de funcionalidad de negocio.
