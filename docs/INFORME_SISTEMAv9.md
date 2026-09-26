# Informe Técnico del Sistema de Gestión para Papelería — v9

**Versión evaluada:** Iteración 9 — **iteración definitiva de pulido**
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5 + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Zod · Vitest · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv8.md`. La iteración 8 dio identidad visual (tema base + acento); la 9 **pule la operación** tras descubrir que un PUT parcial de `featureFlags` hacía "desparecer" módulos (Sidebar) al guardar cualquier cambio: se introduce un **deep merge server-side**, la configuración se reorganiza en **4 sub-pestañas**, el Sidebar deja de tener texto hardcodeado y muestra la **marca real del negocio**, se garantiza el **contraste del amarillo** en temas claros, y se incorpora la **hiper-personalización**: imágenes de producto configurables en el POS, vista por defecto del cobro, ancho de ticket y mensaje al pie, y el inicio del **módulo de Facturación** con datos fiscales del negocio.
>
> Este cierre (FASE A aplicada + FASE B/C completas) añade: **`folioCaja` único `CAJA-###`** por sesión de caja, **permisos granulares** por usuario (Cobrar/Inventario/Reportes) con enforcement en el Sidebar vía JWT, **bloqueo del POS si la caja no está ABIERTA**, pestaña **"Tickets de la Sesión"** con reimpresión térmica, **Factory Reset con ABAC** (cualquier administradora + toast con el error exacto del servidor) y limpieza del neón hardcodeado de Caja por tokens semánticos (`acento`).

---

## 1. Resumen ejecutivo

La Fase de Pulido (v9) ataca tres frentes:

- **FASE A — Esquema (constraint de ejecución respetado: solo schema):** `ConfiguracionNegocio` crece con `usarImagenesProductos Boolean @default(true)`, `mensajeTicket String?`, `anchoTicket String @default("80mm")`, `vistaDefectoPOS String @default("ESCANER")` y `datosFiscales Json?`. En el **cierre definitivo** se agrega un segundo bloque de schema: `SesionCaja.folioCaja String? @unique` (folio impreso de corte) y `Usuario.permisoCobrar/permisoInventario/permisoReportes Boolean @default(true)` (ABAC granular, no rompe usuarios existentes). El `db push` fue **ejecutado por el usuario** y el cliente Prisma **regenerado** (v5.22.0).
- **FASE B — Estabilidad y consistencia:** fix raíz del bug de **"toggles fantasma"** (deep merge de flags en el servidor), **Configuración en 4 pestañas** (Identidad y Tema / Punto de Venta / Financiero / Módulos Avanzados), **Sidebar con la marca del negocio** (nombre + avatar circular, sin texto hardcodeado "Pape/lería") y token **`text-warning`** con contraste por tema (amarillo ámbar en temas claros) para los textos de estado/advertencia. **Neón semántico:** los componentes de Caja migran a tokens del tema (`acento`) en lugar de colores neon fijos.
- **FASE C — Facturación, POS a medida y cierre operativo:** módulo **Facturación** funcional (datos fiscales, exclusivo de administradora + flag/canal propio), toggle **`usarImagenesProductos`**, **`vistaDefectoPOS`** (lector/catálogo táctil), **ticket dinámico** por ancho (`58mm`/`80mm`) con `mensajeTicket`, **folio CAJA-###** al abrir caja, **bloqueo de Cobro sin caja ABIERTA**, pestaña **"Tickets de la Sesión"** con reimpresión, **permisos granulares** por usuario (checkboxes en Gestión de Usuarios) y **Factory Reset ABAC** con toasts.

**Estado de verificación (cierre):** `prisma generate` ✅ · `db push` ✅ aplicado · `typecheck` ✅ · `npm test` ✅ **54/54** · `lint` ✅ (2 warnings preexistentes en inventario) · `npm run build` ✅ (42 páginas + 42 rutas de API, incluidas `/facturacion` y la nueva `/api/caja/ventas`).

---

## 2. FASE A — Esquema de hiper-personalización ✅

- `schema.prisma`: 5 campos nuevos con comentario *"Hiper-personalización (Fase de Pulido)"*:
  - `usarImagenesProductos Boolean @default(true)`
  - `mensajeTicket String?`
  - `anchoTicket String @default("80mm")`
  - `vistaDefectoPOS String @default("ESCANER")`
  - `datosFiscales Json?` (RFC, razón social, régimen fiscal, código postal)
