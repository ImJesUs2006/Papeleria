# Informe Técnico del Sistema de Gestión para Papelería — v2

**Versión evaluada:** Iteración 2 (núcleo transaccional · inventario avanzado · logística · dashboard · pruebas)
**Fecha:** Septiembre 2026
**Stack:** Next.js 14 (App Router) · Prisma + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Tailwind · Recharts · jsbarcode · QRCode.react · SheetJS · Vitest

> Complementa y actualiza `INFORME_SISTEMAv1.md`. Antes, la columna vertebral faltante era **persistir la venta**; en esta iteración se implementa el núcleo transaccional completo, la logística de proveedores y el marco de pruebas.

---

## 1. Resumen ejecutivo

El SaaS de la papelería pasó de una fase "solo UI" a una **fase operativa**: el carrito del POS ahora ejecuta ventas reales (`Venta` + `LineaDetalleVenta`) dentro de una **transacción Prisma** que descuenta stock, acumula flujos financieros por método de pago en la sesión de caja activa y registra en bitácora. La caja ganó **cierre con arqueo matemáticamente validado** (tolerancia de 1 centavo, sin falsos descuadres por punto flotante). El inventario sumó **etiquetas con código de barras CODE128 + QR imprimibles** y **edición rápida estilo hoja de cálculo** con autosave. Se incorporó la **cadena de suministro** (proveedores con crédito + pedidos con calendario de entregas), un **dashboard** con métricas en Recharts y una **suite de 11 pruebas automatizadas** con Vitest.

---

## 2. Nuevos módulos de esta iteración

### 2.1 Núcleo transaccional de ventas — ✅ Funcional
- `apps/web/lib/sales.ts` — **`executeSale(tx, input, ctx)`**: función pura sobre `Prisma.TransactionClient` que valida producto activo y stock, genera folio `F-YYYYMMDD-XXXX`, calcula subtotal/IVA 16%/total, inserta `Venta`, satisface las `LineaDetalleVenta` con precios **congelados**, descuenta inventario con `decrement: n` y asigna el ingreso a la caja:
  - pais y `tipoVenta === RECARGA` → `totalRecargas`
  - `metodoPago === EFECTIVO` → `totalVentasEfectivo`
  - resto (tarjeta/digital) → `totalVentasDigital`
- `POST /api/ventas` — orquesta con `prisma.$transaction(executeSale)`. Sin caja abierta, la venta se registra igual con `idCaja: null` (no bloquea el negocio). Errores de dominio → HTTP 400 (stock insuficiente) / 404 (producto inexistente); sin auth → 401.
- `apps/web/components/pos/cart-panel.tsx` — botón **Cobrar** conectado: muestra monto recibido y cambio, modal de éxito con folio, limpia el carrito y maneja errores de stock.

### 2.2 Cierre de caja con arqueo exacto — ✅ Funcional
- `apps/web/lib/cash.ts` — **`calcularArqueo()`** (función pura, testeable): cruza declarado vs esperado. `EsperadoEfectivo = fondoInicial + ventasEfectivoPapelería`; `descuadre` solo si `|diferencia| > 0.01`.
- `POST /api/caja/cerrar` — ejecuta el arqueo, cierra la sesión (`estado: CERRADA`, hora y notas) y archiva en bitácora con `jsonPayload` del arqueo.
- **Bug corregido gracias a las pruebas:** `round2` usaba `Math.round`, que redondea semipuntos negativos hacia +∞ (`-0.005 → -0`). Se reemplazó por truncamiento simétrico; hoy `round2(-0.005) = -0.01`.

### 2.3 Inventario avanzado
- `PATCH /api/productos/[codigo]` — edición de descripción, precio, stock, stock mínimo, ubicación, proveedor y `codigoBarras`, con bitácora.
- `components/inventario/label-modal.tsx` — etiqueta térmica con **CODE128 (jsbarcode)** y **QR (qrcode.react)**; copia la imagen PNG al portapapeles y imprime con área CSS exclusiva (`@media print .print-label-area`).
- `components/inventario/quick-edit.tsx` — **hoja de edición rápida**: celda editable por columna con guardado automático en blur, estado "guardando/guardado/error" y etiqueta por fila.
- Página de inventario: nuevo tab **"Edición rápida"** y columna de etiqueta por producto.

### 2.4 Logística y cadena de suministro — ✅ Funcional
- Schema Proveedor: `limiteCredito` y `saldoCredito` (Decimal) para controlar compras a crédito.
- `api/proveedores` (GET/POST) y `api/proveedores/[id]` (PATCH/DELETE con **baja lógica** → `activo`) — solo ADMINISTRADORA, con bitácora.
- `api/pedidos` (GET/POST con items anidados) y `api/pedidos/[id]` (PATCH de estado: `PENDIENTE → EN_RUTA → ENTREGADO | CANCELADO`, fecha y notas).
- `app/(dashboard)/pedidos/page.tsx` — **calendario mensual de entregas** con semáforo (verde lejano / amarillo ≤3 días / rojo vencido / gris finalizado), vista de lista con acciones e **modal de creación** con buscador de productos y precios cotizados editables.

