# Informe del Sistema — Fase 14

**Proyecto:** Papelería → SaaS de Punto de Venta e Inventario multi-negocio
**Fecha:** 2026-10-25
**Alcance:** Dos rondas de mejora a partir de la revisión por módulo del usuario. Primera ronda (2026-10-23): Fases A, B y C más una pasada de QA. Segunda ronda o "retoque" (2026-10-24 y 25): Fases D, E y F más una fase de pruebas conjunta. Todo queda en `main`.

---

## 1. Resumen ejecutivo

Después de la Fase 13 el sistema ya era multi-negocio; esta etapa lo vuelve **creíble para operar a diario** en varios giros: el crédito con proveedores funciona de verdad, hay alertas, el inventario entiende paquetes, granel, lotes, series y variantes sin casillas confusas, el cobro conoce al cliente y sus puntos, la facturación manual arma todo lo que pide el portal del SAT, los usuarios tienen niveles claros con un dueño único, y la consola de plataforma permite dar de alta y atender negocios sin tocar la base de datos.

**Estado de verificación final (rama combinada, antes de subir a `main`)**

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos | `cd apps/web; npx tsc --noEmit` | Sin errores |
| Pruebas unitarias | `cd apps/web; npx vitest run` | **391/391** en 37 archivos (Fase 13: 279 en 24) |
| Aislamiento entre negocios | `npm run verificar:aislamiento -w @papeleria/web` | Verificado contra Postgres real |
| E2E (Playwright) | `npx playwright test` | **7/7** (base aparte `papeleria_e2e`) |
| Lint | `npx next lint` | Sin errores (2 avisos preexistentes en `inventario/page.tsx`) |
| Build | `npx next build` | Compilación exitosa, 77 páginas |
| Auditoría visual | `npm run auditoria:visual` | 0 hallazgos en 15 pantallas × 4 temas × 2 anchos |
| Recorridos por fase | Scripts Playwright de D, E y F | D 46/46, E 25/25, F 39/39 |
| Integración entre fases | Script de escenarios cruzados | 44/44 |
| Barrido de API | 86 rutas × cuerpos inválidos × 3 roles | **0 respuestas 500** |
| Matriz de permisos | Cajera restringida, anónimo y negocio ajeno | 122/122 |
| Migración sobre copia de la base real | `prisma migrate deploy` | Sin pérdida de datos |

**Excluido por decisión del proyecto:** cobro de suscripciones/planes y timbrado CFDI con PAC (la facturación sigue siendo el flujo manual hacia el portal del SAT).

---

## 2. Primera ronda (Fases A, B, C y QA)

### 2.1 Fase A — correcciones, crédito y alertas

- **Crédito con proveedores.** Días de crédito, pedidos de contado o a crédito; la recepción genera una cuenta por pagar con vencimiento y los abonos liquidan la más antigua. *Defecto corregido:* el saldo con el proveedor nunca subía.
- **Centro de alertas.** Campana en el menú y "Pendientes de hoy" en el Dashboard: stock agotado o bajo, lotes caducados o por caducar, pedidos atrasados, pagos por vencer, apartados vencidos y cajas abiertas de más. Se filtran por rol y módulos; "Entendido" las oculta hasta el día siguiente.
- **Tickets a tamaño real.** Impresión al ancho del rollo (80/58 mm) y PDF en tamaño ticket. *Defecto corregido:* la regla `@page` era inválida y salía en carta.
- **Cobro.** Cambio en grande ("Faltan" en rojo) y billetes rápidos.
- **Validación compartida** (`lib/validacion`, `lib/esquemas`): RFC y CURP con fecha real y dígito verificador, teléfono, correo, CP e importes.
- **`npm run db:baseline`** para bases creadas con `db push` y `npm run auditoria:visual` dentro del repositorio.

### 2.2 Fase B — operación diaria

- **Inventario** en tarjetas con imagen, pestañas por categoría, gestor de categorías y ficha del producto con existencias por sucursal, lotes, series, variantes e historial.
- **Mayoreo por escalas** (hasta 5, con nombre: docena, caja); el carrito avisa "lleva N y paga $X".
- **Corte de caja** con conteo por billetes y monedas, resultado explicado por rubro y opción "corte con referencia" (el corte ciego sigue siendo el predeterminado para cajeras).
- **Devoluciones 2.0:** ticket por lista o código de barras del folio, motivo catalogado, destino (inventario, merma, proveedor), plazo y autorización.
- **Clientes 360:** datos fiscales del receptor (CFDI 4.0), datos sensibles enmascarados, hábitos de compra y favoritos al carrito.
- **Facturación manual:** paquete con todos los datos para capturar en el portal del SAT y registro del folio fiscal. Catálogos SAT corregidos.

