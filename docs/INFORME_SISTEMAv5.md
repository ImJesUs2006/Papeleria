# Informe Técnico del Sistema de Gestión para Papelería — v5

**Versión evaluada:** Iteración 5 (Fase 1 de evolución SaaS: Resiliencia con Factory Reset y Snapshots · Personalización Marca Blanca · Grid táctil del punto de venta · Tests Vitest y E2E de la nueva UX)
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5 + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Tailwind · bcryptjs · Vitest · Playwright · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv4.md`. La iteración 4 cerró seguridad de dependencias y robustez; la 5 **convierte el ticket de Papelería en un producto SaaS de marca blanca**: la administradora puede reiniciar el sistema sin perder datos (snapshot de recuperación), pintar la identidad del negocio (logo + color) y cobrar tocando una tarjeta del catálogo visual, con garantías de tests unitarios y de extremo a extremo.

---

## 1. Resumen ejecutivo

La Fase 1 abordó cuatro frentes:

- **M1 — Resiliencia (Factory Reset con Snapshots):** en lugar de un *DELETE CASCADE* destructivo, el sistema guarda un **snapshot** con la configuración y totales operativos y lleva el SetupWizard a **PENDIENTE**. La administradora puede **restaurar** ese estado con un clic desde el asistente. Lay me pide confirmar la frase exacta `CONFIRMAR BORRADO` y contraseña.
- **M2 — Marca Blanca:** se reparó el renderizado por condición de Configuración (los módulos ahora muestran siempre sus toggles y quedan sincronizados con Zustand), y se añadieron **logo** (≤ 1 MB) y **temaColor** que re-pintan botones y acentos de toda la app en tiempo real.
- **M3 — UX del POS:** el centro del punto de venta ahora muestra un **grid táctil** con el *Top 20* de productos (favoritos → más vendidos → recientes con stock). La cajera agrega directamente tocando la tarjeta, sin lector USB.
- **M4 — Calidad:** cubrimiento **Vitest** de la lógica de snapshots (inyectando transacciones mock) y **E2E Playwright** que valida el render del grid y que un toque agrega al carrito.

**Estado de verificación:** `lint` ✅ (2 warnings preexistentes en inventario) · `typecheck` ✅ · `npm test` ✅ **50/50** · `npm run build` ✅ (40 páginas + 26 API routes, incluidas `seguridad/*` y `productos/top`).

---

## 2. M1 — Resiliencia: Factory Reset con Snapshots ✅

### 2.1 Esquema de datos
- `SnapshotSeguridad`: `id` (uuid), `fecha`, `datosJson` (`Json`), `motivo`, `idUsuario?` con relación a `Usuario` (`"SnapshotCreadoPor"`) e índices por `fecha` e `idUsuario` → `@map("snapshots_seguridad")`. **No tiene relación con `ConfiguracionNegocio`** de propósito: el snapshot es un blob autónomo.
- `ConfiguracionNegocio` gana `logo String? @db.Text` y `temaColor String @default("#10b981")`.
- `Producto` gana `favorito Boolean @default(false)`.
- **Constraint de ejecución respetado:** primero se modificó solo `schema.prisma`, se validó (`prisma validate`), y se pidió al usuario ejecutar `npx prisma db push` (se ejecutó correctamente; el `favorito` fue un segundo push aditivo). La BD local quedó en sync y el cliente Prisma regenerado.

### 2.2 Núcleo transaccional (`lib/snapshots.ts`)
Todas las funciones reciben el cliente Prisma (o un mock) como parámetro para probarse en aislamiento:
- `buildResetJson(configRow, sesiones, ventasAgg)` — normaliza `Decimal`→`number` y aplica defaults; arma `{ fecha, configuracion, totales: { ventas, sesionCaja } }`.
- `captureSnapshotState(db)` — lee la config, las últimas 50 sesiones de caja y el agregado de ventas en paralelo.
- `resetNegocio(tx, { motivo, idUsuario })` — **NO borra nada**: persiste el snapshot, marca `setupPendiente: true`, sube `configVersion + 1` y audita en bitácora (`moduloSistema: "SETUP"`).
- `restoreFromSnapshot(tx, { id, idUsuario })` — reescribe **solo la fila de configuración** (nunca facturas/sesiones), baja `setupPendiente`, sube versión y audita (`moduloSistema: "CONFIGURACION"`). Lanza `SnapshotError` con `status` (404, 400).
- `CONFIG_ID = 1` y `MOTIVO_REINICIO`.

### 2.3 API
- `POST /api/seguridad/reset` — solo **ADMINISTRADORA**; verifica contraseña con **bcrypt** (buscando el usuario por `idPersona`, pues el JWT no trae `username`) y exige `confirmacion === "CONFIRMAR BORRADO"`. Devuelve `{ snapshotId }`.
- `GET /api/seguridad/snapshot` — historial (id, fecha, motivo, totales, versión).
- `GET /api/seguridad/snapshot/[id]` — detalle (con blob para inspección).
- `POST /api/seguridad/snapshot/[id]/restore` — verifica contraseña y llama a `restoreFromSnapshot`.

### 2.4 UI
- `components/configuracion/factory-reset.tsx` — modal de zona de riesgo en Configuración: campo contraseña + frase exacta + motivo opcional; éxito muestra el id del snapshot y un botón *Ir al asistente*.
- `components/setup/recovery-history.tsx` — listado discreto de snapshots con *Restaurar* (pide contraseña de la administradora). Accesible desde el SetupWizard con un enlace sutil *«Ver historial de recuperación»*.
- `components/setup/setup-wizard.tsx` — rediseño **minimalista** (encabezado compacto, tarjetas ligeras, barra de progreso fina) conservando los 4 pasos y la esencia de presets por tipo de negocio.

---

## 3. M2 — Marca Blanca y reparación de Configuración ✅

### 3.1 Bug de renderizado por condición (causa raíz)
La configuración incompleta no rompía el arranque, pero **los toggles de módulos no se mostraban** al renderizarse por condición. Corrección de doble vía:
- `normalizeConfig(raw)` rellena `featureFlags` con `DEFAULT_FEATURE_FLAGS`/`VALID_FLAG_KEYS`, filtra `metodosPago` y valida `tipoNegocio`/`ivaRate`/`politicaStockOffline` (+ `logo`/`temaColor`).
- Fuerza local: `toggleFlag` ahora llama a la nueva acción **`setFlag(flag, value)`** del store de Zustand, para que los módulos activados/desactivados se reflejen de inmediato antes de que el servidor revalide.
- Al guardar, la página consume la respuesta firmada y llama a `refreshConfig(config, firma, sessionKey)` para no dejar el UI desincronizado con el servidor.

### 3.2 Persistencia y validación de identidad
- `lib/business-types.ts`: `BusinessConfig` ahora exige `logo: string | null` y `temaColor: string`; `DEFAULT_TEMA_COLOR = "#10b981"`.
- `lib/validate-config.ts` reescrito: `LOGO_MAX_CHARS = 1_000_000` y `LOGO_SCHEMA` con `.max()` **antes** de `.refine()` (evita el bug de orden de Zod v3.25); acepta `data:image/…` o `http(s)://`; `temaColor` con regex `^#[0-9a-fA-F]{6}$`.
- `PUT /api/configuracion/negocio` y `POST /api/setup` persisten `logo` y `temaColor`.

### 3.3 Tema global reactivo
- `tailwind.config.ts`: `neon.green/cyan/magenta` pasan a ser **CSS vars** (`var(--neon-green, #00ff88)`) y las sombras usan `color-mix(in srgb, var(...), transparent)`. Así, `bg-neon-green`, `text-neon-green`, `.btn-primary`, `shadow-neon` y `text-glow-green` se re-pintan con un solo cambio de variable.
- `components/brand-theme.tsx` (montado en `app/layout.tsx`): lee `config.temaColor` del store y aplica `--neon-green` y `--marca-color` en `:root`.
- Sidebar: muestra el **logo** (o el texto de marca) y el nombre del negocio real desde el store.

---

## 4. M3 — UX del POS: catálogo táctil ✅

- `GET /api/productos/top?limit=20` — prioriza los marcados como **favoritos** con stock, completa con los **más vendidos** (agregado `_sum.cantidad` sobre `LineaDetalleVenta` de ventas `ACTIVA`/`COMPLETADA`) y rellena con los **más recientes**. Disponible para cualquier rol con sesión.
- `components/pos/product-grid.tsx` — `data-testid="product-grid"` con tarjetas `data-testid="product-card"`; click → `addItem` (1 unidad). Muestra precio, stock, insignia *Fav*, contador de vendidos e imagen del producto si existe; skeleton de carga y estado vacío.
- `app/(dashboard)/cobro/page.tsx` — el centro ahora es el grid por defecto; el flujo de **escaneo USB y búsqueda manual** (modal "Enfoca tu lector") se conserva intacto.
- `Producto.favorito` en `PATCH/GET /api/productos/[codigo]` y en el listado `GET /api/productos`; toggle **estrella** en las filas de Inventario (`toggleFavorito` en `app/(dashboard)/inventario/page.tsx`).

---

## 5. M4 — Calidad ✅

### 5.1 Vitest (`tests/snapshots.test.ts`)
9 pruebas con transacciones mock (patrón de `tests/returns.test.ts`):
- `buildResetJson`: normalización y defaults con filas vacías.
- `captureSnapshotState`: consultas paralelas de config/sesiones/agregado.
- `resetNegocio`: invariante clave — **guarda el snapshot antes** de marcar PENDIENTE, sube versión y **no borra datos** (los mocks ni siquiera exponen `delete`); bitácora con id del snapshot; versión siguiente correcta incluso desde 0.
- `restoreFromSnapshot`: restaura todos los campos, baja `setupPendiente`, sube versión y audita; 404 si no existe; `SnapshotError` ante JSON inválido.

### 5.2 E2E Playwright (`e2e/pos-grid.spec.ts`)
3 pruebas: el grid se renderiza con al menos **una tarjeta interactiva** con precio; tocar la tarjeta agrega al carrito (`1 artículo`); el grid **coexiste** con el escáner ("Enfoca tu lector"). Usa los mismos helpers idempotentes de login/setup que `pos.spec.ts`.

### 5.3 Integración continua
`.github/workflows/ci.yml` ya cubría `lint · typecheck · test · build` y `e2e` (Postgres 16 + `db push` + `db:seed` + Chromium). Con el seed actualizado (22 productos, favoritos en `001/002/004`), el nuevo spec corre automáticamente y el grid tendrá favoritos en CI.

---

## 6. Cómo probarlo manualmente

1. **Reset:** Configuración → *Reiniciar Sistema* → contraseña + escribir `CONFIRMAR BORRADO` → al ingresar de nuevo aparece el SetupWizard; en su pie, *Ver historial de recuperación* permite restaurar.
2. **Marca Blanca:** Configuración → subir logo + elegir color → *Guardar cambios*; ver botones/accentos del sidebar y del POS re-pintados y el logo en la esquina.
3. **POS táctil:** `/cobro` muestra el grid; tocar una tarjeta agrega al carrito; marcar productos como favorito en Inventario los ordena primero en el grid.
4. **Tests:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`; E2E con `npm run e2e`.

---

## 7. Notas, decisiones y deuda

- **Decisiones de seguridad:** ningún endpoint de seguridad acepta un DELETE; el reset es reversible vía snapshot. La frase exacta + bcrypt + rol `ADMINISTRADORA` son la triple barrera para una acción administrativa crítica.
- **Marca Blanca táctil:** se re-pinta el acento *verde* (el de marca) manteniendo cyan/magenta como acentos secundarios; el *temaColor* del negocio se aplica en runtime vía `setProperty` en `BrandTheme`, usando `refresh(config, firma, sessionKey)` del store al guardar (que valida la firma antes de aplicar).
- **Deuda local:** el seed con favoritos se replicó a la BD solo en CI; localmente conviene `npm run db:seed` para ver las estrellas ya marcadas. El grid funciona igual sin ellos (llena con más vendidos/recientes).
- **Deuda de refactor:** los helpers de login/setup duplicados entre `pos.spec.ts` y `pos-grid.spec.ts` deberían extraerse a `e2e/helpers.ts` cuando crezcan más specs.
- **Adapter de escritorio (Tauri):** sigue siendo scaffolding (ver v4, §5.2); sin cambios en esta iteración.