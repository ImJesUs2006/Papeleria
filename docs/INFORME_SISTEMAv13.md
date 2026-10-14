# Informe del Sistema — Fase 13

**Proyecto:** Papelería → SaaS de Punto de Venta e Inventario multi-negocio
**Fecha:** 2026-10-14
**Alcance:** Auditoría de lógica y seguridad, conversión a SaaS multi-negocio (`idNegocio`), impuestos por producto y los pasos 3 a 8 del plan de personalización (descuentos, perfiles, sucursales, lotes/series, compras/costos, hardware/offline), más el pulido de interfaz, configuración por giro y rendimiento de navegación.

---

## 1. Resumen ejecutivo

El sistema dejó de ser el punto de venta de **una** papelería y ahora es un **SaaS donde varios negocios de distintos giros** (papelería, abarrotes, farmacia, ferretería, boutique, servicios y mixto) operan sobre la misma instalación, cada uno aislado y con su propia configuración. La papelería sigue siendo el cliente principal y su plantilla se revisó primero, sin descuidar a los demás giros.

**Estado de verificación final**

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos | `cd apps/web; npx tsc --noEmit` | Sin errores |
| Pruebas unitarias | `cd apps/web; npx vitest run` | **279/279** en 24 archivos (Fase 12: 161 en 14) |
| Aislamiento entre negocios | `npm run verificar:aislamiento -w @papeleria/web` | Verificado contra Postgres real |
| E2E (Playwright) | `npx playwright test` | **7/7** (base aparte `papeleria_e2e`) |
| Lint | `npx next lint` | Sin errores (2 avisos preexistentes en `inventario/page.tsx`) |
| Build | `npm run build` | Compilación exitosa |
| Auditoría visual | Script de desbordes y contraste | 0 hallazgos en 15 pantallas × 4 temas × 2 anchos |

**Excluido por decisión del proyecto:** cobro de suscripciones/planes (se trabajará por aparte) y timbrado CFDI con PAC/sello SAT (pendiente).

---

## 2. Auditoría de lógica y seguridad

Antes de crecer el sistema se corrigieron defectos de base:

- **Ventas:** descuento de stock atómico (sin sobreventa por carreras), IVA configurable, caja abierta obligatoria y folios seguros.
- **Sincronización offline:** ventas atómicas, autoría validada y solo métodos de pago habilitados.
- **Caja:** descuadre por rubro; apertura y cierre sin condiciones de carrera.
- **Devoluciones:** reversa de puntos y de vouchers.
- **Kardex** en ajustes, altas, carga masiva y recepción de pedidos.
- **Apartados:** liquidación, cancelación y pantalla propia.
- **Seguridad:** JWT obligatorio, sesión validada en la BD en cada petición (una cuenta desactivada pierde el acceso al instante) y límite de intentos de login.

---

## 3. SaaS multi-negocio (`idNegocio`)

- Tabla `Negocio` e `idNegocio` en todas las tablas. Código de producto, código de barras, usuario y folio de caja son **únicos por negocio**, no globales.
- `lib/tenant.ts`: cliente Prisma con alcance de negocio que **filtra lecturas, traduce llaves únicas y sella escrituras** (incluidas las anidadas). Las rutas ya no importan el cliente global; una prueba lo vigila.
- El negocio de la sesión **siempre sale de la BD**, nunca del token ni del navegador.
- Login con código de negocio + usuario (opcional cuando solo hay un negocio).
- Alta de negocios: `POST /api/negocios` y pantalla `/plataforma/negocios`, protegidas con `PLATAFORMA_TOKEN`.
- **Migraciones versionadas** de Prisma (`npm run db:migrate` / `db:deploy`) en lugar de `db push`; los datos existentes pasan al negocio `default`.
- `scripts/verificar-aislamiento.ts` comprueba contra Postgres que ningún negocio ve ni modifica datos de otro.

---

## 4. Impuestos por producto

