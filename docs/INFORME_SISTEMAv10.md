# Informe Técnico del Sistema de Gestión para Papelería — v10

**Versión evaluada:** Iteración 10 — **Escalabilidad Comercial y Plantilla Universal**
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5.22 + PostgreSQL (Docker :5433) · Zustand · Zod · Vitest · ExcelJS · Playwright · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv9.md`. La iteración 10 convierte al sistema en una **plantilla de negocio universal** (papelería / ferretería / farmacia) con **escalabilidad operativa**: la moneda deja de ser solo "piezas enteras" y pasa a manejar **granel con decimales (0.5 kg, 8 m)** y **servicios sin inventario**, se agregan **operaciones masivas** (multiedición de precios + baja lógica por listas), el módulo de **Apartados** (reservar mercancía con anticipo) y un endurecimiento de seguridad: **purga de bitácora con respaldo y gate ABAC**, **cambio de contraseña en Mi Cuenta** y **permisos por módulo en modal**. Un pase de **auditoría** posterior agrega la **purga total de imágenes de producto** (schema/UI/API/tests), la **vista previa de Reportes en modal interactivo** y corrige el **ancho de ticket duplicado** en Configuración.
>
> **Extensión de la iteración (Fases B/C adicionales):** la plantilla gana **Configuración Personalizable** — los flags `usarCaducidad`, `usarUbicaciones` y `requerirFondoInicial` hacen el inventario y la caja configurables por giro (farmacia activa vigencia; abarrotes; papelería los apaga) —, un **preset Boutique** (nuevo valor del enum, aplicado con `prisma db push`), el **Admin Override** (el rol ADMINISTRADORA ejerce todos los módulos sin depender de flags granulares), **animaciones UX** (stagger en Login y transiciones de ruta), la **multiedición de precios con monto fijo en $** y la **anulación de sesiones de caja** (solo administradora, con motivo y exclusión de ingresos anulados en Dashboard/Reportes).
>
> Se respeta el flujo exigido: **FASE A (solo schema)** → **FASE B (B1–B5)** → **FASE C (C1–C3)**, con **tests Vitest** del nuevo comportamiento y el cierre con **typecheck / lint / build** limpios.

---

## 1. Resumen ejecutivo

La Fase 10 ataca la escalabilidad en tres frentes:

- **FASE A — Esquema (constraint de ejecución respetado: solo schema):** `ConfiguracionNegocio.tipoNegocio` (`PAPELERIA_RETAIL | FERRETERIA | FARMACIA`), `Producto.permiteDecimales/esServicio` y migración de toda la cadena de cantidades a `Decimal(10, 3)` (stock, `LineaDetalleVenta.cantidad`, Kardex, devoluciones), más los modelos nuevos **`Apartado`/`ApartadoLinea`** (folio `APT-…`, anticipo, saldo, reserva de stock). `prisma validate` + `db push` + `prisma generate` (v5.22.0) ejecutados.
- **FASE B — Blindaje de seguridad (B1–B5):** **B1 Mi Cuenta** (cambio de contraseña con verificación de la actual), **B2** permisos por módulo en **modal** de Gestión de Usuarios, **B3** **CSS de impresión térmica** (`@page ticket57/ticket80` → 57 mm y 80 mm), **B4** export a Excel **con alineación derecha** en columnas monetarias/cantidad, **B5** **purga de bitácora** con **respaldo JSON descargable**, contraseña y gate **`isRoot` o (ADMINISTRADORA + 3 permisos)**.
- **FASE C — Escalabilidad operativa (C1–C3):** **C1** operaciones masivas: **multiedición de precios** (ajuste porcentual con invariante *precio ≥ costo* y lista de omitidos) y **baja masiva lógica** (`activo=false`); **C2** **granel (3 decimales)** y **servicios** (`esServicio`) que **no tocan stock ni Kardex** en venta, devolución y apartado; **C3** módulo de **Apartados** (crear desde el POS con anticipo y reserva inmediata de inventario, método de anticipo, notas y listado con estado `PENDIENTE`/`LIQUIDADO`/`CANCELADO`).

**Estado de verificación (cierre):** `prisma generate` ✅ · `db push` ✅ · `typecheck` ✅ 0 errores · `vitest` ✅ **70/70** (8 archivos) · `lint` ✅ (2 warnings preexistentes en inventario, sin errores nuevos) · `npm run build` ✅ **Compiled successfully**.
> **Post-auditoría:** `vitest` **68/68** (se retiraron las 2 pruebas de imagen), `typecheck` ✅, `lint` ✅ (solo los 2 warnings preexistentes) y `build` ✅ **Compiled successfully**; verificado en localhost (login admin/admin123): `/api/configuracion/negocio` ya **no** expone `usarImagenesProductos` y `/configuracion`, `/reportes`, `/inventario`, `/cobro`, `/facturacion` responden 200 con la purga y el modal activos.
> **Cierre de la extensión (Fase B/C adicionales):** `prisma validate` ✅ (con `BOUTIQUE` en el enum) · `typecheck` ✅ 0 errores · `vitest` ✅ **77/77** (8 archivos) · `lint` ✅ (solo los 2 warnings preexistentes) · `build` ✅ **Compiled successfully** (46 páginas); en localhost el endpoint de configuración expone los 3 flags nuevos y `/api/caja/abrir` exige (o tolera) el fondo inicial según `requerirFondoInicial`.

---

## 2. FASE A — Esquema de escalabilidad (solo schema) ✅

- `enum TipoNegocio { PAPELERIA_RETAIL | FERRETERIA | FARMACIA }` y `ConfiguracionNegocio.tipoNegocio` con `@default(PAPELERIA_RETAIL)` — el giro elegido personaliza la marca, los catálogos sugeridos (Setup) y el acento visual (p. ej. `FERRETERIA` → `neon-cyan`).
- `Producto.permiteDecimales @default(false)` → activa granel (el input del POS y el ticket aceptan fracciones 0.5/1.5/8) y `Producto.esServicio @default(false)` → el artículo **no participa del inventario** ni del Kardex (no genera `MovimientoKardex`, no descuenta `stockActual`, no se valida contra existencias).
- Cadena de cantidades a **`Decimal(10,3)`**: `Producto.stockActual/stockMinimo`, `LineaDetalleVenta.cantidad`, `MovimientoKardex.cantidadCambio`, `DevolucionLinea.cantidad`, `ApartadoLinea.cantidad`. Los totales monetarios conservan `Decimal(10,2)`.
- Modelos **`Apartado`** (folio único `APT-…`, `idCliente`, `idCaja?`, `anticipo`, `total`, `estado`, `notas`, `idUsuario`) y **`ApartadoLinea`** (`idApartado`, `codigoItem`, `cantidad Decimal(10,3)`, `precioMomento`, `descuentoLinea`, `subtotalLinea`) con índices `[idCliente]` y `[estado]`.

---

## 3. FASE B — Blindaje de seguridad ✅

### B1 Mi Cuenta (`components/configuracion/mi-cuenta.tsx`)
- Panel **"Mi Cuenta"** (primera pestaña de Configuración): nombre, rol y badge *"Raíz · puede purgar bitácora"* cuando `canPurge`.
- **Cambio de contraseña** con tres campos (`passwordActual`, `passwordNuevo`, confirmación) → `POST /api/usuarios/[id]/password` con `currentPassword`; el servidor compara contra el hash previo con bcrypt y registra el cambio en bitácora. Cierra la brecha de no tener forma de rotar credenciales.

### B2 Permisos en modal (`components/configuracion/user-management.tsx`)
- Los tres toggles Cobrar / Inventario / Reportes dejan la fila y se agrupan en un **`PermisosModal`** alcanzado por el botón **"Permisos (n/3)"** de la tabla: la fila queda compacta y el conteo activo visible sin edición accidental. Guardar persiste vía `PATCH /api/usuarios/[id]` (los flags siguen viajando en el JWT y el Sidebar los enforza).

### B3 CSS de impresión térmica (`app/globals.css`)
- Reglas `@page ticket57` y `@page ticket80` con fallback a `size: 3mm 97mm` y márgenes `0`, más el bloque estricto de impresión: oculta `no-print`, colapsa `template-fantasma`, fuerza tamaños de ticket (`print-ticket-57`/`print-ticket-80`) y evita cortes de palabra/claves en los recibos. Los `@media print` condicionados por ancho configurado (`anchoTicket 58mm|80mm`) redondean la entrega de **B3** sin tocar pantalla.

### B4 Export Excel con alineación derecha (`lib/export-exceljs.ts`)
- `buildStyledWorkbook` recibe ahora hojas **extra** (Kardex, etc.): cada celda con `numFmt` (moneda `"$"#,##0.00` o cantidad `0`) se alinea **derecha** y solo se aplica el formato numérico cuando el valor es numérico — columnas monetarias/cantidad quedan legibles y alineadas en el cálculo.
- El endpoint `/api/reportes` consume la misma fuente (`lib/reports.ts`) para vista previa y export, garantizando (JSON ↔ Excel) coincidencia exacta.