- **Segundo bloque (cierre definitivo):**
  - `SesionCaja.folioCaja String? @unique` → folio correlativo de corte de caja.
  - `Usuario.permisoCobrar Boolean @default(true)`, `Usuario.permisoInventario Boolean @default(true)`, `Usuario.permisoReportes Boolean @default(true)` → ABAC granular; con `@default(true)` los administradores existentes mantienen todos los permisos sin migración de datos.
- Se validó con `prisma format` + `prisma validate` desde `packages/database` (el `.env` vive ahí). El usuario ejecutó `npx prisma db push` aceptando el warning del índice único `[folioCaja]` (sin datos previos, no hubo conflictos); se regeneró el cliente (`npx prisma generate`, v5.22.0) tras liberar la DLL del motor deteniendo el dev server.

---

## 3. FASE B — Estabilidad y consistencia ✅

### 3.1 Bug "toggles fantasma": combinación segura por módulo
- **Causa:** el PUT de `featureFlags` sobrescribía el objeto completo; un cliente (o snapshot/rollback) que enviara un subconjunto "apagaba" el resto de módulos del estado global y del Sidebar.
- **Solución (autoridad servidor):** `lib/feature-flags.ts` expone `normalizeFlags(raw)` (llena TODAS las llaves, ignora no-booleanos) y `mergeFeatureFlags(previous, incoming)` (solo sobrescribe las llaves entrantes que son `boolean`). El `PUT /api/configuracion/negocio` y `POST /api/setup` mergean contra la fila previa de la BD.
- **Cliente:** `store/config.ts#refresh` también hace deep merge con el estado previo del Store, por lo que una config parcial del servidor nunca borra módulos visibles. En `hydrate()` no se muta la config tras verificar la firma (se preserva la `sessionKey`).
- **UI:** la pestaña *Módulos Avanzados* explica que al guardar se hace una combinación segura módulo por módulo.

### 3.2 Configuración por pestañas (`app/(dashboard)/configuracion/page.tsx`)
- `NegocioConfigPanel` se reorganiza en **4 sub-pestañas** con animación (`AnimatePresence` + `motion.div`): **Identidad y Tema** (datos generales + logo + tema + acento), **Punto de Venta** (ancho de ticket, vista por defecto, imágenes de producto, mensaje al pie, métodos de pago, política de stock offline), **Financiero** (cuenta para transferencias + **Facturación · Datos fiscales**) y **Módulos Avanzados** (feature flags).
- La barra de guardado (`Guardar cambios`) y el *Restablecimiento de seguridad* (snapshot) quedan fijos fuera del `AnimatePresence` → siempre visibles.
- El corpus del PUT incluye ya los 5 campos nuevos (Zod los normaliza con defaults).
- **Componente compartido:** `components/configuracion/datos-fiscales.tsx` (`DatosFiscalesEditor`) se usa tanto en la pestaña *Financiero* como en el módulo *Facturación* (un solo lugar para validar/max-length).

### 3.3 Sidebar con la marca real (`components/layout/sidebar.tsx`)
- Se elimina el texto hardcodeado `Pape`/`lería`: ahora el encabezado muestra **`config.nombreNegocio`** con su **logo en avatar circular** (`h-9 w-9 rounded-full object-cover`) o, si no hay logo, un círculo con la inicial del negocio. El subtítulo mantiene `Panel Admin | Punto de Venta · <nombre>`.
- Se añade el ítem **Facturación** con icono `FileText`, permiso `facturacion.ver` y flag `facturacion`.

### 3.4 Contraste del amarillo por tema
- Nuevo token **`text-warning`**: `--text-warning` definido en `globals.css` por tema (**neón** `#fbbf24`; **minimalista/corporativo** ámbar oscuro `#d97706`/`#b45309`; **brutalista** `#78350f`) y mapeado en `tailwind.config.ts` como color `warning`.
- Los **textos** de `text-neon-yellow` (stock bajo, alertas, offline, devoluciones, etc.) migran a `text-warning` (15 archivos) para garantizar legibilidad sobre fondos claros; los fondos `bg-neon-yellow/…` y bordes se conservan.

---

## 4. FASE C — Facturación y POS a medida ✅

