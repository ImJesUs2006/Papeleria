# Informe Técnico del Sistema de Gestión para Papelería — v6

**Versión evaluada:** Iteración 6 (Fase 2 de evolución SaaS: Blindaje Financiero en el punto de venta · Historial y reimpresión de cortes de caja · Reportes dinámicos con la identidad del negocio)
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5 + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Recharts · ExcelJS · Tailwind · Vitest · Playwright · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv5.md`. La iteración 5 cerró resiliencia (snapshots), marca blanca y el grid táctil del POS; la 6 **blinda la operación financiera**: cada cobro por transferencia queda respaldado por una referencia de pago verificable, los cortes de caja cerrados quedan auditablemente disponibles con reimpresión de su ticket térmico, y los reportes y el dashboard se «visten» con la identidad (color de marca) del negocio.

---

## 1. Resumen ejecutivo

La Fase 2 abordó cuatro frentes:

- **M1 — Blindaje Financiero (transferencias):** se reemplaza el pago *Digital* genérico por **Transferencia**. `ConfiguracionNegocio` gana `datosBancarios` (banco/titular/CLABE) que el POS muestra en un modal, y el cobro por transferencia **exige los últimos 4 dígitos de la referencia/rastreo**, que se persisten en `Venta.referenciaTransferencia` (online y offline).
- **M2 — Historial de Caja:** nuevo `GET /api/caja/historial` con las últimas 50 sesiones **CERRADAS**, pestaña **Historial de sesiones** en Control de Caja (fecha/hora de cierre, cajero, declarado vs. esperado por flujo, descuadre resaltado) y botón **Reimprimir** del ticket térmico del corte.
- **M3 — Reportes Dinámicos (identidad):** el export Excel ahora usa el `temaColor` del negocio en el encabezado y aplica **formato condicional rojo** cuando `stockActual ≤ stockMinimo`; el dashboard reemplaza colores sólidos de Recharts por **`linearGradient` derivado de `var(--marca-color)`**.
- **M4 — Calidad:** 2 pruebas nuevas en Vitest (referencia exigida y transferencia registrada) y actualización de los mocks de `VentaOffline` para el flujo offline. Todo el pipeline queda verde.

**Estado de verificación:** `lint` ✅ (2 warnings preexistentes en inventario) · `typecheck` ✅ · `npm test` ✅ **52/52** · `npm run build` ✅ (40 páginas + **27** API routes, incluidas `caja/historial`).

---

## 2. M1 — Blindaje Financiero: transferencias con referencia ✅

### 2.1 Esquema de datos
- `ConfiguracionNegocio` gana `datosBancarios Json?` — `{ banco, titular, clabe, cuenta }` del negocio para cobros por transferencia.
- `Venta` gana `referenciaTransferencia String? @db.Text` — últimos 4 dígitos de la referencia/rastreo.
- **Constraint de ejecución respetado:** primero se modificó **solo** `schema.prisma`, se validó (`prisma format` + `prisma validate`), y se pidió al usuario ejecutar `npx prisma db push` antes de tocar lógica o frontend. Confirmado por el usuario.

### 2.2 Núcleo transaccional (`lib/sales.ts`)
- `METODOS_PAGO` incorpora `TRANSFERENCIA` junto a `DIGITAL` (el cliente sigue enviando `DIGITAL`; el servidor lo trata como transferencia).
- En `executeSale`, cuando el método es `DIGITAL`/`TRANSFERENCIA` se **exige** `referenciaTransferencia` con forma `/^\d{4}$/` (últimos 4 dígitos); sin ella → `SaleError` 400. La referencia se persiste en `Venta.referenciaTransferencia` y queda en el `jsonPayload` de la bitácora.

### 2.3 HTTP
- `POST /api/ventas` — pasa `body.referenciaTransferencia` a `executeSale` (y el `MAPA_METODO` ya resuelve `DIGITAL → TRANSFERENCIA` para validar contra `config.metodosPago`).
- `POST /api/ventas/sync` (replay offline) — valida la misma regla de 4 dígitos y persiste `referenciaTransferencia` para ventas sincronizadas; si falta, la venta se **rechaza** (respuesta con `error`).
- `lib/offline/idb.ts` (`VentaOffline`) y `lib/sales-client.ts` propagan el campo en la cola offline.

### 2.4 POS (`components/pos/cart-panel.tsx` + `store/cart.ts`)
- El botón *Digital* pasa a llamarse **Transferencia** (acento `neon-purple`). Al pulsarlo se abre un **modal** que:
  - muestra los `datosBancarios` del negocio (banco, titular, CLABE, cuenta) o un aviso si no están registrados;
  - pide los **últimos 4 dígitos** de la referencia/rastreo con un input numérico de 4 caracteres, `autoFocus` y botón habilitado solo cuando `/^\d{4}$/`.
- `store/cart.ts` gana `referenciaTransferencia` (+ `setReferenciaTransferencia`); `clearCart` y el cambio de método la limpian. El **Cobrar** principal de una transferencia sin referencia vuelve a abrir el modal (bloqueo de «adelantar» un pago no verificado).

### 2.5 Gestión administrativa
- `Configuración → Blindaje financiero · Cuenta para transferencias`: campos banco/titular/CLABE/cuenta, validados con Zod (`lib/validate-config.ts`) y persistidos por `PUT /api/configuracion/negocio` (`Prisma.DbNull` cuando se limpian).
- `lib/feature-flags.ts` normaliza `datosBancarios` en `getBusinessConfig` (la firma HMAC de la config lo incluye, así conserva su verificación de integridad offline).
- `lib/snapshots.ts` captura y restaura `datosBancarios` en los snapshots de seguridad (fidelidad total del Factory Reset).

---

## 3. M2 — Historial y reimpresión de cortes de caja ✅

### 3.1 API
- `GET /api/caja/historial` (nuevo, `force-dynamic`): última 50 sesiones **CERRADAS** con `include` del cajero. Por cada una **recalcula el arqueo** con `lib/cash.ts` a partir de las cantidades persistidas en el cierre (contado vs. esperado por flujo + diferencia), de modo que el descuadre nunca depende de lo que el cliente envíe.

### 3.2 UI (`components/caja/historial.tsx` + `app/(dashboard)/caja/page.tsx`)
- Nueva pestaña **Historial de sesiones** (junto a *Sesión actual*). Cada tarjeta muestra: fecha/hora de cierre, **cajero**, cuadros por flujo (**Efectivo / Digital-Vouchers / Recargas** con *declarado* vs. *esperado* coloreado en rojo si hay diferencial), chip de estado (verde *cuadrada* / rojo *descuadre*) y la `notasCierre` cuando hubo desfase.
- **Reimprimir:** genera el ticket térmico (negocio + id de caja + cajero + fechas + esperado/contado + diferencia) en un área `print-label-area print-ticket-80` invisible en pantalla y dispara `window.print()`; por eso `globals.css` gana la clase `.print-block` (`display:block !important` bajo `@media print` para revelar contenedores ocultos) y la regla `.print-label-area` fuerza `display:block !important`.

---

## 4. M3 — Reportes y dashboard con identidad del negocio ✅

### 4.1 Excel dinámico (`lib/export-exceljs.ts` + `app/api/reportes/route.ts`)
- `buildStyledWorkbook` acepta **`conditionals?: { col, thresholdCol }[]`**: para cada fila, si `stockActual ≤ stockMinimo` la celda se pinta con fondo `FFFEE2E2` y texto rojo `FFB91C1C`.
- `GET /api/reportes` inyecta ahora `headerColor: config.temaColor` (en vez del `0F766E` fijo) y, para `tipo=inventario`, el condicional `{ col: 3, thresholdCol: 4 }` (Stock Actual vs. Stock Mínimo).

### 4.2 Dashboard (`app/(dashboard)/dashboard/page.tsx`)
- Los barras de *Picos de ventas por horario* y *Top 5 productos* usan `linearGradient` (SVG `defs`) con `stopColor="var(--marca-color)"` y opacidades de 0.9→0.3 (vertical) y 0.25→1 (horizontal), en lugar de los fills sólidos `#00d4ff` / `#00ff88`. El color sigue a la marca blanca en tiempo real (vía `BrandTheme`).