### B5 Purga de bitácora (`app/api/bitacora/purgar/route.ts` + página)
- **Gate ABAC:** `isRoot === true` **o** (`rol === ADMINISTRADORA` con `permisoCobrar && permisoInventario && permisoReportes`) **más contraseña** verificada contra el hash — no basta ser admin.
- **Respaldo previo:** genera un JSON con todos los registros (cap `MAX_BACKUP = 20000`) que la UI descarga antes de eliminar; luego `deleteMany` de registros con `fechaHora < corte`.
- Antigüedad configurable: `meses` entero entre **3 y 24** (default 6). Deja un registro `SEGURIDAD` en bitácora con el corte y cantidades.
- **`canPurge` expuesto server-side** (no en el JWT): `GET /api/auth/me` y la respuesta de `/api/auth/login` lo computan desde la BD (`lib/auth`), y `store/auth.ts` lo hidrata vía `partialize` → la UI muestra el botón **"Purgar registros antiguos"** solo a quien puede.

---

## 4. FASE C — Escalabilidad operativa ✅

### C1 Operaciones masivas (`lib/bulk-ops.ts` + `app/api/productos/bulk/route.ts` + UI)
- **Multiedición de precios:** `{ accion:"ajustarPrecio", codigos[], porcentaje }` calcula el precio nuevo por redondeo (con casos +/−) y aplica la **invariante comercial: el precio de venta NUNCA queda por debajo del costo de compra** → los productos que quedarían bajo costo se registran en `omitidos` con motivo. La bitácora guarda `aplicados` y `omitidos` como `InputJsonValue`.
- **Baja masiva lógica:** `{ accion:"borrar", codigos[] }` pone `activo=false` (se conserva el histórico de ventas/Kardex); réplica por defecto con confirmación "Escribí borrar".
- UI en Inventario: selección por código (o *seleccionar todo*), barra de acciones, % de ajuste, vista previa de omitidos y toast de resultado.