### 2.3 Fase C — plataforma, módulos y ayudante

- **Consola `/plataforma`** solo para el dueño del sistema, con la clave `PLATAFORMA_TOKEN` (cookie propia de 4 h y límite de intentos).
- **Módulos por giro** (lotes/series, apartados) apagables, con etiqueta Recomendado/Opcional/No aplica y bloqueo también en el servidor.
- **Catálogos de ejemplo** por giro (códigos `EJ-`), idempotentes.
- **Menú agrupado** y **ayudante con guiones** (sin IA) con "Primeros pasos".

### 2.4 QA final de la primera ronda

Barrido de API × rol, aislamiento, pantallas × usuario, flujo de un día y concurrencia. Se corrigió: respuestas 500 ante cuerpos inválidos (ahora 400), pantallas de módulos apagados, permisos de borrar clientes y del kardex, fechas "AAAA-MM-DD" tomadas como UTC (el reporte del día empezaba 6 h antes), sincronización offline duplicada (ahora 409 reintentable) y encabezados de seguridad.

---

## 3. Segunda ronda — retoque (Fases D, E y F)

Decisiones del usuario que guiaron esta ronda:

1. **Mayoreo:** solo escalas; el botón del cobro es "Precio mayorista" y aplica la escala más baja; el precio de mayoreo clásico se migra a una escala.
2. **Tipos de usuario:** Dueño(a) único y transferible > Administrador(a) > Encargado(a) > Cajero(a), más perfiles.
3. **Consola:** se mantiene el acceso con `PLATAFORMA_TOKEN`.
4. **Sin internet:** mejorar la PWA; el servidor local solo se documenta.
5. **Corte:** resultado en el modal, botón Imprimir; impresión automática apagada por defecto.

### 3.1 Fase D — inventario

- **Tipo de producto claro:** "¿Cómo se vende?" (pieza, granel por kg/m/L, servicio) y "¿Control extra?" (ninguno, lotes, series, variantes) en lugar de cuatro casillas sueltas. La existencia y la caducidad se piden solo cuando aplican (`lib/unidades.ts`).
- **Unidad de compra:** "Paquete de N piezas". El pedido se captura en paquetes, al recibir entran piezas y el costo se reparte por pieza; la deuda queda en paquetes × precio. El pedido cotiza al costo, no al precio de venta.
- **Mayoreo unificado** en escalas (ver decisión 1).
- **Listas de lotes, series y variantes** con filtros; baja de lotes y series, eliminar lotes agotados, quitar variantes y generador de variantes desde la ficha.
- **Quitar producto:** se elimina si nunca se movió; con historia se da de baja.
- **Buscador guiado** en pedidos, traspasos y promociones.
- **Carga masiva:** columnas nuevas (costo, categoría, unidad de compra, se vende, control, mayoreo) y plantilla `.xlsx` generada por el servidor con listas desplegables. *Defectos corregidos:* al actualizar se borraban las columnas ausentes y el enlace a la plantilla daba 404.
- **Imágenes y logo** se reducen en el navegador antes de subir; el logo va a Cloudinary si está configurado.
- *Otros defectos corregidos:* columnas desordenadas en la tabla de inventario, el formulario arrastraba el costo del producto anterior, la cajera veía costos en la búsqueda.
- **Semilla de demostración** (`packages/database/prisma/seed-demo.ts`): un producto de cada tipo (`DEMO-*`) y dos clientes con datos fiscales ficticios del SAT (Escuela Kemper Urgate, `EKU9003173C9`, y Xóchitl con 150 puntos).

### 3.2 Fase E — cobro, clientes, facturación y caja

- **Cliente en el cobro:** barra "Público general / Cliente registrado" siempre visible; con el monedero activo muestra los puntos del cliente y los que ganará, y la confirmación los reporta. Sin el método `PUNTOS_MONEDERO` la venta no acumula puntos.
- **Datos fiscales completos del cliente** (calle, números, colonia, municipio, estado) con el mismo editor y validaciones que el negocio, en modo receptor compacto.
- **Facturación lee el emisor de Configuración**, muestra qué falta y enlaza a la sección exacta; se quitó el formulario duplicado.
- **Corte en modal** con botón Imprimir y ajuste "imprimir automáticamente" (apagado).
- **Botón "Abrir cajón"** en Caja con motivo obligatorio y registro en bitácora.
- **Identidad:** la pestaña del navegador dice "Pantalla · Negocio" y usa el logo como icono.