- `lib/impuestos.ts`: motor fiscal único para servidor y cliente. IVA por producto (16 %, tasa 0, exento) e IEPS. Desglosa impuestos cuando el precio ya los incluye y **cuadra al centavo**.
- Configuración del negocio: «Mis precios ya incluyen IVA».
- Venta, sync offline, apartados y devoluciones guardan base, IVA e IEPS por línea (lo que pedirá el CFDI). Las devoluciones reembolsan exactamente lo cobrado en cada línea.
- Fix: editar un producto ya no borra su precio de mayoreo ni su imagen (riesgo 4 de la Fase 12, cerrado).

---

## 5. Plan de personalización (pasos 3 a 8)

### 5.1 Descuentos, promociones y pagos mixtos (paso 3)
- Promociones automáticas: porcentaje y «lleva N, paga M», por producto, categoría o todo el catálogo, con vigencia por día completo.
- Descuento manual por línea y al ticket. Arriba del **tope de la cajera** (configurable), una administradora del mismo negocio autoriza con usuario y contraseña; queda registrado quién autorizó.
- **Pago dividido** entre varios métodos: cada parte entra a su rubro de caja y el cambio sale solo del efectivo.

### 5.2 Perfiles y vocabulario del giro (paso 4)
- Perfiles con nombre propio por negocio (rol base + permisos). Los permisos de inventario y reportes ahora **tienen efecto real** en API, middleware y menú.
- Vocabulario por giro (Medicamento/Paciente, Prenda, Artículo, Servicio…), nombres visibles de los roles y **campos propios del producto** validados contra el negocio.

### 5.3 Sucursales y multi-caja (paso 5)
- Cada negocio arranca con su **Matriz**; existencias por sucursal. `lib/existencias.ts` es el **único punto que mueve stock**, en la misma transacción que el total del producto.
- Multi-caja: cada usuario opera su propia caja y pueden estar varias abiertas a la vez.
- Traspasos entre sucursales con kardex en origen y destino; selector de sucursal activa para la administradora.

### 5.4 Lotes, series y variantes (paso 6)
- Lotes con caducidad: la venta consume **FEFO** y nunca toma lotes vencidos; cada línea guarda los lotes consumidos (trazabilidad para retiros). Alerta «por caducar» y baja como merma.
- Números de serie: una serie por pieza, verificada como disponible; la devolución la libera.
- Variantes (talla, color…) generadas como productos propios que comparten grupo, precio e impuestos.

### 5.5 Compras, costo promedio y margen (paso 7)
- Recepción de pedidos total o **parcial** (estado `PARCIAL`), con lote cuando aplica; no permite recibir más de lo pedido.
- Costo promedio ponderado; cada línea de venta **congela su costo**.
- Reporte «Margen por producto» (venta sin impuestos contra costo, descontando devoluciones).

### 5.6 Hardware y offline real (paso 8)
- El POS guarda el catálogo de su sucursal en IndexedDB: escáner, búsqueda y catálogo táctil funcionan sin red. Service worker para abrir la app sin servidor y manifiesto para instalarla.
- Impresión térmica directa **ESC/POS** (Web Serial) con corte y acentos; si falla, se usa el diálogo del navegador.
- Cajón de dinero al cobrar en efectivo y lectura de báscula para productos a granel. Se configura por equipo en Configuración → «Este equipo».
- `Dockerfile.prod` verificado y `.dockerignore` (sin `node_modules`, `.env` ni respaldos en la imagen).

---

## 6. Pulido de interfaz

### 6.1 Legibilidad en todos los temas
- En los temas claros (Minimalista, Brutalista, Corporativo), los textos amarillos, verdes y otros colores claros se oscurecen automáticamente para ser legibles.
- Las gráficas del Dashboard toman los colores del tema activo (antes eran fijos del tema oscuro).
- Textos que se salían del margen: tarjetas del catálogo, búsqueda táctil y **carrito** (el nombre se cortaba a 4 letras; ahora va completo en hasta 2 renglones con los controles debajo). El botón para quitar una línea ya es visible en pantallas táctiles.