### C2 Decimales (granel) y servicios (`lib/sales.ts`, `lib/returns.ts`, `lib/cart.ts`, POS)
- **Granel:** `permiteDecimales === true` acepta fracciones con validación a **3 decimales** (1.5 ok, 1.0005 inválido); el stock se descuenta con `decrement` fraccionario y el Kardex traza `SALIDA` con signo decimal.
- **Servicios:** `esServicio === true` **no toca inventario** — no valida existencias, no decrementa `stockActual`, **no emite `MovimientoKardex`** — la constante se replicó en venta, devolución (`returns.ts` reingresa stock solo si no es servicio) y apartado; el POS los muestra y cobra normalmente.
- Regla de negocio: **unidad entera con fracción se rechaza** ("el producto no admite fracciones").

### C3 Módulo de Apartados (`lib/apartados.ts` + `app/api/apartados/route.ts` + POS)
- **Flujo POS:** botón **"Crear apartado"** en el carrito → modal con `ClientSelectModal` (crea cliente si no existe), **anticipo** (0 ≤ anticipo ≤ total, con % rápidos 10/25/50/100), método del anticipo (efectivo/digital) y notas.
- `crearApartado(tx, input, ctx)` (transaccional, replica de `postVenta`): valida cliente/items, **reserva el stock de inmediato** (decrement + Kardex `SALIDA` "Apartado …", omitiendo servicios), el anticipo **ingresa a la `SesionCaja` abierta** (`totalVentasEfectivo`/`totalVentasDigital`), genera folio `APT-YYYYMMDD-XXXX` y bitácora `PUNTO_VENTA`.
- **API:** `POST /api/apartados` (crea; requiere caja ABIERTA) y `GET /api/apartados` (PENDIENTES y LIQUIDADOS, hasta 100, con cliente y líneas). El reporte del cierre contempla el anticipo dentro de los totales de caja.