### 3.3 Fase F — administración y plataforma

- **Análisis del negocio** en Reportes (7/30/90 días): tendencia con promedio de 7 días y comparación con el periodo anterior, días y horas pico, ABC (Pareto), margen por categoría, días de inventario, cuentas por pagar por antigüedad y mezcla de pagos. Cada gráfica explica qué significa y qué hacer (`lib/analitica.ts`).
- **Ayudante** con temas para las 16 pantallas del menú (una prueba vigila que ninguna se quede sin tema).
- **Tipos de usuario** (`lib/roles.ts`):

| Nivel | Quién | Puede |
|---|---|---|
| Dueño(a) | Una administradora con `isRoot` por negocio | Todo; único que maneja administradores, reinicia el sistema y transfiere la propiedad (con su contraseña) |
| Administrador(a) | Rol ADMINISTRADORA | Todo lo operativo; crea y edita encargados y cajeros |
| Encargado(a) | Cajera con permisos de inventario y reportes | Inventario, pedidos, kardex, reportes; no usuarios, retiros ni facturación |
| Cajero(a) | Cajera | Cobro y caja |

  La tabla "quién puede hacer qué" se muestra en Configuración → Usuarios.

- **Consola de plataforma ampliada:** tablero con gráficas, ficha de cada negocio con sus usuarios (soporte: restablecer clave, activar/desactivar; no se desactiva al dueño), bitácora propia de la plataforma (`plataforma_logs`), exportación a Excel (negocios y usuarios) y alta de negocios con el mismo asistente de configuración inicial.
- **Instalar aplicación (PWA)** desde el menú y guía de uso sin internet y de servidor local en `docs/GUIA_INSTALACION.md` (secciones 6.1 y 6.2).

---

## 4. Fase de pruebas conjunta

Se probaron las tres fases juntas en la rama `feat/qa-retoque` contra una base separada (`papeleria_e2e`, reiniciada entre baterías) para no tocar los datos reales.

### 4.1 Escenarios cruzados (44/44)

| Escenario | Qué se comprobó |
|---|---|
| Paquete + escala + puntos | 12 papas cobran la escala de $20, el cliente gana 2 puntos, la existencia baja en piezas; "Precio mayorista" aplica la escala aunque sean 2 |
| Devolución | Las piezas devueltas regresan al inventario |
| Compra a crédito por paquetes | 3 paquetes = 72 piezas y $1,080 de deuda |
| Lotes FEFO | Se agota primero el lote que caduca antes; existencia y lotes cuadran |
| Series | Queda vendida y ligada al ticket; no se da de baja ni se vende dos veces |
| Variantes con historia | Vender descuenta solo esa combinación; quitarla la da de baja y deja de listarse |
| Granel por Excel | Alta por carga masiva; 2.5 m cobran $45 y quedan 48 m |
| Encargado(a) | Ve análisis, hace pedidos y consulta kardex; no crea usuarios, no hace retiros, no entra a facturación |
| Análisis | Refleja tickets, ABC, cuentas por pagar y mezcla de pagos |
| Factura | El paquete usa el emisor de Configuración y el receptor completo del cliente |
| Corte | Suma efectivo y digital de todo lo vendido |
| Plataforma | Alta de una farmacia con asistente y catálogo; su administradora es la dueña; módulo que no aplica apagado; sin ver productos de otro negocio |

### 4.2 Baterías de QA repetidas sobre el código combinado

- **Barrido de API:** 86 rutas con cuerpos inválidos (nulo, texto, arreglos, tipos y números absurdos, texto de 100 000 caracteres) y consultas malformadas → 0 respuestas 500; anónimo recibe 401 en todo; las rutas de administración rechazan a la cajera.
- **Aislamiento y permisos:** 122/122 (llaves de otro negocio, cajera restringida, consola).
- **Pantallas × usuario × giro:** 0 problemas.
- **Flujo de un día:** apertura, ventas en efectivo/tarjeta/mixto, devolución, retiro, corte, reportes y bitácora.
- **Concurrencia:** 11/11 (aperturas y cierres simultáneos, sincronización offline duplicada, login multi-negocio).

### 4.3 Hallazgo de la fase de pruebas