### 6.2 Notificaciones deslizantes
- Capa global (`store/notificaciones.ts` + `components/notificaciones.tsx`): éxito, error, aviso e información; se apilan (máximo 4), se van solas y se pueden cerrar.
- Al agregar un producto: «*Pluma Azul Bic agregado · Cantidad en el carrito: 1*».
- Los avisos fijos de Configuración, Usuarios, Mi cuenta, Hardware, Caja, Apartados, Lotes, Traspasos y Promociones se convirtieron en notificaciones. Se ubican abajo a la izquierda del contenido para no tapar el botón de cobrar.

---

## 7. Configuración: validación y plantillas por giro

### 7.1 Defectos encontrados y corregidos

| Defecto | Corrección |
|---|---|
| El asistente inicial enviaba siempre «Mi Negocio» y pisaba el nombre real | Pide el nombre (precargado con el actual) |
| Re-ejecutar el asistente **borraba logo, tema, datos fiscales y mensaje del ticket** | `/api/setup` solo actualiza los campos que recibe |
| El asistente no preguntaba si los precios incluyen IVA | Nueva pregunta en el paso de pagos |
| El mensaje del ticket no salía en el ticket de venta | Sale en pantalla, térmica ESC/POS y PDF |
| Los módulos apagados solo se ocultaban del menú; la API seguía respondiendo | `requireAuth(..., { modulo })` rechaza con 403 proveedores, pedidos, facturación, dashboard y bitácora |
| La búsqueda táctil bloqueaba servicios sin existencias | Los servicios siempre se pueden agregar |
| Textos fijos de papelería («Ingreso papelería», «Papelería» en Dashboard) | Textos neutros / vocabulario del giro |
| Farmacia anunciaba «crédito a clientes» (eliminado en Fase 12) | Descripción actualizada |

### 7.2 Qué se puede personalizar por negocio

- **Identidad y tema:** nombre, giro, moneda, IVA, logo, tema base y color de acento.
- **Punto de venta:** ancho de ticket, vista inicial (escáner o catálogo), mensaje del ticket, tope de descuento de la cajera.
- **Financiero:** métodos de pago, datos bancarios, datos fiscales, monedero de puntos.
- **Módulos:** inventario, facturación, dashboard, proveedores, bitácora, recargas e imágenes en la nube; cada uno con su descripción. Botón **«Aplicar plantilla»** que restablece lo recomendado para el giro.
- **Giro:** vocabulario, nombres de roles y campos propios del producto.
- **Este equipo:** impresora, cajón y báscula.

### 7.3 Plantillas por giro

| Giro | Módulos y preferencias | Campos de producto |
|---|---|---|
| **Papelería** | Proveedores y recargas activos; tipo de impresión visible | Marca, Línea (Escolar, Oficina, Arte, Regalos, Cómputo), Presentación |
| Abarrotes | Facturación, proveedores y recargas; caducidad activa | Marca, Contenido neto, Presentación |
| Farmacia | Caducidad; nunca vende sin existencia | Sustancia activa, Laboratorio, Presentación, Requiere receta |
| Ferretería | Facturación y proveedores; ubicaciones | Marca, Medida, Material |
| Boutique | Facturación y proveedores; variantes por talla/color | Marca, Temporada, Material |
| Servicios | Catálogo disponible (sin existencias); acepta efectivo | Duración (min), Responsable |
| Mixto | Todos los módulos principales | Marca |

Los negocios existentes conservan su configuración guardada; la plantilla solo se aplica al elegir el giro en el asistente o con «Aplicar plantilla».

---

## 8. Rendimiento de navegación

**Causa:** cada página montaba de nuevo el menú, la verificación de sesión y la carga de configuración (con sus consultas al servidor), y la animación esperaba a que saliera la página anterior antes de mostrar la nueva.