---

## 5. Revisión de auditoría — Cero-Imagen, modal y fix de duplicado ✅

### 5.1 Vista previa de Reportes en modal interactivo (`app/(dashboard)/reportes/page.tsx`)
- El botón **"Vista previa"** de cada tarjeta ya no hace scroll a un bloque inline: abre un **modal con `AnimatePresence`** (overlay con clic fuera, botón X, encabezado con el label del reporte) que muestra `PreviewSkeleton` y, al responder, la tabla del reporte reutilizando `ReportsPreviewTable`. Se eliminaron el `useRef`/`previewRef`, el `scrollIntoView` y el bloque de vista previa incrustado (se conserva el hint bajo el grid).
- **Hallazgo de auditoría:** el módulo Reportes existía completo contra la spec (las 7 tarjetas — Inventario Completo, Reabastecimiento, Reporte de Ventas, Ventas por Producto, Top 20 Más Vendidos, Cierre de Caja, Bitácora — + filtros globales + Vista previa/Excel). El concepto "menos vendidos" **nunca figuró** en el código histórico; el pendiente real era convertir esa vista previa en modal (spec confirmada por el cliente).

### 5.2 Fix: opción de ancho de ticket duplicada (`app/(dashboard)/configuracion/page.tsx`)
- El selector de ancho usaba `Object.keys(ANCHOS_TICKET)`, pero sobre un **arreglo** eso devuelve los índices `"0","1"` → ambas opciones caían en el mismo `else` *"Térmica 58 mm (mini)"*. Se cambió a `ANCHOS_TICKET.map((anc) => …)`: el valor y el label salen del elemento, mostrando correctamente **Térmica 58 mm (mini)** y **Térmica 80 mm (estándar)**.

### 5.3 Purga total de imágenes de producto (decisión del cliente: *quitar toggle y purgar*)
- **Esquema:** eliminados `Producto.imagenMime` / `Producto.imagenBase64` y `ConfiguracionNegocio.usarImagenesProductos` (`packages/database/prisma/schema.prisma`). `prisma validate` ✅, `db push --accept-data-loss` **ejecutado** (drop de las 3 columnas, autorizado por el cliente) y cliente regenerado (v5.22.0).
- **UI:** `product-form.tsx` pierde la columna derecha de imagen, el input oculto, `comprimirImagen` y los estados `imagen/imagenError` (payload sin campos de imagen); `quick-edit.tsx` pierde la columna "Imagen"; `pos/product-grid.tsx` vuelve a tarjeta con ícono (sin fetch por producto); **`product-image-upload.tsx` eliminado**; el toggle "Mostrar imágenes de productos en el POS" desaparece de Configuración y Facturación.
- **API/datos:** `/api/productos`, `/api/productos/[codigo]`, `/api/configuracion/negocio`, `/api/setup`, `lib/validate-product` (fuera `IMAGEN_MIMES_PERMITIDOS`/`IMAGEN_BASE64_MAX`), `lib/feature-flags`, `lib/validate-config`, `lib/snapshots`, `lib/business-types` y `store/inventory` sin rastro del campo; el `/api/configuracion/negocio` ya no lo expone en runtime.
- **Tests:** `tests/product-validation.test.ts` sin los 2 casos de imagen (→ 17) y `tests/snapshots.test.ts` con fixtures/asserts sin `usarImagenesProductos`.