### 4.1 Módulo de Facturación (`app/(dashboard)/facturacion/page.tsx`)
- Reemplaza el placeholder "Módulo en construcción" por el **editor de datos fiscales del negocio** (RFC, razón social, régimen fiscal, código postal), que persiste vía el mismo `PUT` de configuración (los cambios de datos fiscales se guardan sin tocar el resto de la config gracias al deep merge de flags).
- Acceso gobernado por: permiso `facturacion.ver` (solo `ADMINISTRADORA` en `lib/auth.ts`), flag `facturacion` y ruta administrativa en `middleware.ts` (`/facturacion` incluido en `isAdminRoute`).

### 4.2 `usarImagenesProductos` condicional
- **`product-form.tsx`:** la columna derecha de imagen se oculta y el grid pasa de `md:grid-cols-[1fr_auto]` a 1 columna.
- **`pos/product-grid.tsx`:** se **omite el fetch por-producto de imágenes/`imagenBase64`** cuando está desactivado (`useEffect` con dep) → tarjeta genérica con icono, menos red.
- **`inventario/quick-edit.tsx`:** se ocultan la columna `Imagen` de la tabla y el `ProductImageUpload`.

### 4.3 `vistaDefectoPOS` → pantalla de cobro
- **`BarcodeScanner`** recibe prop `autoFocus` y, cuando es `true`, enfoca el input fantasma del lector al montar la pantalla (efecto con `focusInput()` del hook `useScannerDetection`).
- **`/cobro`** pasa `autoFocus={config.vistaDefectoPOS !== "CATALOGO_TACTIL"}`: `ESCANER` = enfocar lector; `CATALOGO_TACTIL` = el catálogo táctil queda a la mano sin foco.

### 4.4 Ticket dinámico (ancho + mensaje)
- **`historial.tsx` `TicketCorte`:** la clase `print-ticket-57|80` se elige según `config.anchoTicket` y se imprime `mensajeTicket` al pie (borde superior) en la reimpresión de cortes.
- **`corte-ciego.tsx`:** el área imprimible de la fase *resultado* aplica el ancho correspondiente y añade `mensajeTicket` bajo el aviso de impresión.

### 4.5 Fidelidad de snapshots (`lib/snapshots.ts` + `tests/snapshots.test.ts`)
- La captura/restauración y los fixtures incluyen los 5 campos nuevos (defaults en filas vacías: imágenes `true`, `80mm`, `ESCANER`, mensaje/fiscales `null`).

### 4.6 Folio de caja `CAJA-###` (`app/api/caja/abrir` + `/estado`)
- Al abrir la caja se calcula el **siguiente número correlativo** (`MAX` numérico de los `folioCaja` existentes + 1, `padStart(3,"0")`) y se persiste como `folioCaja` (`@unique`). El folio se expone en `/api/caja/estado` y se muestra en la **barra de status** de la página de Caja junto a la hora de apertura. Cierra el tique de impresión con una referencia trazable (`CAJA-001`, …): `CAJA-10 > CAJA-9` porque el `MAX` es numérico y no lexicográfico.

### 4.7 Cobro bloqueado sin caja ABIERTA (`app/(dashboard)/cobro/page.tsx`)
- El POS consulta `/api/caja/estado` al montar. Si no hay sesión `ABIERTA` (ninguna o en `EN_CIERRE`) se muestra una pantalla de bloqueo: *"La caja no está abierta… Abre la caja para poder registrar ventas"* con botón a *Control de Caja*. Mientras verifica muestra un *skeleton*; si el servidor está inalcanzable (offset offline del negocio) no bloquea.

### 4.8 Tickets de la Sesión (`app/api/caja/ventas` + `components/caja/tickets-sesion.tsx`)
- Nueva pestaña **"Tickets de la sesión"** en la página de Caja (tercera tab). Lista las ventas de la sesión vigente (o de la sesión cerrada más reciente si no hay una abierta) con folio, hora, método y total, y permite **reimprimir** el recibo térmico: se recupera la venta completa por `/api/ventas/[folio]` y se renderiza `TicketVenta` (mono, `print-ticket-57|80`, con `mensajeTicket` al pie) en el área imprimible, reutilizando el patrón de `TicketCorte`.