**Cambios:**
- Layout compartido `app/(dashboard)/layout.tsx`: menú, sesión y configuración se montan **una sola vez**.
- Animación solo de entrada y esqueleto de carga inmediato (`loading.tsx`).
- `getSession` obtiene la sucursal matriz en la misma consulta que el usuario (**una consulta menos por petición**).
- `npm run dev` usa **Turbopack** (`npm run dev:webpack` queda de respaldo). El paquete de base de datos reexporta Prisma de forma explícita para evitar avisos de Turbopack.
- Fix: `AuthGuard` mandaba a `/login` si la verificación tardaba más de 100 ms; ahora espera la respuesta del servidor.

**Mediciones** (clic en el menú hasta que el módulo muestra contenido):

| Modo | Primera visita | Visitas siguientes |
|---|---|---|
| Producción (`next start`) | 60–210 ms | 60–210 ms |
| Desarrollo con Turbopack | 1–1.8 s (compilación) | 0.25–0.9 s |

---

## 9. Modelo de datos (migraciones)

```
20261005000000_init                      línea base
20261005010000_multi_tenant              Negocio + idNegocio en todas las tablas
20261005190045_impuestos_por_producto    tasaIva, exentoIva, tasaIeps, preciosIncluyenIva
20261014040347_descuentos_promociones_pagos  Promocion, PagoVenta, descuentos en Venta
20261014041620_perfiles_personalizacion  Perfil, personalización del giro, atributos
20261014042549_sucursales_existencias    Sucursal, Existencia, Traspaso, multi-caja
20261014043922_lotes_series_variantes    Lote, consumo por lote, Serie, grupos de variantes
20261014044621_compras_costos            recepción parcial, costo promedio, costo por línea
```

La fase de pulido no requirió migraciones.

---

## 10. Pruebas

**279 pruebas en 24 archivos.** Archivos nuevos desde la Fase 12:

| Archivo | Cobertura |
|---|---|
| `tests/tenant.test.ts` | Filtro por negocio, llaves únicas, escrituras selladas, guardia del cliente global |
| `tests/impuestos.test.ts` | IVA por producto, tasa 0, exento, IEPS, precios con IVA incluido |
| `tests/descuentos-pagos.test.ts` | Promociones, descuentos, tope de cajera, pago dividido |
| `tests/personalizacion-perfiles.test.ts` | Perfiles, vocabulario, campos personalizados |
| `tests/sucursales.test.ts` | Existencias por sucursal, traspasos, multi-caja |
| `tests/lotes-series-variantes.test.ts` | FEFO, caducidad, series, variantes |
| `tests/compras.test.ts` | Recepción parcial, costo promedio, margen |
| `tests/hardware-offline.test.ts` | ESC/POS, catálogo offline |
| `tests/plantillas-giro.test.ts` | Plantillas completas por giro, papelería/farmacia/servicios, descripciones de módulos |

Además: `verificar-aislamiento` (Postgres real) y 7 pruebas E2E del POS con Playwright sobre una base separada para no tocar datos reales.

---

## 11. Notas y riesgos

1. **Timbrado CFDI pendiente.** Los impuestos ya se guardan por línea como los pedirá el CFDI 4.0, pero falta integrar un PAC y el sello SAT (decisión: pendiente).
2. **Planes y cobro de suscripción** no incluidos (se trabajarán por aparte).
3. **Service worker** no se registra en el navegador integrado de algunas herramientas; se verificó en Edge real.
4. **Pruebas desde la raíz.** Ejecutar `vitest` dentro de `apps/web` (los alias `@/` no resuelven desde la raíz).
5. **Turbopack** es el modo de desarrollo por defecto; si alguna dependencia futura no lo soporta, usar `npm run dev:webpack`.
6. **Bundle del Dashboard** (~269 kB con recharts): se puede reducir con carga diferida de las gráficas si se vuelve un problema en equipos lentos.

---

## 12. Conclusión

El sistema pasó de ser el punto de venta de una papelería a un SaaS multi-negocio, multi-sucursal y personalizable por giro, con aislamiento verificado contra la base de datos real. Compila, pasa 279 pruebas unitarias y 7 E2E, no tiene errores de lint, se lee correctamente en los cuatro temas y cambia de módulo en menos de un cuarto de segundo en producción.
