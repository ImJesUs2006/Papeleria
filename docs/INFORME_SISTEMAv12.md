# Informe del Sistema — Fase 12

**Proyecto:** Papelería (Punto de Venta / Inventario / Caja / Reportes)
**Fecha:** 2026-10-04
**Alcance:** Cierre de la Fase 12 — Monedero de Puntos, precios de mayoreo, imágenes de producto (Cloudinary), módulo de Clientes, Facturación estricta y filtros de Reportes.

---

## 1. Resumen ejecutivo

La Fase 12 quedó implementada y verificada de extremo a extremo. Se eliminó el «Crédito de tienda», se endurecieron las devoluciones, se mejoraron los flujos de clientes y facturación, y se añadió soporte de precios diferenciados e imágenes de producto sin romper los módulos previos (caja, inventario, reportes, impresión de tickets y validaciones SAT).

**Estado de verificación final**

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos | `cd apps/web; npx tsc --noEmit` | Sin errores |
| Pruebas | `cd apps/web; npx vitest run` | **161/161** en 14 archivos |
| Lint | `npx next lint` | Sin errores (2 avisos preexistentes en `inventario/page.tsx`) |
| Build | `npm run build` | Compilación exitosa, 60+ rutas |
| Smoke HTTP | Login + endpoints nuevos | `200` en todos |

---

## 2. Módulos entregados

### 2.1 Monedero de Puntos

- `PUNTOS_MONEDERO` exige cliente registrado como dueño del monedero.
- Valida saldo disponible antes de cobrar y **nunca toca la caja** (no es ingreso).
- Las ventas con cliente común **sí acumulan** puntos de fidelidad según la tasa configurable del negocio.
- **Blindaje financiero en devoluciones:** los puntos solo se restituyen si la venta original se cobró con puntos. Antes, una venta de $1,000 en efectivo podía «reembolsarse» en puntos, convirtiendo dinero en lealtad. Ahora se rechaza con `409`.

### 2.2 Precios de mayoreo

- Nuevo campo `Producto.precioMayoreo` (`Decimal`, opcional) y campo de imagen `Producto.imagenUrl`.
- Regla: vacío/`null`/`0` = sin mayoreo; si existe, **debe ser menor** que `precioUnitario` (validado en cliente y servidor).
- Toggle global «Precios de Mayoreo» en el POS que **reprecia todo el carrito**; los productos sin precio de mayoreo conservan su precio de menudeo.
- **El servidor es la autoridad del precio**: `elegirPrecioUnitario` recalcula el importe en la venta, de modo que un cliente manipulado no puede cobrar precio de menudeo fingiendo mayoreo.
- Propagado por venta online, cola offline (`VentaOffline.esMayoreo`) y sincronización.

### 2.3 Imágenes de producto (Cloudinary)

- Configuración pública (`cloudName`, `uploadPreset`, `folder`) servida por `GET /api/configuracion/cloudinary`, protegida por permiso root/admin y por el flag `imagenesCloudinary`.
- Subida **unsigned** directamente desde el navegador: no se expone `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` ni `CLOUDINARY_URL`.
- Validación de formato/tamaño en el cliente, con opción de quitar la imagen.
- Variables documentadas en `apps/web/.env.example`.

### 2.4 Módulo de Clientes

- CRUD completo con búsqueda, historial de ventas, abonos y niveles.
- Datos fiscales: `rfc` y `razonSocial` con validación compartida (`lib/cliente-fiscal.ts`) reutilizada por alta, edición y detalle.
- Búsqueda por RFC o razón social además de nombre/teléfono.
- `saldoDeudor` y `clientes/[id]/abonos` se conservan como flujo legacy; **no se generan deudas nuevas**.

### 2.5 Facturación estricta

- Nueva entidad `Factura` con folio, `usoCfdi`, `formaPago: PUE` y relación 1:1 con la venta.
- Reglas aplicadas en el servidor:
  - solo clientes registrados con RFC o razón social;
  - solo tickets existentes en estado `COMPLETADA`;
  - **bloqueo de doble facturación** por `folioVenta` (`P2002` → `409`);
  - el cliente de la factura debe coincidir con el de la venta; los tickets de mostrador pueden reasignarse;
  - los importes se **copian desde la venta** (nunca los envía el cliente);
  - folio correlativo, registro en bitácora y catálogo de `usoCfdi` validado contra `CLAVES_USO_CFDI`.