### 4.9 Permisos granulares (ABAC por usuario) — schema `Usuario.permiso*`
- **UI:** columna *"Permisos de módulo"* en Gestión de Usuarios con tres toggles **Cobrar / Inventario / Reportes**, y los mismos checkboxes en el modal de *Nuevo usuario* (default `true`).
- **API:** `GET /api/usuarios` y `POST /api/usuarios` aceptan/persisten los 3 booleanos (bitácora con detalle); `PATCH /api/usuarios/[id]` valida y actualiza cada flag. JWT (`signToken`), `/api/auth/login` y `/api/auth/me` incluyen los flags (tokens antiguos ⇒ `true`).
- **Enforcement (Sidebar):** `store/auth.ts#hasPermission` combina el mapa por rol con los flags granulares (`GRANULAR_PERMISOS`): `permisoCobrar`→`cobro.realizar`, `permisoInventario`→`inventario/proveedores/pedidos`, `permisoReportes`→`reportes/bitacora/facturacion`. Apagar un flag oculta el módulo incluso para una ADMINISTRADORA.

### 4.10 Factory Reset con ABAC y toasts (`/api/seguridad/reset` + `factory-reset.tsx`)
- **ABAC (Fase 9):** se elimina la restricción de *raíz* (`isRoot`) — cualquier cuenta con rol **ADMINISTRADORA** que escriba su **contraseña** (+ verificada contra el hash) y la frase exacta **CONFIRMAR BORRADO** puede reiniciar; el snapshot protege la información previa.
- **Toasts:** los errores dejan de mostrarse solo inline; ahora son **notificaciones emergentes** (fija abajo-derecha, auto-descarte a los 7 s, botón cerrar) con el **mensaje exacto devuelto por el servidor** (la ruta devuelve `e.message` real si el snapshot falla en vez de un mensaje genérico).

### 4.11 Neón semántico en Caja
- `app/(dashboard)/caja/page.tsx`, `components/caja/corte-ciego.tsx`, `historial.tsx` y el nuevo `tickets-sesion.tsx` sustituyen el verde hardcodeado por el token **`acento`** (`var(--color-accento)`, el color de marca elegido por el negocio): fondos `bg-acento/10`, textos `text-acento`, bordes/focos `border|focus:border-acento`. El rojo (peligro/descuadre) y el **cian de Recargas** se conservan como distinción funcional del flujo separado. Como `--neon-green` ya se re-pintaba con `colorAcento`, el cambio es visualmente equivalente en el tema Neón y correcto en los temas claros.

### 4.12 Ajustes pendientes resueltos: hidratación para cajera y modo de confianza
- **`/api/configuracion/negocio/cache` abierto a cualquier usuario autenticado** (`middleware.ts`): era el único rastro de 403 admin sobre una ruta de **lectura**; una CAJERA ya no degrada a `NO_VERIFICADA`/offline al hidratar flags. Los **escritores** (`PUT /api/configuracion/negocio`, `/api/setup`, reset) siguen siendo exclusivos de `ADMINISTRADORA`.
- **Estado `CONFIANZA` explícito** (`store/config.ts`): antes, en LAN por http (sin `crypto.subtle`) el trust se etiquetaba como `VERIFICADA` aunque no hubo verificación criptográfica. Ahora hay 5 estados (`PENDIENTE | VERIFICADA | CONFIANZA | NO_VERIFICADA | ERROR`); `isFeatureEnabled` honra `VERIFICADA` y `CONFIANZA` (en ambos casos la réplica proviene del servidor autenticado). `refresh()` también distingue el modo tras guardar.
- **Badge visible en Configuración** (`components/configuracion/trust-badge.tsx`): pill en la cabecera con *"Firma verificada"* (WebCrypto) / *"Modo confianza LAN"* (sin WebCrypto) / *"No verificada"* (módulos apagados) / *"Sin conexión ni caché"*, con el detalle (`lastError`) en tooltip.
- **HTTPS en producción NO se auto-redirige** en el middleware a propósito: el despliegue real del aula usa `http://<ip>` sin certificado, y una redirección rompería el acceso LAN. Si algún día se despliega con dominio + certificado, el navegador pasa solo a `VERIFICADA`. Para cerrar del todo el modo LAN se enumeró HTTPS como siguiente iteración.

---

## 5. Verificación

- `npm run typecheck` ✅ (Zod/JSON/tokens/componentes, con `prisma generate` del schema ya validado).
- `npm test` ✅ **54/54** (fixtures de snapshots actualizados con la hiper-personalización).
- `npm run lint` ✅ (2 warnings preexistentes en inventario, sin errores nuevos).
- `npm run build` ✅ (42 páginas + 42 rutas de API, incluida `/facturacion` y `/api/caja/ventas`).
- **BD aplicada:** `npx prisma db push` ✅ (usuario) con warning aceptado del índice único `[folioCaja]`; cliente regenerado (`prisma generate` v5.22.0) tras detener el dev server (EPERM de `query_engine-windows.dll.node`).