### 2.5 Dashboard — ✅ Funcional
- `GET /api/dashboard` (solo ADMINISTRADORA): resumen (total, tickets, ticket promedio, alertas), **ventas por hora** (24 buckets), **top 5 productos** (agrupado por `LineaDetalleVenta`) y **alertas de stock** (`stockActual ≤ stockMinimo`).
- `app/(dashboard)/dashboard/page.tsx` — tarjetas KPI animadas, gráfica de caja abierta, **BarChart de picos por horario**, **donut de inventario crítico** y **barras horizontales del top 5** (Recharts 3).

### 2.6 Suite de pruebas automatizadas — ✅ Funcional
- `vitest.config.ts` con alias `@`; script `npm test`.
- `tests/sales.test.ts` — **3 pruebas de integración** sobre `POST /api/ventas` con `@papeleria/database` y `@/lib/auth` mockeados: rechaza stock insuficiente (400, sin escrituras), registra venta exacta (`2×$12.50 → subtotal 25.00, IVA 4.00, total 29.00, cambio 21.00`), verifica decremento y asignación por método de pago/recarga.
- `tests/cash.test.ts` — **6 unitarias** de `calcularArqueo` (cuadrado exacto, faltante, sobrante, estabilidad de flotantes 0.1+0.2, tolerancia 1¢, `round2` negativo) y **2 de integración** de `POST /api/caja/cerrar` (arqueo en respuesta, rechazo de montos inválidos).
- Resultado: **11/11 pruebas pasando**.

### 2.7 Roles y navegación
- `lib/auth.ts`: nuevos permisos `dashboard.ver`, `proveedores.ver`, `pedidos.ver` (solo ADMINISTRADORA).
- `components/layout/sidebar.tsx`: secciones **Dashboard**, **Proveedores** y **Pedidos** agregadas, ocultas para CAJERA.

---

## 3. Historial de correcciones (Iteración 2)

| # | Problema | Corrección |
|---|---|---|
| 1 | `disabled:text-muted` rompía el build en `@apply` | `text-muted` nunca se generó: el color `muted #9ca3af` no existía en el tema de Tailwind pese a usarse masivamente. Se agregó a `tailwind.config.ts` → `/login` vuelve a compilar (200). |
| 2 | `round2` redondeaba mal los negativos | Truncamiento simétrico (ver 2.2); detectado por test. |
| 3 | TS2724: `useLabelModal` importado de `quick-edit` | Import correcto desde `label-modal.tsx`. |
| 4 | TS2322: `ArqueoResult` no asignable a `InputJsonValue` | `jsonPayload` serializado con `JSON.parse(JSON.stringify(...))`. |
| 5 | TS2322: `Record<string, any>` en create de proveedor | Input tipado con spread condicional de `limiteCredito`. |

---

## 4. Estado actual — checklist v2

| Módulo | Antes (v1) | Ahora (v2) |
|---|---|---|
| Login + JWT + RBAC + sidebar por rol | ✅ | ✅ + nuevos permisos |
| POS: escaneo + modal táctil + carrito → **venta real** | solo UI | ✅ transacción completa |
| Caja: apertura + ingresos separados → **cierre con arqueo** | solo UI | ✅ endpoint + arqueo validado |
| Inventario: filtros + carga Excel → **etiquetas + edición rápida** | ✅ | ✅ + |
| Proveedores / Pedidos | ❌ sin UI | ✅ CRUD + calendario |
| Dashboard con métricas | ❌ | ✅ Recharts |
| Reportes Excel (7 tipos) | ✅ | ✅ |
| Bitácora + export | ✅ | ✅ |
| Configuración de usuarios/roles | ❌ | ❌ pendiente |
| Pruebas automatizadas | ❌ | ✅ 11 tests |

---

## 5. Cómo levantar y verificar

> Guía paso a paso para una instalación desde cero: **[`docs/GUIA_INSTALACION.md`](GUIA_INSTALACION.md)**.

```powershell
docker compose up -d
cd packages/database; npx prisma db push; npx prisma db seed
cd apps/web; npm run dev        # http://localhost:3000
npm test                        # 11 pruebas Vitest
```

Credenciales: **admin / admin123** (ADMINISTRADORA) · **cajera1 / cajera123** (CAJERA).

---

## 6. Siguientes pasos priorizados

1. 🔴 **Página de Configuración** (gestión de usuarios/roles; el enlace ya existe en el sidebar).
2. 🟠 **Abonos a proveedores**: al recibir/`ENTREGADO`, aplicar `totalEstimado` a `saldoCredito` y emitir asientos.
3. 🟠 **Devoluciones/notas de crédito** en POS (revertir stock y flujo de caja transaccionalmente).
4. 🟡 E2E con Playwright del flujo de cobro + CI (lint/typecheck/test/build).
5. 🟡 Búsqueda exacta por `codigoBarras` antes de la búsqueda abierta en el escaneo.