**Bases existentes sin dueño.** Al aplicar las migraciones a una copia de la base real se vio que ningún usuario quedaba como Dueño(a), con lo que nadie podría administrar a otras administradoras ni reiniciar el sistema. Se añadió a la migración `20261025120000_fase_f_plataforma` un paso que, en cada negocio sin dueño, marca como dueña a **la administradora activa más antigua**. Se verificó sobre la copia: exactamente un dueño y ningún dato perdido. La propiedad se puede transferir después desde Configuración → Usuarios.

---

## 5. Modelo de datos (migraciones)

```
20261023120000_credito_proveedores_alertas  días de crédito, cuentas por pagar, alertas descartadas
20261023180000_operacion_fase_b             escalas de mayoreo, denominaciones, devoluciones 2.0, datos fiscales del cliente, facturas manuales
20261024120000_fase_d_unidades              unidad de compra y piezas por unidad; precio de mayoreo → escala "Mayoreo" desde 12
20261024180000_fase_e_clientes_corte        domicilio fiscal del cliente, imprimir corte automáticamente
20261025120000_fase_f_plataforma            tabla plataforma_logs y asignación del dueño en negocios existentes
```

**En otra computadora:** `npm run db:deploy` (o `npx prisma migrate deploy` en `packages/database`). Si la base se creó con `db push`, primero `npm run db:baseline` (ver `docs/GUIA_INSTALACION.md`).

---

## 6. Pruebas unitarias

**391 pruebas en 37 archivos.** Archivos nuevos o ampliados desde la Fase 13:

| Archivo | Cobertura |
|---|---|
| `tests/cuentas-pagar.test.ts`, `tests/abonos.test.ts` | Crédito con proveedores, abonos a la cuenta más antigua, proveedor ajeno |
| `tests/alertas.test.ts` | Centro de alertas por rol y módulo |
| `tests/validacion.test.ts`, `tests/sat-validation.test.ts` | RFC, CURP, CP, régimen y uso CFDI |
| `tests/precios.test.ts`, `tests/cart-mayoreo.test.ts` | Escalas de mayoreo y "Precio mayorista" |
| `tests/denominaciones.test.ts` | Conteo de billetes y monedas |
| `tests/returns.test.ts` | Devoluciones con destino y plazo |
| `tests/clientes.test.ts`, `tests/cliente-fiscal.test.ts`, `tests/fidelidad.test.ts` | Clientes 360, mapeo fiscal, puntos solo con monedero |
| `tests/factura-manual.test.ts`, `tests/facturacion.test.ts` | Paquete para el portal del SAT |
| `tests/unidades.test.ts`, `tests/carga-masiva.test.ts` | Tipo de producto, unidad de compra, carga masiva |
| `tests/catalogos-ejemplo.test.ts`, `tests/plataforma-ayudante.test.ts` | Catálogos por giro, consola, ayudante en todas las pantallas |
| `tests/analitica.test.ts` | Indicadores, ABC, días de inventario, antigüedad de cuentas |
| `tests/roles.test.ts` | Niveles, plantillas de usuario y quién puede gestionar a quién |
| `tests/pdf.test.ts` | Ticket en tamaño de rollo |

---

## 7. Notas y riesgos

1. **Timbrado CFDI** sigue fuera de alcance; la factura queda "por timbrar" hasta registrar el folio fiscal del portal del SAT.
2. **Planes y cobro de suscripción** no incluidos.
3. **`PLATAFORMA_TOKEN`** debe ser largo y solo conocerlo el dueño del sistema; sin esta variable la consola queda cerrada.
4. **Dueño asignado automáticamente** en bases existentes (ver 4.3); conviene confirmarlo o transferirlo.
5. **"Entrar como soporte"** (suplantar a un usuario desde la consola) no se implementó.
6. **Reporte de ventas:** los totales se calculan en pantalla y en Excel a partir de las filas; la API no envía una fila de totales.
7. Ejecutar `vitest` dentro de `apps/web` (los alias `@/` no resuelven desde la raíz).

---

## 8. Conclusión

Con esta etapa el sistema cubre el día completo de un negocio de cualquier giro soportado: compra por paquetes y a crédito, vende por pieza, granel, lote, serie o variante, conoce al cliente y sus puntos, cuadra la caja, prepara la factura y analiza el negocio, con niveles de usuario claros y una consola para atender a varios negocios. Compila, pasa 391 pruebas unitarias, 7 E2E y 44 escenarios cruzados, no tiene respuestas 500 ante datos inválidos y mantiene el aislamiento entre negocios.