**Cierre de la iteración definitiva (FASE B/C):** nuevo código verificado con `typecheck` ✅, `npm test` ✅ **54/54** (52 previos + 2 de `deleteSnapshot`), `lint` ✅ (sin nuevos warnings) y `npm run build` ✅.

### Fix post-verificación: historial de snapshots rompía con `Cannot read properties of undefined (reading 'toLocaleString')`

**Síntoma:** al abrir *Historial de recuperación* con snapshots guardados, el modal revienta con ese error de runtime; en "Reiniciar Sistema" se pedía además la opción de limpiar la BD de snapshots antiguos.

**Causa raíz:** `GET /api/seguridad/snapshot` devolvía solo `id/fecha/motivo/usuario`; el componente `RecoveryHistory` esperaba `totalVentas/totalTransacciones/configVersion`, campos que viven **dentro** de `datosJson`. Al existir la primera fila, `s.totalVentas.toLocaleString(...)` explotaba con `undefined.toLocaleString()`. (Exposición del detalle sin revelar el blob con logos base64.)

**Solución:**
1. `app/api/seguridad/snapshot/route.ts` → el listado lee de `datosJson` los totales y la versión (`totales.ventas.totalNeto/conteo`, `configuracion.configVersion`) con `?? 0`.
2. `recovery-history.tsx` → guardas defensivas: `formatearFecha(undefined) → "—"`, `formatearTotal` con fallback 0, versión `"—"`; el error de acciones (restaurar/eliminar) ya no oculta la lista (banner separado).
3. **Borrado de snapshots (solicitado):** `deleteSnapshot()` en `lib/snapshots.ts` + `DELETE /api/seguridad/snapshot/[id]` (solo ADMINISTRADORA, 404 si no existe, bitácora con el id) + botón 🗑 en cada fila con confirmación inline *Confirmar/Cancelar*.

**Verificación del fix:** `typecheck` ✅ · `npm test` ✅ **54/54** (2 nuevos casos de `deleteSnapshot`) · `lint` ✅ · `npm run build` ✅.

### Fix post-verificación: módulos que "desaparecen" del sidebar (2 causas + pruebas reales)

**Síntoma:** al abrir la app aparecen los 8 módulos (estado `PENDIENTE`), pero al navegar el menú se reduce a ~4–5; solo "Guardar" en Configuración los restaura temporalmente y se repite en cada carga. Persistía incluso en localhost.

**Diagnóstico con pruebas:** se reprodujo el flujo real con datos de BD (vitest + fetch HTTP con JWT de administradora). En proceso (`getSignedBusinessConfig()` directo) la firma **verificaba**; a través de HTTP (`/api/configuracion/negocio/cache`) **no verificaba** con NINGUNA variante de canonicalización. La causa: `buildSignedConfig` firmaba el objeto **en memoria**, que traía `undefined` dormidos (p. ej. `datosBancarios: {cuenta:"Admin"}` sin `banco/titular/clabe`). `NextResponse.json` **descarta los `undefined` al serializar**, así que el cliente recibía un objeto distinto al firmado → firma inválida → `trust=NO_VERIFICADA` → módulos ocultos. Por eso se notaba "raro": en localhost (contexto estricto, WebCrypto presente) FALLABA siempre, y por LAN `http://<ip>` "funcionaba" solo tras el fallback de seguridad anterior.

**Solución (2 cambios, ambos de raíz):**
1. `lib/config-signing.ts` → `buildSignedConfig` hace un **round-trip JSON del config antes de firmar**: firma la MISMA representación que verá el navegador (el transporte HTTP). Definitorio: la firma deja de depender de `undefined`/NaN/`-0` del objeto en memoria.
2. `lib/feature-flags.ts` → `normalizeDatosBancarios`/`normalizeDatosFiscales` **podan los campos `undefined`** para que los blobs no transporten valores ausentes.
3. (Extra, previo) `store/config.ts` → si WebCrypto no existe (http por LAN en aula, `crypto.subtle` ausente), se confía en la réplica autenticada del servidor, que sigue siendo la autoridad final (`requireFeature` revalida en cada API).

**Verificación del fix:** el mismo script HTTP que fallaba ahora devuelve `VERIFICA(current): true`. `typecheck` ✅ · `npm test` ✅ 52/52.

