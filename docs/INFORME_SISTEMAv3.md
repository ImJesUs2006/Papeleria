# Informe Técnico del Sistema de Gestión para Papelería — v3

**Versión evaluada:** Iteración 3 (Setup Wizard + Feature Flags · operación offline · inventario con imágenes · Corte Ciego · reportes interactivos · RBAC completo · UX)
**Fecha:** Septiembre 2026
**Stack:** Next.js 14 (App Router) · Prisma + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Tailwind · Recharts · ExcelJS · idb (IndexedDB) · WebCrypto · TanStack Table · Vitest

> Complementa y actualiza `INFORME_SISTEMAv2.md`. La iteración 2 dejó el **núcleo transaccional**; la 3 convierte el sistema en un **producto multi-negocio (marca blanca)** capaz de operar **sin conexión**, con un **corte de caja a ciegas** anti-evasión y una administración de usuarios con salvaguardas.

---

## 1. Resumen ejecutivo

El sistema evolucionó de "POS de una sola papelería" a un **SaaS configurable y resiliente**. Se incorporó:

- **Setup Wizard** con *feature flags* por tipo de negocio (papelería, abarrotes, servicios, mixto) y **firma HMAC** para que el cliente offline no pueda habilitar módulos por su cuenta.
- **Operación offline real**: las ventas sin red se **encolan en IndexedDB** y se sincronizan con **idempotencia por `idLocal`**, transacción `Serializable` y **resolución de conflictos** configurable.
- **Inventario con imagen** comprimida en el navegador, **etiquetas térmicas 57/80 mm** y **CSS de impresión** dedicado.
- **Corte Ciego**: la cajera **nunca ve el esperado** antes de contar; el servidor bloquea la caja (`ABIERTA → EN_CIERRE → CERRADA`) y sobrevive a *reloads* y relanzamientos.
- **Reportes interactivos**: tabla con orden/filtro/paginación en pantalla + exportación **ExcelJS** con estilo ejecutivo.
- **RBAC completo**: CRUD de usuarios y contraseñas con **guardas anti-bloqueo del último administrador**.
- **UX de caja**: atajos de teclado, cola offline visible, skeletons y modales accesibles.

---

## 2. Nuevos módulos de esta iteración

### 2.1 Setup Wizard + Feature Flags — ✅ Funcional
- Modelo **`ConfiguracionNegocio`** (singleton `id=1`): `featureFlags`, `metodosPago`, `politicaStockOffline`, `ivaRate`, `configVersion`, `setupPendiente`.
- `lib/business-types.ts` — `PRESETS_POR_NEGOCIO` (marca blanca) y `DEFAULT_FEATURE_FLAGS`.
- **Integridad de la configuración offline:** el servidor firma el blob con **HMAC‑SHA256** (`lib/config-signing.ts`); el cliente **solo verifica** (`lib/config-signing-client.ts`) con una `sessionKey` que vive **en memoria** (nunca en `localStorage`/IndexedDB). Si no hay llave (arranque en frío offline) o la firma no cuadra → estado **`NO_VERIFICADA`**: se apagan los módulos no críticos y el servidor re-valida con **`requireFeature()`**.
- Rutas: `POST /api/setup` (solo ADMINISTRADORA, primer arranque), `GET/PUT /api/configuracion/negocio`, `GET /api/configuracion/negocio/cache`.
- UI: `components/setup/setup-wizard.tsx`, `app/setup/page.tsx` (guard admin, redirige a `/cobro` si ya no está pendiente), `app/(dashboard)/configuracion/page.tsx` (tabs **Usuarios** / **Negocio**).
- El **sidebar** oculta módulos según los flags verificados; durante `PENDIENTE` no oculta (evita parpadeo) y en `NO_VERIFICADA` aplica el criterio conservador.

### 2.2 Persistencia offline y resolución de conflictos — ✅ Funcional
- `lib/offline/idb.ts` — almacenes IndexedDB `ventas` (cola) y `config` (replica firmada).
- `lib/sales-client.ts` — **`registrarVentaClient()`**: intenta `POST /api/ventas`; ante fallo de red (no 4xx) genera `idLocal`, calcula IVA/total localmente, descuenta stock local y **encola** la venta.
- `lib/offline/conflict.ts` — **tolerancia de precio del 15%** contra catálogo; política de stock `PERMITIR_NEGATIVO` (default, con alerta + bitácora) o `RECHAZAR`.
- `lib/offline/sync.ts` — `flushSyncQueue()` + `sincronizarConReintentos()` con **backoff** `[0, 2s, 5s, 15s, 45s]` (máx. 5 intentos).
- `POST /api/ventas/sync` — **idempotencia por `idLocal`** (la primera aparición gana), transacción **`Serializable`**, `MAX_VENTAS_POR_BATCH=500`, bitácora `SYNC`.
- Indicador global de conexión/cola: `hooks/use-offline.ts` + `components/layout/offline-indicator.tsx` (reintenta al volver la red y cada 60 s).