---

## 6. Extensión — Configuración personalizable, Boutique, Admin Override y anulación de caja ✅

### 6.1 Configuración Personalizable (Fase B/C)
- **Schema/FASE A (aplicado):** tres columnas nuevas en `ConfiguracionNegocio` — `usarCaducidad Boolean @default(false)`, `usarUbicaciones Boolean @default(true)`, `requerirFondoInicial Boolean @default(true)` — más `Producto.fechaCaducidad DateTime?` (FASE A previa). `prisma db push` confirmado por el cliente.
- **Pipeline backend:** `lib/business-types.ts` (tipo `BusinessConfig`, `DEFAULT_USAR_CADUCIDAD/USAR_UBICACIONES/REQUERIR_FONDO_INICIAL`), `lib/feature-flags.ts` (`getBusinessConfig()` los mapea con fallbacks), `lib/validate-config.ts` (los tres booleans con `.default()` dentro del `.strict()`), `app/api/configuracion/negocio` (PUT) y `app/api/setup` (POST) los persisten, y `lib/snapshots.ts` los captura/restaura en `buildResetJson`/`restoreFromSnapshot`.
- **UI (Configuración → Punto de Venta):** bloque *"Preferencias del negocio (Configuración personalizable)"* con tres toggles descriptivos; `normalizeConfig` y el payload del PUT los cargan/guardan; `facturacion/page.tsx` normaliza también los tres flags.
- **Caja:** `app/api/caja/abrir` lee `requerirFondoInicial` — si el negocio lo exige y el body no trae `fondoInicial` válido responde **400**; si no lo exige, tolera su ausencia y arranca con $0. La página de Caja adapta el hint del fondo, los `disabled` del botón y el payload.
- **Inventario:** columna **Caducidad** (con badge rojo "vencido") y **Ubicación** condicionales en la tabla según los flags; `product-form.tsx` muestra el input `type="date"` de caducidad solo con `usarCaducidad` y oculta "Ubicación" sin `usarUbicaciones`; `lib/validate-product.ts`, `/api/productos`, `/api/productos/[codigo]` y la **carga masiva Excel** (`/api/inventario/carga-masiva`, columnas *caducidad/vencimiento*) aceptan y persisten `fechaCaducidad`.
- **Presets por giro:** cada preset (incluida **BOUTIQUE**) define sus defaults: ABARROTES y FARMACIA activan caducidad/ubicación; SERVICIOS apaga la ubicación; PAPELERIA/FERRETERIA/MIXTO/BOTIQUE solo ubicación. `setup-wizard.tsx` envía los flags del preset al terminar (`COMPLETAR`).

### 6.2 Preset Boutique (enum nuevo)
- `BOUTIQUE` se agrega al enum `TipoNegocio` (`packages/database/prisma/schema.prisma`), con `prisma validate` ✅ y `prisma db push` ejecutado por el cliente.
- `lib/business-types.ts`: `TIPO_NEGOCIO` con "Boutique" + preset (inventario/facturación/dashboard/proveedores/bitácora activos, los 4 métodos de pago, `politicaStockOffline: PERMITIR_NEGATIVO`, caducidad OFF, ubicación ON). `setup-wizard.tsx` lo muestra con ícono `Sparkles`; `validate-config` lo acepta automáticamente vía `z.enum(Object.keys(TIPO_NEGOCIO))`.

