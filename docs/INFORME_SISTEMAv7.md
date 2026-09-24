# Informe Técnico del Sistema de Gestión para Papelería — v7

**Versión evaluada:** Iteración 7 (Fase 3 de evolución SaaS: Kardex inmutable y trazabilidad · CRM con Crédito de Tienda, puntos de fidelidad y abonos · Multi-caja con retiros parciales de efectivo)
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5 + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Recharts · ExcelJS · Tailwind · Vitest · Playwright · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv6.md`. La iteración 6 blindó la operación financiera (transferencias con referencia, historial de cortes, marca blanca); la 7 **hace el inventario auditable y el negocio vende a crédito con control**: todo movimiento de stock queda en un kardex inmutable con signo, los clientes operan con deuda y puntos de fidelidad, los abonos entran a caja registrándose como recaudación en efectivo, y la administradora puede retirar efectivo de una sesión abierta sin romper el corte ciego.

---

## 1. Resumen ejecutivo

La Fase 3 abordó cuatro frentes:

- **M1 — Kardex inmutable y trazabilidad:** toda variación de stock pasa por la MISMA transacción que actualiza `stockActual`, persistiendo `MovimientoKardex` con **`cantidadCambio` con signo** (`ENTRADA` +, `SALIDA` −, `AJUSTE` signo del delta). Así `stockActual = stockInicial + Σ cantidadesCambio` y el historial es irreproducible en historia. Se expone `GET /api/productos/[codigo]/kardex`, una cuarta pestaña **Historial** en Inventario y la hoja **"Kardex de movimientos"** en el export de inventario.
- **M2 — Crédito de Tienda + puntos:** nuevo `Venta.metodoPago = CREDITO_TIENDA`. El cobro a crédito exige un `Cliente`, **no toca la caja**, incrementa `Cliente.saldoDeudor` y otorga 1 punto por cada $100 de compra. Se añaden el API de clientes (`GET/POST`) y **abonos** (`POST /api/clientes/[id]/abonos`) que convierten el pago del cliente en efectivo de caja + reducción de deuda, todo con bitácora.
- **M3 — Retiros parciales de caja (solo admin):** `RetiroEfectivo` + `POST /api/caja/retiros`. La admin retira efectivo de una sesión `ABIERTA` con tope = disponible real (`fondo + ventas − egresos − retiros previos`). El corte ciego **resta los retiros** del esperado (no marcan descuadre) y quedan auditablemente **línea por línea** en el ticket de cierre y en el historial/reimpresión.
- **M4 — Calidad y seguridad (Red Team):** validación estricta **Zod** en todas las rutas nuevas (montos finitos/positivos con tope, referencias, UUIDs), ejecución **transaccional** (caja + cliente + kardex + bitácora en un solo `$transaction`), gate de rol para retiros (`ADMINISTRADORA`), rechazo de ventas a crédito en el flujo **offline** (requiere conexión) y 52/52 pruebas en Vitest.

**Estado de verificación:** `lint` ✅ (2 warnings preexistentes en inventario) · `typecheck` ✅ · `npm test` ✅ **52/52** · `npm run build` ✅ (40 páginas + **40** rutas de API, incluidas las nuevas `clientes`, `clientes/[id]/abonos`, `caja/retiros`, `productos/[codigo]/kardex`).

---

## 2. M1 — Kardex inmutable y trazabilidad ✅

### 2.1 Esquema de datos
- `MovimientoKardex`: `id`, `codigoItem`, `cantidadCambio Int` **(con signo)**, `tipo` (`ENTRADA|SALIDA|AJUSTE`), `motivo String?`, `fecha`, `idUsuario`; índices `@@index([codigoItem, fecha])` y `@@index([fecha])` para el historial por producto y general. Relación con `Producto` y `Usuario`.
- **Constraint de ejecución respetado:** primero **solo** `schema.prisma` (supporta también `Usuario.isRoot` y las tablas de M2/M3), se validó (`prisma validate` + `prisma format`), y se pidió al usuario ejecutar `npx prisma db push`; confirmado.

### 2.2 Núcleo (`lib/kardex.ts`)
- `registrarMovimientosKardex(tx, movimientos)` — inserta movimientos **dentro de la transacción del caller**; deriva el signo: `ENTRADA → +cantidad`, `SALIDA → −cantidad`, `AJUSTE → Math.sign(cantidad)` (el caller pasa el delta ya con signo). No hace *reads* extra; es barato y atómico.
- `stockDerivadoDelKardex(movimientos, stockInicial)` — función pura/idempotente para auditoría: reconstruye el stock solo desde el kardex.

### 2.3 Integración transaccional
- **`lib/sales.ts` (`executeSale`):** por cada línea → `tx.movimientoKardex.createMany` con `SALIDA −cantidad`, motivo `Venta {folioVenta}` — dentro del mismo `$transaction` que hace `producto.update`.
- **`lib/returns.ts` (`executeReturn`):** por cada línea → `ENTRADA +cantidad`, motivo `Devolución/Nota de crédito {folioDevolucion}`.
- **`POST /api/ventas/sync` (replay offline):** cada venta sincronizada genera `SALIDA` con motivo `Venta offline {folio}`. Las ventas a **crédito se rechazan offline** de forma deliberada (ver §7).

### 2.4 API y UI
- **`GET /api/productos/[codigo]/kardex`** (`force-dynamic`): historial con `?limite=1..500` (default 100), incluye `usuario.nombre`, devuelve cada movimiento con su `cantidadCambio` con signo.
- **Inventario → pestaña "Historial"** (`components/inventario/kardex-historial.tsx`): buscador de producto + tabla de movimientos (fecha, tipo con icono, motivo, cantidad firmada, quién). Tab array ampliado a 4 en `app/(dashboard)/inventario/page.tsx`.
- **Export Excel:** `lib/export-exceljs.ts` acepta `extraSheets` (misma plantilla estilizada) y `GET /api/reportes` con `tipo=inventario` adosa la hoja **"Kardex de movimientos"** con los últimos 3.000 movimientos (producto + usuario).

---

## 3. M2 — CRÉDITO de Tienda, clientes y abonos a caja ✅

### 3.1 Esquema de datos
- `Cliente`: `idCliente` (uuid), `nombre`, `telefono?`, `saldoDeudor Decimal(10,2)` (default 0), `puntosFidelidad Int` (default 0), timestamps. `Venta` gana `idCliente?`.

### 3.2 Núcleo de venta (`lib/sales.ts`)
- `METODOS_PAGO` incorpora **`CREDITO_TIENDA`**; el servidor exige `idCliente` si el método es crédito y que el `Cliente` exista (`_CLIENTE_NO_EXISTE`, 400/404).
- Rama financiera de crédito: **no** toca `sesionCaja`; `cliente.saldoDeudor = { increment: totalNeto }`; `puntosFidelidad = { increment: Math.floor(totalNeto / 100) }` (`PESOS_POR_PUNTO = 100` → 1 punto por cada $100). `venta.create` incluye `idCliente`.
- Se propaga por `POST /api/ventas` (`MAPA_METODO` resuelve `CREDITO_TIENDA`) y `store/cart.ts` (+ `setCliente`/`nombreCliente`; `clearCart` los limpia).

### 3.3 API
- **`GET /api/clientes`** — listado/búsqueda con `?q` (nombre) y `?soloConDeuda`; devuelve `saldoDeudor` y `puntosFidelidad`. **`POST /api/clientes`** — alta rápida (Zod estricto: nombre 2–80, teléfono ≤20) + bitácora en módulo `CAJA`.
- **`POST /api/clientes/[id]/abonos`** — el cliente abona a su deuda **en caja abierta**: transacción que (1) valida caja `ABIERTA` (explícita o la última), (2) exige que el abono sea `> 0` y `≤ saldoDeudor` (`_ABONO_EXCEDE` 400, tolerancia 1 centavo), (3) `sesionCaja.totalVentasEfectivo += monto` (el dinero físico entra a caja como recaudación en efectivo y cuenta en el corte), (4) `cliente.saldoDeudor = max(deuda − monto, 0)`, (5) bitácora.

### 3.4 POS
- **`components/pos/cart-panel.tsx`:** el grid pasa a 4 métodos e incluye **Crédito** (ámbar). Al elegir Crédito (o al pulsar *Cobrar* con crédito sin cliente) se abre `components/pos/client-select.tsx` (búsqueda + alta rápida). Se muestra un chip con el cliente asignado; cambiar de método limpia la selección.
- **Offline bloqueado:** `lib/sales-client.ts` lanza error y **no encola** ventas a crédito ("requiere conexión"); `lib/offline/conflict.ts` no lista `CREDITO_TIENDA` en `metodoPagoValido`, así el sync tampoco las acepta.

### 3.5 Caja
- **`components/caja/abono-retiro.tsx`** (`AccionesSesion`): botones **Abono de cliente** (modal con búsqueda `soloConDeuda`, monto, POST a `[id]/abonos` y refresco de la sesión) y **Retiro de efectivo** (solo visible para `ADMINISTRADORA`). Integrado en `app/(dashboard)/caja/page.tsx`, que ahora expone `esAdmin` y `refrescarSesion`.

---

## 4. M3 — Retiros parciales de efectivo (multi-caja) ✅

### 4.1 Núcleo (`lib/cash.ts`)
- `ArqueoInput.retirosEfectivo?`; `esperadoEfectivo = round2(fondo + ventasEfectivo − egresos − retiros)`. El retiro **no** marca faltante porque el efectivo salió con autorización de la admin; el corte lo acredita.

### 4.2 API
- **`POST /api/caja/retiros`** (nuevo, **solo `ADMINISTRADORA`**): Zod estricto `{ monto, idCaja?, motivo(2–120) }`. En transacción: caja explícita o última `ABIERTA`; recalcula disponible `= fondo + ventasEfectivo − egresos − Σ retiros previos`; si `monto > disponible` → `_RETIRO_EXCEDE` (400, tolerancia 1 centavo); crea `RetiroEfectivo` (`idCaja`, `idAdmin`, `monto`, `motivo`) + bitácora. Errores tipificados: `_NO_CAJA` 404 · `_CAJA_NO_ABIERTA` 409.
- **`POST /api/caja/cerrar`**, **`GET /api/caja/historial`** y **`GET /api/caja/estado`**: agregan/restan `retiroEfectivo` por sesión y lo exponen (`totalRetiros`, `numRetiros`, y en historial además `retiros[]` con `monto/motivo/fechaHora`).

### 4.3 UI
- **Sesión actual:** bloque de totales muestra *Retiros* y el efectivo en caja calculado como `max(fondo + ventas + recargas − retiros, 0)`.
- **Ticket de cierre y reimpresión** (`components/caja/historial.tsx`): listan los retiros **línea por línea** (`Retiro 1 (hora) −$X`) tanto en pantalla como en el ticket térmico reimpreso.

---

## 5. M4 — Calidad y seguridad (Red Team) ✅

### 5.1 Validaciones
- **Zod estricto** en `abonos`, `retiros` y `clientes` (`.strict()`, `finite()`, `positive()`, topes ≤ 999,999,999.99, UUIDs opcionales). `productos/[codigo]/kardex` valida `limite` 1–500.
- **Transaccionalidad:** abono, retiro, venta y devolución ensamblan caja + cliente + kardex + bitácora en un único `prisma.$transaction`; los topes (deuda, disponible) se calcular dentro de la misma transacción para evitar carreras del corte ciego (que ejecuta *agregación* de retiros visiblemente antes de cerrar).
- **Autorización:** retiros exigen rol `ADMINISTRADORA` vía `requireAuth`; la UI oculta el botón al resto.

### 5.2 Vitest (52/52)
- Actualización de mocks de `sales.test.ts` y `returns.test.ts` para cubrir `tx.movimientoKardex.createMany` y de `cash.test.ts` para `retiroEfectivo.aggregate` (nueva capa añadida en Fase 3). No se alteró el comportamiento cubierto por las 52 pruebas previas, que siguen verde.

---

## 6. Cómo probarlo manualmente

1. **Kardex:** vender/producir/devolver y revisar Inventario → *Historial* (por producto) y el Excel de inventario (hoja *Kardex de movimientos*); los `SALIDA` aparecen negativos y los `ENTRADA` positivos.
2. **Crédito:** en `/cobro` elegir **Crédito** → buscar o dar de alta un cliente → *Cobrar*. La venta no entra a caja; el `saldoDeudor` sube y el cliente gana 1 punto por cada $100.
3. **Abono:** en *Control de Caja* pulsar **Abono de cliente**, elegir un cliente con deuda, capturar monto. El efectivo incrementa `totalVentasEfectivo` (lo verás en el bloque de la sesión) y la deuda baja.
4. **Retiro:** con sesión `ABIERTA`, la admin pulsará **Retiro de efectivo** (motivo + monto ≤ disponible). Al cerrar, el corte no marca faltante y el ticket/historial muestran el retiro.
5. **Sincronización/offline:** una venta a crédito con red cortada se rechaza con mensaje claro y no entra a la cola offline.

---

## 7. Notas, decisiones y deuda

- **Crédito = siempre online:** decisión deliberada. La cola offline y el `sync` no soportan `CREDITO_TIENDA` (evita deudas duplicadas o inventario fuera de línea sin validación de cliente). El POS lo comunica al cajero para no bloquear el flujo tácitamente.
- **El abono cuenta como VENTA en efectivo:** el dinero del cliente entra vía `totalVentasEfectivo` (no como egreso ni como fondo), por lo que el corte ciego lo exige físicamente. Esto es lo que diferencia «cobro de vieja deuda» de un simple ajuste.
- **Retiro por corte ciego:** el esperado resta retiros para un conteo físico coherente; la auditoría queda en `RetiroEfectivo` y en la bitácora *no en el descuadre*, que continúa siendo la métrica de integridad del cajero.
- **Deuda de refactor:** `MovimientoKardex.cantidadCambio` persiste como `Int` con signo y el signo se deriva del `tipo`; un `AJUSTE` requiere que el caller pase el delta ya firmado (documentado en `lib/kardex.ts`). Si más adelante se necesitan movimientos fraccionarios habría que migrar a `Decimal`.
- **Deuda local:** la pestaña *Historial* de inventario no pagina; el endpoint limita a 500 movimientos por consulta (suficiente para el giro).
- **Deuda de testing:** los casos Red Team (abono que excede deuda, retiro que excede disponible, crédito offline rechazado, kardex con `AJUSTE` firmado) están verificados por el código; conviene elevar algunos a pruebas Vitest dedicadas en la siguiente iteración.