### 2.3 Inventario: imágenes y etiquetas térmicas — ✅ Funcional
- `Producto` incorpora `imagenMime` / `imagenBase64`. `GET/PATCH /api/productos/[codigo]` soporta imagen (PNG/JPEG/WebP, límite ~1.5 MB, permite `null`) con bitácora.
- `components/inventario/product-image-upload.tsx` — **compresión en canvas** (máx. 800 px, JPEG 0.82) antes de subir.
- Preview **lazy** de imágenes en los sugeridos del POS (`app/(dashboard)/cobro/page.tsx`).
- `app/globals.css` — `@media print` para térmica **57/80 mm** (`.print-ticket-57/80`, `@page`, texto negro legible).

### 2.4 Corte Ciego (anti-evasión) — ✅ Funcional
- Máquina de estados **`ABIERTA → EN_CIERRE → CERRADA`** (`EstadoSesionCaja.EN_CIERRE`).
- `POST /api/caja/cerrar/iniciar` — bloqueo atómico de la caja con `cierreToken`; `GET` **reanuda** un corte en curso tras *reload*. Nunca se exponen totales esperados antes de contar.
- `POST /api/caja/cerrar` — exige `cierreToken`, registra efectivo/vouchers/recargas contados, calcula **descuadre**, persiste `cierreIniciadoPor`, `cierreInicioEn`, etc. y audita.
- `GET /api/caja/estado` — expone la sesión vigente (`ABIERTA`/`EN_CIERRE`).
- `lib/sales.ts` **rechaza ventas** si la caja no está `ABIERTA` (defensa en profundidad, validada también en el servidor).
- `components/caja/corte-ciego.tsx` + integración en `app/(dashboard)/caja/page.tsx` (barra de estado, oculta totales en corte, botón **Continuar corte**, skeleton, `window.print()` del comprobante).

### 2.5 Reportes interactivos + Excel ejecutivo — ✅ Funcional
- `lib/reports.ts` — `getReporteData()` para **7 reportes**: inventario, reabastecimiento, ventas, ventas‑por‑producto, top‑más‑vendidos, cierre‑de‑caja y bitácora.
- `lib/export-exceljs.ts` — `buildStyledWorkbook()`: encabezado con color, **fila congelada**, **auto‑filtro**, **auto‑ancho**, formato de moneda y **fila de totales**.
- `GET /api/reportes` (Excel `.xlsx`, bitácora `REPORTES`) y `GET /api/reportes/data` (JSON para vista previa, máx. 300 filas).
- `components/reports/preview-table.tsx` — **TanStack Table** con orden, filtro, paginación y totales; integrado en `app/(dashboard)/reportes/page.tsx` (**Vista previa** + **Excel**).

### 2.6 RBAC: gestión de usuarios con guardas — ✅ Funcional
- `GET/POST /api/usuarios` (validación de `username`, contraseña ≥ 8), `PATCH/DELETE /api/usuarios/[id]`, `POST /api/usuarios/[id]/password` (reset por admin o cambio propio con `currentPassword`).
- `lib/usuarios.ts` — **`tieneOtroAdminActivo()` / `contarAdminsActivos()`**: impiden desactivar, cambiar de rol o eliminar al **último administrador** (evita el auto‑bloqueo total).
- Borrado solo si el usuario **no tiene historial** (ventas/bitácora); si lo tiene, baja lógica (`activa=false`).
- `components/configuracion/user-management.tsx` + bitácora `SEGURIDAD` en cada operación sensible.

### 2.7 UX de caja y accesibilidad — ✅ Funcional
- `hooks/use-hotkeys.ts` (normaliza `ctrl/cmd/meta → mod`), `components/ui/modal.tsx` (cierre con `Esc`, bloqueo de scroll) y `components/ui/skeleton.tsx`.
- **Atajos globales:** `Ctrl+P` cobrar, `Ctrl+K` / `F2` abrir búsqueda manual, `Ctrl+B` enfocar el lector, `Esc` cerrar, `?` ayuda. `components/layout/shortcuts-help.tsx` documenta los atajos en un modal.
- `components/pos/cart-panel.tsx` ahora usa `registrarVentaClient` (offline), muestra **comprobante con aviso "guardada offline"** y conecta los atajos.
- `components/layout/page-header.tsx` — encabezados con *breadcrumbs* reutilizables.

---

## 3. Auditoría de dependencias (`npm audit`)

Estado: **5 vulnerabilidades** — 1 crítica, 2 altas, 2 moderadas (372 dependencias).