### 6.3 Admin Override (FASE B)
- `lib/auth.ts` y `store/auth.ts`: `hasPermission()` retorna `true` de inmediato para `rol === "ADMINISTRADORA"` (los flags granulares siguen gobernando a CAJERA/otros roles).
- `components/configuracion/user-management.tsx`: los checkboxes de permisos quedan **bloqueados y forzados a activos** para el rol ADMINISTRADORA (en `PermisosModal` y `NuevoUsuarioModal`), el badge muestra "3" con la leyenda de acceso total y el botón Guardar se oculta para ese rol.

### 6.4 Animaciones UX (FASE B)
- **Login** (`app/(auth)/login/page.tsx`): `stagger` de conteiner y de campos, dots animados de carga y `disabled` de inputs mientras `isLoading`.
- **Dashboard** (`components/layout/dashboard-layout.tsx`): transición de ruta con `AnimatePresence mode="wait"` + `motion.div` keyed por `pathname` (fade 0.18 s).

### 6.5 Multiedición con monto fijo en $ (FASE C)
- `lib/bulk-ops.ts`: `TipoAjuste` (`PORCENTAJE | MONTO_FIJO`), `AplicarAjusteMontoFijo` (clamp ≥ 0), `normalizarSpec`/`validarSpec` (`AJUSTE_MONTO_MAX = 999999`) y `calcularAjustePrecios` que acepta `number` (retrocompatible) u `{ tipo, valor }`, conservando la invariante *precio ≥ costo* y la lista de omitidos.
- `app/api/productos/bulk/route.ts` acepta `tipo` + `valor` y registra en bitácora el ajuste con etiqueta diferente para $; `inventario/page.tsx` integra un control segmentado **Porcentaje | Monto fijo** con placeholder/min dinámicos y mensajes por tipo.

### 6.6 Anulación de Sesión de Caja (FASE C)
- **API** `app/api/caja/anular/route.ts` (nueva, solo ADMINISTRADORA): body `{ idCaja, motivo ≥ 4 }`. Solo anula sesiones **CERRADA** (404/409); transacción que marca `estado = ANULADA` + `motivoAnulacion` + `horaCierre` y registra bitácora `CAJA`.
- **Historial** (`app/api/caja/historial/route.ts`): filtra `estado IN [CERRADA, ANULADA]` y expone `folioCaja`, `estado`, `anulada` y `motivoAnulacion`; la UI (`components/caja/historial.tsx`) muestra badge **"Anulada"**, el motivo y el botón *Anular* con modal de confirmación (solo admin, sesiones no anuladas).
- **Exclusión de ingresos:** `app/api/dashboard/route.ts` y `lib/reports.ts` (`cajasAnuladas()`/`excluirAnuladas()`) excluyen ventas/líneas de sesiones ANULADA en *ventas*, *ventas-por-producto* y *top-más-vendidos*.

---

## 7. Tests Vitest ✅ (77/77)

| Archivo | Cubre |
|---|---|
| `bulk-ops.test.ts` (NUEVO) | C1: ajuste +20%/+10%/−15%, producto bajo costo → omitido, código inválido, el caso límite "precio queda IGUAL al costo" se aplica, baja lógica |
| `services.test.ts` (NUEVO) | C2: venta de servicio **sin decrement de stock ni Kardex**; granel 1.5 descuenta y traza Kardex decimal; fracción en unidad entera → 400 |
| `product-validation.test.ts` (ajustado) | Normalización con stock `Decimal`: 1.5 válido, 1.0005 inválido, unidades enteras |
| `returns.test.ts` (ajustado) | Caserío: `producto.findMany` con `esServicio` para no reingresar stock de servicios |
| `sales.test.ts`, `cash.test.ts`, `abonos.test.ts`, `snapshots.test.ts` | Regresiones (venta, caja, abonos CRM, snapshots v9) |

