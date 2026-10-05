# Informe Técnico del Sistema de Gestión para Papelería — v11

**Versión evaluada:** Iteración 11 — **Optimización Crítica y Cumplimiento Normativo (SAT) — Primera mitad**
**Fecha:** Octubre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5.22 + PostgreSQL (Docker :5433) · Zustand · Zod · Vitest · ExcelJS · Playwright · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv10.md`. La iteración 11 ataca el rendimiento y la normatividad en dos planos:
>
> **(Primera mitad — este informe)** ① **Paginación server-side estricta** en los endpoints de datos históricos y tablas frontend que antes arrastraban miles de filas (bitácora: la vista completa cargaba el log entero y el modal de Reportes descargaba hasta 5000 registros); ② **Validaciones SAT en el modelo de datos fiscales** — RFC (física/moral) y CURP con expresión regular estricta, **catálogos oficiales** de Régimen Fiscal (601, 612, 626, …) y Uso de CFDI (G03, P01, …) y **domicilio fiscal fragmentado** (calle, numExt, numInt, colonia, municipio, estado, cp) que reemplaza el campo libre de código postal; ③ **Impresión térmica estricta** — el navegador ignora `@page ticket57/ticket80` y siempre imprime en carta, así que los tickets se imprimen mediante un **`<iframe>` oculto** cuyo documento declara `@page { size: 58mm|80mm auto }` y se dispara con `iframe.contentWindow.print()`; ④ **Filtros de Bitácora** — rango de fechas, módulo y **búsqueda por usuario**, conectados a los parámetros de URL del endpoint paginado.
>
> Se respeta el flujo exigido: **FASE A (paginación)** → **FASE B (SAT)** → **FASE C (impresión térmica)** → **FASE D (filtros de bitácora)**, con **14 tests Vitest** nuevos (SAT) y el cierre con **typecheck / lint / vitest / build** limpios y humo en localhost (login admin/admin123). La segunda mitad de la iteración (si procede) parte de este informe.

---

## 1. Resumen ejecutivo

La Fase 11 (mitad 1) cierra tres frentes de calidad que el pase de auditoría anterior dejó pendientes:

- **FASE A — Paginación (rendimiento crítico):** ningún endpoint que liste datos históricos descarga la colección completa. `/api/productos` ya era remoto (`page/limit/skip/take` + `totalPages`, frontend de Inventario con `?page=1&limit=25`). El trabajo real estaba en la **bitácora**: el endpoint ahora acepta **`?page=1&limit=50`** (además del `offset` retrocompatible), la página `/bitacora` dejó el "cargar más" incremental por **paginación por páginas** con "Página X de Y", y la vista previa de Reportes pasó de traer **5000 filas** (`take: 5000` en `lib/reports.ts`) a un **componente propio paginado** (`components/reports/bitacora-preview.tsx`) que consulta 50 registros por página.
- **FASE B — Cumplimiento SAT (validaciones Zod):** `lib/validate-config.ts` valida `RFC` (13/12 caracteres con expresión regular), `CURP` (18 caracteres con el patrón oficial), **`regimenFiscal` y `usoCFDI` contra catálogos de claves** (acepta también "601 - descripción" para retrocompatibilidad) y **domicilio fiscal fragmentado** (C.P. de 5 dígitos estrictos, número exterior alfanumérico). El editor `datos-fiscales.tsx` se reescribió con **selectores SAT** y campos separados; `DatosFiscales` (tipo), `feature-flags`, Configuración y Facturación propagan los nuevos campos.
- **FASE C — Impresión térmica (iframe oculto):** nuevo `lib/print-ticket.ts` con `imprimirTicket(elemento, "58mm"|"80mm")` que crea un iframe oculto, escribe un documento con `@page { size: Xmm auto; margin: 0 }`, copia los estilos del padre, inyecta el `outerHTML` del área `.print-label-area` y llama `iframe.contentWindow.print()`, eliminando el iframe al terminar. Migrados **venta (reimpresión), corte de caja (historial), tique de corte (corte ciego)** y etiqueta de producto.
- **FASE D — Filtros de Bitácora:** rango `desde/hasta`, `modulo` y **búsqueda por usuario** (nombre o username, `mode: insensitive`) como parámetros del endpoint paginado; la página `/bitacora` y la vista de Reportes comparten el mismo contrato.

**Estado de verificación:** `typecheck` ✅ 0 errores · `vitest` ✅ **91/91** (9 archivos, +14 tests nuevos de SAT) · `lint` ✅ (solo los 2 warnings preexistentes) · `build` ✅ 47 páginas · humo en localhost ✅ (bitácora paginada, filtros de usuario, productos `pagination` y rechazo 400 del editor SAT).

---

## 2. FASE A — Paginación server-side y tablas remotas ✅

### A1 `/api/productos` (ya paginado, verificado)
- `page` (mín 1), `limit` clamp `1..100` (default 50), `skip = (page-1)*limit`, respuesta `{ data, total, page, limit, totalPages }`, columnas ordenables en `ALLOWED_SORT`.
- Frontend Inventario: consulta remota `?page=<n>&limit=25` con paginador "Página X de Y" (sin cambios requeridos en esta iteración).

### A2 `/api/bitacora` → acepta `?page=1&limit=50` (+ filtros de FASE D)
- El endpoint ya paginaba con `limit/offset` y filtros `desde/hasta/modulo`. Se añade:
  - **Estilo por páginas:** `page` (mín 1) que se traduce a `offset = (page-1)*limit` cuando no se envía `offset` (retrocompatible con la carga incremental).
  - Respuesta enriquecida: `{ page, limit, offset, total, totalPaginas, tieneMas }`.
  - **`usuario`** como filtro opcional (OR sobre `usuario.nombre` y `usuario.username`).

### A3 Página `/bitacora` → paginación por páginas
- Sustituida la estrategia "Cargar más" (que acumulaba N páginas en memoria) por **controles Anterior / Siguiente** + "Página X de Y" y total de registros, usando `?page=N&limit=50`. Al cambiar filtros se resetea a página 1 (`cargar(1)`).

### A4 Reportes · Bitácora → vista previa con paginación remota
- Antes: `tipo=bitacora` en `lib/reports.ts` hacía `findMany(take: 5000)` y el modal de previsualización renderizaba **5.000 filas** en el cliente.
- Ahora: la tarjeta "Bitácora de Auditoría" abre **`components/reports/bitacora-preview.tsx`**, un modal que consulta `/api/bitacora?page=1&limit=50` (con módulo/usuarios/fechas) y pagina en el servidor. La tarjeta pasó a `needsDateRange: true` para que el filtro global de fechas de Reportes aplique tanto al export Excel (`lib/reports.ts` ahora filtra por rango) como a la vista previa.
- El export Excel (`/api/reportes?tipo=bitacora`) conserva el volcado (cap 5000) pero ahora respeta `desde/hasta`.

---

## 3. FASE B — Cumplimiento SAT (validaciones) ✅

### B1 `lib/validate-config.ts` — validadores nuevos
- **RFC (física o moral):** `^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$` (12 o 13 caracteres; se acepta en mayúsculas). Mensaje: *"RFC inválido (persona física: 13 caracteres; persona moral: 12…)"*.
- **CURP:** `^[A-Z][AEIOU][A-Z]{2}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$` (18 caracteres, mayúsculas).
- **`regimenFiscal` (catálogo):** claves `601, 603, 606, 607, 608, 610, 611, 612, 614, 615, 616, 621, 625, 626, 628, 629, 630, 632, 634, 635, 636, 637, 638, 651, 652, 653, 654, 655, 656, 657`. Acepta el código solo o `"601 - descripción"` (`codigoSat()` extrae el primer token; retrocompatible con datos guardados).
- **`usoCFDI` (catálogo):** `G01–G10, I01–I08, P01, P04, P05, S01, CP01, D01–D10` (requeridos por el usuario: **G03** y **P01**).
- **Dirección fragmentada:** `calle, numExt, numInt, colonia, municipio, estado, cp` — `cp` usa `^\d{5}$`, `numExt/numInt` `^[A-Za-z0-9-]{1,10}$`, los textos con límites de caracteres. `codigoPostal` se conserva **deprecado** para no romper configuraciones previas.

### B2 Editor `components/configuracion/datos-fiscales.tsx` (reescrito)
- Sección **"Identificación fiscal (SAT)"**: RFC (uppercase, máx 13), CURP (uppercase, máx 18), razón social, **`regimenFiscal` como `<select>` del catálogo** y **`usoCFDI` como `<select>` del catálogo** (los `<option>` muestran `clave · descripción` y guardan solo la clave).
- Sección **"Domicilio fiscal"**: campos `calle (6), numExt (2), numInt (2), cp (2), colonia (5), municipio (4), estado (3)` en una grilla `md:grid-cols-12`.
- El mismo editor alimenta **Configuración** y **Facturación** (`DatosFiscalesEditor`), por lo que ambos flujos heredan los catálogos y la fragmentación.

### B3 Propagación del tipo `DatosFiscales`
- `lib/business-types.ts`: la interface gana `curp, usoCFDI, calle, numExt, numInt, colonia, municipio, estado, cp` (`codigoPostal` queda `@deprecated`).
- `lib/feature-flags.ts` (normalización), `extractConfig`/`normalizeConfig` de Configuración y Facturación mapean los nuevos campos (con fallback `cp ← codigoPostal`).
- Guardado vía `CONFIG_INPUT_SCHEMA` (POST/PUT de `/api/negocio` y `/api/setup`) hereda la validación estricta.

### B4 Tests (`tests/sat-validation.test.ts`, 14 casos)
- RFC física/moral/genérico válidos e inválidos; CURP válida/inválida; régimen 601/612/626 y "601 - descripción" aceptados, **999 rechazado**; uso G03/P01 aceptados, **ZZZ rechazado**; dirección completa válida; C.P. no numérico y número exterior con caracteres prohibidos **rechazados**.

---

## 4. FASE C — Impresión térmica estricta (iframe oculto) ✅

### C1 `lib/print-ticket.ts`
`imprimirTicket(elemento, "58mm" | "80mm")`:
1. Crea un `<iframe>` **oculto** (posicionado fuera de pantalla, `width/height: 0`).
2. Escribe un documento con `<style>` propio: **`@page { size: {58|80}mm auto; margin: 0 }`**, contenedor `.print-doc-render { width: {58|80}mm }` y resets que fuerzan `.print-label-area` visible, ancho 100%, blanco/negro.
3. Copia los `<link rel="stylesheet">` y `<style>` del documento padre (los estilos globales viajan con el ticket).
4. Inyecta `elemento.outerHTML` en `body`.
5. Dispara **`iframe.contentWindow.print()`** (con `focus()` previo) tras `load`/`readyState` + 60 ms y **elimina el iframe** al terminar.

### C2 Migración de las 4 áreas imprimibles
- **Reimpresión de venta** (`components/caja/tickets-sesion.tsx`): `TicketVenta` expone `printRef`; `reimprimir()` llama `imprimirTicket(areaImpresion.current, anchoTicket)` en vez de `window.print()`. El área conserva el wrapper `hidden print-block`.
- **Reimpresión de cortes** (`components/caja/historial.tsx`): `TicketCorte` con `printRef`, mismo reemplazo.
- **Tique de corte** (`components/caja/corte-ciego.tsx`): al concluir el corte, imprime el bloque de resultado ya montado con `requestAnimationFrame + 80ms` (espera el flush de React) vía `imprimirTicket(areaImpresion.current, configCaja.anchoTicket)`.
- **Etiqueta de producto** (`components/inventario/label-modal.tsx`): `imprimirTicket(areaImpresion.current, "80mm")`.

---

## 5. FASE D — Filtros de Bitácora conectados al endpoint paginado ✅

- **`/api/bitacora`** soporta `desde`, `hasta`, `modulo` y `usuario` (búsqueda parcial sin sensibilidad a mayúsculas sobre `nombre`/`username`).
- **Página `/bitacora`**: filtros **Desde / Hasta / Módulo / Usuario** en una grilla de 5 columnas; "Aplicar filtros" resetea a página 1; la barra de paginación muestra "N registros · Página X de Y".
- **Reportes**: la vista previa paginada de bitácora incorpora módulo y búsqueda por usuario propios, más el rango de fechas global del módulo Reportes.

---

## 6. Estado de verificación

- `typecheck` ✅ **0 errores** (`npx tsc --noEmit`).
- `vitest` ✅ **91/91** (9 archivos; +14 casos nuevos de SAT en `tests/sat-validation.test.ts`; sin regresiones en `snapshots`, `product-validation`, `bulk-ops`, etc.).
- `next lint` ✅ (solo los 2 warnings preexistentes de `inventario/page.tsx`).
- `next build` ✅ **Compiled successfully · 47 páginas**.
- **Humo en localhost** (login `admin/admin123`):
  - `/api/bitacora?page=1&limit=50` → `{ total: 143, page: 1, totalPaginas: 3, tieneMas: true }`, 50 filas; página 2 devuelve las siguientes 50.
  - `/api/bitacora?page=1&limit=50&usuario=Administradora` → filtra 142 registros (nombre + username).
  - `/api/productos?page=1&limit=50` → `pagination: { page: 1, limit: 50, total: 10, totalPages: 1 }`.
  - `PUT /api/configuracion/negocio` rechaza con **400** y mensaje explícito `curp: "12345"` (*CURP inválida…*), `rfc: "hola!"` (*RFC inválido…*), `regimenFiscal: "999"` (*Régimen fiscal inválido…*); el payload SAT válido (RFC genérico XAXX, CURP 18 caracteres, régimen **612**, uso **G03**, dirección fragmentada) se guarda y se deja el estado limpio al restaurarlo después.