---

## 6. Cómo probarlo manualmente

1. **Toggles fantasma (regresión):** *Configuración → Módulos Avanzados* → desactivar p. ej. *Proveedores*, luego cambiar solo el *nombre del negocio* en *Identidad y Tema* y *Guardar*. Verificar que **todos** los demás módulos siguen como estaban (sin "desaparecer").
2. **Pestañas:** recorrer *Identidad y Tema / Punto de Venta / Financiero / Módulos Avanzados*; el botón *Guardar cambios* permanece visible en las 4.
3. **Facturación:** *Configuración → Financiero* o menú *Facturación* → llenar RFC/razón social/régimen/CP → *Guardar*. La cajera no ve el ítem (permiso + flag + middleware).
4. **Imágenes del POS:** *Punto de Venta → Mostrar imágenes* desactivado → Productos/Edición rápida pierden la columna de imagen y el catálogo del cobro muestra tarjetas genéricas (menos red).
5. **Vista por defecto:** `CATALOGO_TACTIL` → al abrir Cobro el lector NO enfoca; `ESCANER` → el input del lector toma el foco.
6. **Ticket:** con `58mm` guardado, hacer un corte (o reimprimir del historial) → el área imprimible usa `print-ticket-57` y muestra el `mensajeTicket` al pie.
7. **Contraste:** cambiar a tema *Minimalista* y mirar las alertas de stock bajo / avisos offline: amarillo ámbar legible sobre fondo claro.
8. **Folio de caja:** abrir una caja → la barra de status muestra `Caja Abierta desde … · CAJA-001`; el corte impreso y el snapshot conservan el folio.
9. **POS bloqueado:** con la caja cerrada, ir a *Cobro* → pantalla "La caja no está abierta…" y botón a *Control de Caja*; al abrir la caja, el POS se desbloquea.
10. **Tickets de la sesión:** en *Caja → Tickets de la sesión* se listan las ventas de la sesión abierta; *Reimprimir* imprime el recibo térmico con el ancho y mensaje configurados.
11. **Permisos granulares:** en *Configuración → Usuarios*, apagar p. ej. *Inventario* a una administradora → recargar → su Sidebar deja de mostrar Inventario/Proveedores/Pedidos sin perder el panel admin.
12. **Factory Reset:** abrir *Reiniciar Sistema* con una **administradora no raíz** → contraseña + `CONFIRMAR BORRADO` → se reinicia (antes era 403); un fallo de snapshot se muestra como **toast** con el mensaje exacto del servidor.
13. **Confianza de configuración:** en *Configuración*, abrir el tooltip del badge: en `localhost` se ve *"Firma verificada"*; entrando por `http://<ip>` se ve *"Modo confianza LAN"*. Con una **cajera** iniciada, cargar cualquier pantalla (p. ej. Cobro) → la config hidrata sin 403 (los flags no-verificados ya no degradan).
14. **Historial de recuperación:** reiniciar el sistema (genera snapshot) → en *Setup → Historial de recuperación* ya **no** revienta: muestra fecha, `v<versión>`, total de ventas y conteo del momento del reinicio. Con la 🗑 de una fila → *Confirmar* la elimina del historial (queda anotado en Bitácora, módulo Configuración); *Cancelar* aborta.

---

## 7. Notas para la siguiente iteración

- La emisión de **CFDI 4.0** consumirá `datosFiscales` (hoy el módulo solo lo administra); considerar `PAC`, folios y timbrado.
- `vistaDefectoPOS` podría evolucionar a un modo *split* con el catálogo y el lector a la vez.
- El mensaje del ticket podría aceptar variables (`{fecha}`, `{vendedor}`) si se vuelve plantilla.
- **WebCrypto en LAN:** queda resuelto a nivel de producto: el badge distingue `VERIFICADA` de `CONFIANZA` (LAN sin `crypto.subtle`) y el `/cache` ya no bloquea a las cajeras. Para cerrar el círculo del todo: desplegar con **HTTPS** (certificado local/dominio) y el navegador pasa solo a `VERIFICADA`; no se auto-redirige para no romper el acceso por IP en el aula.
- **Purga de imágenes:** `usarImagenesProductos` quedó como toggle (la BD de producción está en `false` = modo "datos puros"); si se quiere la purga total, eliminar el toggle y el bloque de imagen del schema/UI (decisión del cliente).