| Paquete | Sev. | Advisory | Impacto real aquí | Mitigación |
|---|---|---|---|---|
| `next` | **crítica** | `GHSA-p293-qw3h-jr36` (RCE en Windows), `GHSA-2xp9-vwfh-vxw4` (RCE Image Optimizer AVIF) + varias DoS | Alto **si se expone a Internet**; hoy corre en red local | **Actualizar a Next 15.5.24+ / 16.x**; evitar `next/image` remoto y desactivar optimizador si no se usa; no exponer el puerto a WAN |
| `xlsx` | alta | `GHSA-4r6h-8v6p-xvw6` (prototype pollution), `GHSA-5pgg-2g8v-p4x9` (ReDoS) | Solo en **carga masiva** de inventario | **Parseo exclusivamente server‑side**; validar extensión/tamaño; evaluar migrar a ExcelJS; no hay fix en npm (SheetJS se distribuye aparte) |
| `postcss` (transitiva de `next`) | alta | `GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849` (path traversal) | Solo tiempo de **build** | Se resuelve al actualizar Next |
| `exceljs` → `uuid` | moderada | `GHSA-w5hq-g745-h8pq` | Bajo uso (export) | Actualizar `uuid`/`exceljs` cuando haya release compatible |

> **Riesgo aceptado y documentado:** para una instalación **local/en Tauri** sin exposición pública, el vector crítico de Next (RCE Windows/Image Optimizer) queda **fuera de alcance**; aun así se recomienda actualizar Next antes de cualquier despliegue en Internet. Revisar periódicamente con `npm audit`.

---

## 4. Historial de correcciones (Iteración 3)

| # | Problema | Corrección |
|---|---|---|
| 1 | `store/cart.ts` usaba el tipo/valor `"PAPeleria"` (typo) | Normalizado a `"PAPELERIA"`. |
| 2 | `POST /api/caja/abrir` e `/api/caja/ingreso` no autenticaban | `requireAuth` + usuario real en bitácora. |
| 3 | Ventas podían ejecutarse con la caja en `EN_CIERRE` | `lib/sales.ts` valida estado `ABIERTA` en servidor. |
| 4 | `useHotkeys` no reconocía `cmd/meta` | Normalización `ctrl/cmd/meta → mod`. |
| 5 | Comparaciones de estado imposibles en `corte-ciego` (`conteo` vs `concluyendo`) | El bloque de conteo cubre también la fase `concluyendo`. |
| 6 | `TipoNegocio` (string) no asignable al enum Prisma | Esquema Zod tipado con `keyof typeof TIPO_NEGOCIO`. |
| 7 | `export { TITULOS }` inexistente en el route de reportes | Eliminado. |
| 8 | WebCrypto rechazaba `Uint8Array<ArrayBufferLike>` al verificar HMAC | Se pasa `sig.buffer as ArrayBuffer`. |
| 9 | IndexedDB `config` no declaraba la propiedad `key` | Tipado del store corregido. |

---

## 5. Estado actual — checklist v3

| Módulo | v2 | v3 |
|---|---|---|
| Login + JWT + RBAC + sidebar por rol | ✅ | ✅ + **gestión de usuarios** |
| POS: carrito → venta real | ✅ | ✅ + **offline** + atajos |
| Caja: apertura + cierre con arqueo | ✅ | ✅ + **Corte Ciego** |
| Inventario: etiquetas + edición rápida | ✅ | ✅ + **imágenes + térmica 57/80** |
| Proveedores / Pedidos | ✅ | ✅ |
| Dashboard con métricas | ✅ | ✅ |
| Reportes Excel | ✅ | ✅ + **vista previa interactiva** y Excel con estilo |
| Bitácora + export | ✅ | ✅ + eventos `SYNC/SETUP/SEGURIDAD` |
| Multi‑negocio (marca blanca) | ❌ | ✅ **Setup Wizard + Feature Flags firmados** |
| Operación offline con sync | ❌ | ✅ **IndexedDB + idempotencia + conflictos** |
| Auditoría de dependencias | ❌ | ✅ **documentada** |

---

## 6. Cómo levantar y verificar

> Guía paso a paso: **[`docs/GUIA_INSTALACION.md`](GUIA_INSTALACION.md)**.

```powershell
docker compose up -d
cd packages/database; npx prisma db push; npx prisma db seed
cd apps/web; npm run dev        # http://localhost:3000
npx tsc --noEmit                # typecheck (sin errores)
npm test                        # pruebas Vitest
```

Credenciales: **admin / admin123** (ADMINISTRADORA) · **cajera1 / cajera123** (CAJERA).

---

## 7. Siguientes pasos priorizados

1. 🔴 **Actualizar Next** a una versión parcheada (ver §3) antes de cualquier exposición pública.
2. 🟠 **Empaquetado Tauri** (no existe aún `src-tauri/`): persistencia nativa, arranque offline y auto‑update.
3. 🟠 **Abonos a proveedores** y **devoluciones/notas de crédito** (transaccionales).
4. 🟡 **E2E con Playwright** (cobro + corte ciego + sync) e integración en CI (`lint`/`typecheck`/`test`/`build`).
5. 🟡 Migrar la carga masiva de **`xlsx` → ExcelJS** para eliminar la vulnerabilidad de SheetJS.

---

## 8. Conclusión

La iteración 3 cierra la brecha entre un prototipo funcional y un **producto operable en condiciones reales**: multi‑negocio, tolerante a fallos de red, con controles antifraude en caja y administración segura. Los dos frentes que restan antes de producción son **seguridad de dependencias** (§3) y el **empaquetado de escritorio (Tauri)**, ya previstos en los siguientes pasos.