Comandos: `npx vitest run` en `apps/web`.

**Extensión — casos nuevos (9 más, total 77):** `bulk-ops.test.ts` gana `aplicarAjusteMontoFijo` y `calcularAjustePrecios` en modo monto fijo (incremento, descuento con invariante y clamp ≥ 0, "sin cambio", fuera de rango, tipo inválido, retrocompat); `product-validation.test.ts` valida `fechaCaducidad` (fecha válida, fecha imposible, vacío/null, PATCH parcial); `snapshots.test.ts` verifica los defaults de los 3 flags en `buildResetJson`.

---

## 8. Verificación

- `npm run typecheck` ✅ 0 errores en `apps/web` (tras corregir: valores `Decimal` vs `number` en dashboard/reportes/ventas/sync/kardex y la firma de `calcularDevuelto` que acepta `number | Decimal`; rutas nuevas de apartados y bitácora).
- `npx vitest run` ✅ **77/77** (8 archivos, <1 s) — incluye los casos nuevos de monto fijo, caducidad y flags de snapshots.
- `npm run lint` ✅ (2 warnings de `useCallback`/`processFile` preexistentes en inventario; sin errores nuevos).
- `npm run build` ✅ **Compiled successfully** (páginas + rutas de API, incluidas las nuevas `/api/apartados`, `/api/bitacora/purgar` y `/api/caja/anular`).
- **BD:** `db push` + `prisma generate` (v5.22.0) desde `packages/database`; los dos modelos de apartados y las columnas Decimal se aplican sin migración destructiva de datos previos. El `db push` de la purga de imágenes (drop de `imagenMime`, `imagenBase64`, `usarImagenesProductos`) se **ejecutó** con `--accept-data-loss` y el cliente se regeneró después. **Extensión:** `prisma validate` con el enum `BOUTIQUE` ✅ y `prisma db push` ejecutado por el cliente (FASE A de la extensión).
- **Runtime (localhost, admin/admin123):** login 200 + `canPurge`; `GET /api/auth/me` 200; `/api/apartados` 200; rutas nuevas sin sesión → 401; `/api/configuracion/negocio` ya **no** incluye `usarImagenesProductos` y ahora **sí** incluye `usarCaducidad`/`usarUbicaciones`/`requerirFondoInicial`; `/configuracion`, `/reportes`, `/inventario`, `/cobro`, `/facturacion`, `/caja` → 200; `/api/productos` expone `fechaCaducidad`; `/api/caja/abrir` sin fondo → **400** ("El negocio exige un fondo inicial válido") y con `fondoInicial: 100` → 200 (sesión `CAJA-001` abierta y cerrada de nuevo en la prueba, dejando estado limpio).

---

## 9. Cómo probarlo manualmente