---

## 5. M4 — Calidad ✅

### 5.1 Vitest (`tests/sales.test.ts`)
2 pruebas nuevas (52 en total, todas verdes):
- **Exige la referencia:** `DIGITAL` sin `referenciaTransferencia` → 400 con error `/referencia/i` y **no** llama a `venta.create`.
- **Registra la transferencia:** `DIGITAL` + `"4821"` → `venta.create` con `metodoPago: "DIGITAL"` y `referenciaTransferencia: "4821"`; el ingreso se asigna a `totalVentasDigital`; la referencia queda en la bitácora.
- Se actualizó el tipo `VentaOffline` en `lib/offline/idb.ts` para el flujo offline (typecheck cubre el contrato).

### 5.2 Integración continua
`.github/workflows/ci.yml` sin cambios (ya corre `lint · typecheck · test · build`); las nuevas rutas (`caja/historial`) y la UI se compilan en el build.

---

## 6. Cómo probarlo manualmente

1. **Transferencia con referencia:** Configuración → *Blindaje financiero* → captura banco/CLABE → Guardar. En `/cobro`, pulsar **Transferencia** → el modal muestra la cuenta; escribir 4 dígitos → *Cobrar*. Sin 4 dígitos, el botón queda deshabilitado y el *Cobrar* principal vuelve a abrir el modal.
2. **Historial:** Cerrar una caja (corte ciego con conteo) y pasar a la pestaña *Historial de sesiones*: ver la sesión cerrada, su descuadre (si aplica) y **Reimprimir** — el ticket térmico sale por la impresora configurada.
3. **Excel con marca:** Reportes → *Inventario* → descargar; el encabezado usa el `temaColor` del negocio y las filas con `stockActual ≤ stockMinimo` aparecen en rojo.
4. **Dashboard:** `/dashboard` muestra los dos gráficos de barras con degradados del color de marca.
5. **Offline:** desconectar la red, cobrar por transferencia (referencia capturada), reconectar → `/api/ventas/sync` aplica la venta con su referencia o la rechaza si falta.

---

## 7. Notas, decisiones y deuda

- **Blindaje en profundidad:** la referencia se exige en **ambas** rutas (`POST /api/ventas` y `/sync`) y en el POS; ni siquiera una cajera con el store editado puede registrar una transferencia sin rastreo cuando hay conexión.
- **Fidelidad de snapshots:** `datosBancarios` entra en `SnapshotJson.configuracion` y se restaura, garantizando que un reinicio de fábrica no pierda la configuración de cobro.
- **Reimpresión vía `window.print()`:** reutiliza el mismo mecanismo que el corte ciego (área `print-label-area`), sin depender del navegador para recordar un ticket anterior.
- **Deuda local:** la cuenta bancaria debe capturarse una vez por negocio en Configuración; el modal del POS con *«negocio sin cuenta»* es solo contingencia.
- **Deuda de refactor:** el arqueo se recalcula en `historial` desde los totales persistidos; si más adelante se necesitan los valores esperados **exactos** del momento, basta persistir `calcularArqueo` al cierre (hoy se guardan `efectivoContado/vouchersContado/recargasContado` + `faltanteTotal`).