### 2.6 Reportes

- Filtros **server-side** por fecha, usuario y módulo (antes se filtraba en el cliente).
- `top-mas-vendidos` corregido y tabla de detalle sin buscador genérico redundante.

### 2.7 Correcciones de UI/UX

- Navegación con `prefetch`, entrada visible a `/clientes` y skeletons de carga en inventario, caja, reportes y clientes.
- Regresión de flags corregida: `FEATURE_FLAGS_SCHEMA` usaba campos requeridos y provocaba **13 pruebas SAT en rojo**; ahora usa `z.boolean().default(false)`.
- `sales-client` normalizaba mal `subtotalLinea` → `importe`, lo que rompía la conciliación del carrito.
- Modal de venta exitosa protegía contra `undefined.toFixed` y exponía `numeroSeguro`.

---

## 3. Correcciones de PDF (documento inválido)

`lib/pdf.ts` generaba un PDF que **no abría en lectores reales**. Se corrigieron cuatro defectos estructurales y se añadieron 10 pruebas de estructura:

| Defecto | Corrección |
|---|---|
| `/Contents` apuntaba un objeto de más (`4 + i*2 + 1`) | `/Contents ${4 + 2i} 0 R` |
| Objetos de fuente fijos en `5`/`6` (solo válidos con 1 página) | Calculados como `3 + 2N` y `4 + 2N` |
| Streams sin dictionary (`/Length` inexistente) | Envoltorio `<< /Length n >> stream … endstream` |
| Fuentes sin `/Encoding` (acentos rotos) | `/Encoding /WinAnsiEncoding` |

---

## 4. Migración de «Crédito de tienda» (eliminada)

- `CREDITO_TIENDA` devuelve `403` en la API y desaparece de configuración, POS, servidor, setup e impresión de tickets.
- El flujo de abonos permanece como herencia sin capacidad de generar deuda.

---

## 5. Modelo de datos

```
Producto   += precioMayoreo Decimal?, imagenUrl String?
Cliente    += rfc String? @unique, razonSocial String?
Factura    (nueva)  folio String @unique, usoCfdi, formaPago,
                     totalNeto, idVenta @unique → Venta
```

`npm run db:generate` y `npm run db:push` completados correctamente.

---

## 6. Pruebas

**161 pruebas en 14 archivos**, todas en verde.

| Archivo | Cobertura |
|---|---|
| `tests/cart-mayoreo.test.ts` | Repricing del carrito, fallback a menudeo, cantidades |
| `tests/facturacion.test.ts` | Reglas estrictas, doble facturación, folios, importes |
| `tests/cliente-fiscal.test.ts` | RFC, razón social, reutilización de validación |
| `tests/sales.test.ts` | Autoridad del precio, mayoreo, `403` de crédito |
| `tests/returns.test.ts` | Blindaje de reembolso en puntos (efectivo/tarjeta rechazados) |
| `tests/pdf.test.ts` | Estructura del documento: xref, `/Length`, fuentes, multipágina |

---

## 7. Notas y riesgos

1. **Pruebas desde la raíz.** `npm test` en la raíz del monorepo falla por resolución de aliases (`@/...`); ejecutar siempre dentro de `apps/web`.
2. **Facturación interna vs. CFDI real.** La implementación actual registra la factura en el sistema. Si el negocio requiere timbrado ante el SAT, falta integrar un proveedor (XML, CFDI 4.0 y timbrado); no está incluido.
3. **Mayoreo offline pendiente de refuerzo.** La cola offline guarda el precio de lista como `precioMomento`, mientras el servidor reaplica el precio de mayoreo; conviene una prueba end-to-end de sincronización en modo mayorista.
4. **Edición de producto.** Verificar que el formulario de producto Precargue `precioMayoreo` e `imagenUrl` al editar, para no borrarlos al guardar.
5. **Permisos por rol.** Queda pendiente una auditoría final de `clientes.ver` y del acceso a Facturación por rol.

---

## 8. Conclusión

El sistema compila, pasa las 161 pruebas, no tiene errores de lint y responde correctamente en los endpoints de la Fase 12. Los defectos financieros detectados durante la revisión (reembolso fraudulento en puntos y PDF corrupto) fueron corregidos y cubiertos con pruebas de regresión.