1. **Granel:** producto con `permiteDecimales` en Inventario → en Cobro capturar `1.5` → ticket/monto con fracción; intentar `1.0005` → rechazo.
2. **Servicio:** producto marcado `esServicio` → venderlo con stock `0` → la venta pasa y el Kardex NO registra movimiento de ese código.
3. **Multiedición de precios:** Inventario → seleccionar varios → `Ajustar precio +10%` → los que quedarían bajo costo figuran en *Omitidos* con motivo; Bitácora registra aplicados/omitidos.
4. **Baja masiva:** seleccionar y `Borrar` → confirmar con "borrar" → el producto no aparece en catálogo pero su histórico se conserva.
5. **Apartados:** en Cobro armar carrito → `Crear apartado` → anticipo 50% con método → el stock baja y el anticipo alimenta la caja; `Configuración → (Apartados)` lista con estado `PENDIENTE`.
6. **Purga de bitácora:** con una **administradora con los 3 permisos** (o raíz) → Bitácora → `Purgar registros antiguos` → contraseña + 6 meses → se descarga el respaldo JSON y se eliminan registros; queda el log `SEGURIDAD`. Con una **cajera** el botón no aparece.
7. **Mi Cuenta:** Configuración → **Mi Cuenta** → cambiar contraseña (falta escribir la actual); reingresar con la nueva.
8. **Permisos en modal:** Gestión de Usuarios → "Permisos (n/3)" abre el modal → desmarcar *Inventario* y guardar → recargar con esa cuenta pierde Inventario en el Sidebar.
9. **Excel con alineación:** Reportes → exportar *Inventario* o *Kardex* → abrir en Excel: columnas de $ y cantidad alineadas a la derecha.
10. **Vista previa en modal:** Reportes → *Cierre de Caja* → **Vista previa** → se abre el modal con la tabla (no hace scroll); cerrar con la X o clic fuera.
11. **Sin imágenes:** Configuración → Punto de Venta ya no tiene el toggle *Mostrar imágenes*; Inventario → alta/edición y Edición rápida no muestran columna de imagen; el catálogo del Cobro usa tarjetas con ícono.
12. **Ancho de ticket:** Configuración → Punto de Venta → el selector muestra **Térmica 58 mm (mini)** y **Térmica 80 mm (estándar)** como opciones distintas.
13. **Configuración personalizable:** Configuración → Punto de Venta → *Preferencias del negocio*: activar/desactivar Caducidad, Ubicaciones y Fondo inicial → Guardar → Inventario muestra/oculta las columnas y el formulario de producto; Caja exige o tolera el fondo.
14. **Caducidad:** con `usarCaducidad` activo, en Inventario un producto vencido muestra la fecha en rojo; añadir `Fecha de caducidad` al alta/edición (input `date`) y desde el Excel con columnas *caducidad/vencimiento*.
15. **Fondo inicial opcional:** desactivar `requerirFondoInicial` → Abrir Caja sin escribir fondo (arranca con $0); reactivarlo → el botón vuelve a exigir fondo y el API responde 400 sin fondo.
16. **Anular sesión de caja:** Caja → Historial → (sesión CERRADA) → **Anular** con motivo → aparece badge *Anulada*; Dashboard y Reportes (Ventas/Ventas por producto/Top) ya **no** cuentan sus ingresos.
17. **Multiedición en $:** Inventario → seleccionar productos → *Ajustar precio* → pestaña **Monto fijo**, p. ej. +15 o −10 → los que quedarían bajo costo figuran en *Omítidos*; Bitácora registra el ajuste con etiqueta en $.
18. **Admin Override:** Gestión de Usuarios → rol ADMINISTRADORA → los permisos se ven forzados/activados y el botón Guardar no aparece; una cuenta admin accede a todo aunque un flag aparezca apagado (en cambio, CAJERA sí respeta los flags).
19. **Boutique:** Setup → el tipo *Boutique* (ícono Sparkles) precarga su preset (inventario, facturación, 4 métodos de pago, política de stock negativo) y los flags de Ubicación/Caducidad correspondientes.
20. **Animaciones:** Login con stagger y dots de carga; la navegación del dashboard difumina entre páginas (fade de ruta).

---

## 10. Notas para la siguiente iteración

- **Liquidación de apartados:** el estado `LIQUIDADO` y el cobro del saldo (módulo) está previsto en schema y GET, pero el flujo de liquidación/`fechaLiquidacion` (y el plan de cobro del saldo en la caja) es candidato natural de la iteración 11.
- El reabastecimiento automático sugerido por `stockMinimo` seguiría las alertas ya existentes del Dashboard (hoy solo advierte en pantalla).
- El catálogo por giro (FERRETERIA/FARMACIA) aún depende del seed; decidir si el seed de ejemplo crea categorías/servicios/granel.
- HTTPS deja de ser pendiente: se documentó en v9 como única vía a `trust=VERIFICADA` en LAN; no fue incluido en esta iteración.