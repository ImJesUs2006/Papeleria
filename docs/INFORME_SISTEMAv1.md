# Informe Técnico del Sistema de Gestión para Papelería

**Versión evaluada:** Estado actual del repositorio
**Fecha:** Septiembre 2026
**Stack principal:** Next.js 14 (App Router) · Tailwind CSS · Zustand · Framer Motion · Prisma · PostgreSQL · TurboRepo

---

## 1. Resumen ejecutivo

El sistema es un SaaS de gestión integral para una papelería. Se desarrolló bajo una arquitectura **monorepo** con TurboRepo, separando el frontend/web (`apps/web`) de la capa de datos (`packages/database`). La aplicación está orientada a dos perfiles (Admin/dueña y Cajera) con control de acceso por roles (RBAC). Incluye un Punto de Venta (POS) con soporte de lector de códigos de barras USB, control de caja con flujos financieros separados (papelería vs recargas telefónicas), inventario con carga masiva vía Excel, reportes exportables en formato Excel y una bitácora de auditoría.

La base de datos corre en **Docker** (PostgreSQL) en paralelo con un servidor PostgreSQL local de Windows, por lo que el puerto de exposición se desplazó a `5433` para evitar conflictos.

---

## 2. Arquitectura y stack técnico

```
Papeleria/
├── apps/web/                     # Aplicación Next.js 14 (App Router)
│   ├── app/
│   │   ├── (auth)/login/         # Autenticación
│   │   ├── (dashboard)/          # Cobro, Caja, Inventario, Reportes, Bitácora
│   │   ├── api/                  # 10 endpoints REST (auth, caja, productos, inventario, reportes, bitácora)
│   ├── components/               # Layout (Sidebar RBAC), POS, AuthGuard
│   ├── hooks/use-scanner.ts      # Detección de lector de barras HID
│   ├── store/                    # Zustand: auth + cart (persistencia)
│   ├── lib/                      # jwt (edge-safe), auth, excel, utils
│   └── middleware.ts             # Protección de rutas + RBAC
├── packages/database/            # Prisma schema + seed
└── docker-compose.yml            # PostgreSQL (host:5433)
```

### Tecnologías
| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS 3, Framer Motion, lucide-react |
| Estado | Zustand 4 (persist en localStorage) |
| Backend | API Routes de Next.js (Node runtime) + Edge Middleware |
| ORM / DB | Prisma, PostgreSQL 16 |
| Autenticación | JWT (jose) + bcryptjs, cookie httpOnly |
| Excel | SheetJS (xlsx) para lectura/escritura |
| Infra | Docker Compose, TurboRepo |

---

## 3. Inventario de módulos

### 3.1 Autenticación y RBAC — ✅ Funcional
- Login con `bcryptjs`, emisión de JWT firmado con `jose` y cookie `papeleria_token`.
- `middleware.ts` (Edge Runtime) protege rutas y valida rol: solo `ADMINISTRADORA` accede a Inventario, Reportes, Bitácora y Configuración.
- Persistencia de sesión en Zustand (`persist` + endpoint `/api/auth/me` para rehidratar al recargar).
- Usuarios semilla: `admin`/`admin123` (ADMINISTRADORA), `cajera1`/`cajera123` (CAJERA).

### 3.2 Punto de Venta (POS) — ✅ Funcional (cálculo del cobro; ver mejoras)
- Lector de código de barras USB con **detección de ráfagas HID** (`use-scanner.ts`): distingue escaneo real (teclas <50 ms + Enter) de tecleo humano.
- **A prueba de fallos**: si el escaneo no se completa (sin Enter en 1.4 s), se abre automáticamente un **modal de búsqueda manual táctil** con botones grandes para agregar productos.
- Carrito global en Zustand: agregar, quitar, cambiar cantidad, subtotal, IVA 16% y total.
- Selección de método de pago (Efectivo / Tarjeta / Digital).
- Indicador de salud del lector (online/idle) y búsqueda de producto por código/barras contra la API.

### 3.3 Control de Caja — ✅ Parcial (falta cierre efectivo)
- Apertura de caja con fondo inicial (`POST /api/caja/abrir`).
- **Separación visual crítica**: inputs independientes y con colores distintos para registrar ingresos de **Papelería** (neón verde) vs **Recargas telefónicas** (neón cian). Cada uno persiste en la sesión de caja con su propio acumulador (`totalVentasEfectivo`, `totalRecargas`) vía `POST /api/caja/ingreso`, evitando descuadres.
- Panel con total balanceado (fondo + papeleria + recargas).
- **Pendiente:** el cierre de caja es solo UI (modal de confirmación); no existe endpoint ni lógica de cierre.

### 3.4 Inventario — ✅ Funcional
- Búsqueda con filtros combinables: texto (código/item, barras, descripción, proveedor, estante), rango de precios, rango de stock, bajo stock, sin stock, tipo de impresión, proveedor, ubicación.
- Ordenamiento por 7 campos y paginación.
- **Carga masiva vía Excel** (`POST /api/inventario/carga-masiva`): zona drag & drop, lectura con SheetJS, validación, upsert transaccional con Prisma y bitácora.

### 3.5 Reportes — ✅ Funcional (7 exportables Excel)
Endpoints en `GET /api/reportes?tipo=...`:
1. `inventario` — estado completo del inventario.
2. `reabastecimiento` — productos en o bajo stock mínimo.
3. `ventas` — historial de ventas por rango de fechas.
4. `ventas-por-producto` — agregación por producto.
5. `top-mas-vendidos` — ranking de productos más vendidos.
6. `cierre-caja` — resumen financiero de una sesión de caja.
7. `bitacora` — exportación de la bitácora.

Los archivos se generan en memoria con SheetJS y se devuelven como binario XLSX.

### 3.6 Bitácora de Auditoría — ✅ Funcional
- Tabla estilizada con badges de color por módulo (POS, Caja, Inventario, etc.).
- Filtros por rango de fechas (`desde`/`hasta`) y por módulo.
- Botón flotante que **descarga en Excel** los registros filtrados (`GET /api/bitacora?export=xlsx`).
- Endpoint protegido exclusivamente para `ADMINISTRADORA`.

---

## 4. Adaptaciones realizadas durante el desarrollo

### 4.1 Infraestructura
- **Monorepo con TurboRepo**: repositorio único con dos paquetes (`web`, `database`) y scripts agrupados.
- **Desplazamiento de puerto PostgreSQL de 5432 → 5433**: la máquina del desarrollador tiene PostgreSQL de Windows ocupando el `5432`; Docker mapea `5433:5432` interno para convivencia.
- **Eliminación del atributo `version`** en `docker-compose.yml` (obsoleto en Compose v2).
- **Credenciales de base de datos**: `papeleria` / `papeleria2026` / db `papeleria_db`; dtos separados por carpeta (`apps/web/.env`, `packages/database/.env`).

### 4.2 Autenticación y seguridad
- **División jwt/auth edge-safe**: `lib/jwt.ts` (solo `jose`, compatible con Edge Runtime) vs `lib/auth.ts` (usa `next/headers`, solo servidor). El middleware importa únicamente la capa segura para Edge.
- **Persistencia de sesión en Zustand** para no perder el estado al recargar la página.

### 4.3 Experiencia de usuario
- Tema de **alto contraste**: fondo profundo `#0a0a0a`, superficies escalonadas, acentos neón (verde, cian, magenta) para las acciones primarias.
- Sidebar animado con resaltado de ruta activa (`layoutId` de Framer Motion) **que oculta enlaces según el rol**: una cajera no ve Reportes, Bitácora ni Inventario.
- **Separación intencional de flujos financieros** en caja (papelería vs recargas) para prevenir descuadres.

---

## 5. Historial de correcciones de bugs

| # | Problema | Corrección aplicada |
|---|---|---|
| 1 | Errores de validación del schema Prisma (relaciones inversas faltantes) | Se agregaron las relaciones `pedidosProveedor` (en Usuario) e `itemsPedido` (en Producto); se regeneró el cliente. |
| 2 | `DATABASE_URL` en el paquete correcto | Se separaron `.env` por carpeta (raíz, `apps/web`, `packages/database`). |
| 3 | Conflicto de puerto PostgreSQL local vs contenedor | Docker pasó a exponerse en el host `5433`. |
| 4 | `Module not found: Can't resolve '@/lib/auth'` en middleware | Se creó `apps/web/tsconfig.json` con paths `@/*` y `@papeleria/database`; el middleware usa ahora solo `@/lib/jwt` (Edge-safe). |
| 5 | Error TS2345: `Buffer` no asignable a `BodyInit` en reportes | Se envuelve el buffer en `new Uint8Array(buffer)` antes de `new NextResponse(...)`. |
| 6 | Imports sin uso en login (error de lint) | Se limpiaron. |
| 7 | **Interfaz sin estilos (HTML crudo)** | **Causa raíz: faltaba el pipeline PostCSS.** Se crearon `apps/web/postcss.config.mjs` (tailwindcss + autoprefixer) y `apps/web/next.config.mjs` (transpile de `@papeleria/database`). El dev server se reinició y el CSS compilé (32 KB) con las clases neón. |
| 8 | `hover:shadow-glow` sin definición | Se agregó la sombra `glow` al tema de Tailwind. |
| 9 | Costado de POS: botón "Cobrar" sin backend | Documentado como mejora pendiente (sección 7). |

---

## 6. Estado actual — checklist

| Módulo | Funcional | Observaciones |
|---|---|---|
| Login + JWT + RBAC (middleware + UI) | ✅ | — |
| Sidebar condicional por rol | ✅ | — |
| POS: escaneo + modal táctil + carrito | ✅ | Falta postear la venta |
| Caja: apertura + ingresos separados | ✅ | Falta endpoint de cierre |
| Inventario: filtros + orden + paginación | ✅ | — |
| Carga masiva Excel (drag & drop) | ✅ | — |
| Reportes Excel (7 tipos) | ✅ | — |
| Bitácora + export filtrado | ✅ | — |
| Configuración de usuarios/roles | ❌ | Enlace en sidebar, sin página |
| Pedidos a proveedores | ❌ | Modelo en schema, sin UI |
| Venta (POST) + descuento de stock | ❌ | Es la columna vertebral faltante |

---

## 7. Propuestas de área de mejora (priorizadas)

### 🔴 Críticas (bloquean operación real)
1. **Implementar POST /api/ventas**: persistir la venta (Venta + LineaDetalleVenta), descontar stock de manera transaccional, vincular a sesión de caja según método de pago (efectivo → caja; recarga → totalRecargas) y registrar en bitácora. El botón "Cobrar" hoy es solo UI.
2. **Cierre de caja funcional**: endpoint `POST /api/caja/cerrar` con arqueo (fondos declarados vs esperados), validación de descuadre y reporte de cierre.
3. **Endpoint de productos {codigo}**: el POS busca con `?q=` (búsqueda abierta); conviene resolver exacto por `codigoBarras` primero para evitar falsos positivos.

### 🟠 Importantes
4. **Error handling de carga masiva**: devolver errores por fila con su ubicación (Excel con columna "Error") para feedback accionable.
5. **Paginación real en bitácora** (infinita scroll o límite+offset) en vez del tope de 100/2000 filas.
6. **Proteger `/api/caja/ingreso` y `/api/caja/abrir`** con `requireAuth`/`hasPermission` (hoy no verifican sesión).
7. **Id de usuario real en caja**: reemplazar el `placeholder-user-id` de `abrir` por el `idPersona` del JWT.
8. **Página de Configuración**: gestión de usuarios/roles (crear, activar/desactivar, resetear contraseña, asignar rol).
9. **Validación de tipos en `tipoImpresion`/`moduloSistema`** (reemplazar `as any` por tipado de enums Prisma).

### 🟡 Buenas prácticas / deuda técnica
10. **Pruebas automatizadas**: al menos tests de contrato de las APIs (auth, ventas, reportes) con supertest + Vitest, y E2E de flujo de cobro con Playwright.
11. **Healthcheck en el contenedor de Postgres** y volumen nombrado persistente.
12. **CI/CD**: pipeline de lint + typecheck + build y despliegue a Vercel/Render.
13. **Manejo centralizado de errores** en el cliente (toasts) y loading skeletons.
14. **Rate limiting en login** (ej. `upstash-rate-limit`) y validación de contraseñas fuertes.
15. **Auditoría de precios**: registrar en bitácora cambios de precio en la carga masiva (detalle de difs).
16. **Accesibilidad**: contraste AA verificado, `aria-live` para integraciones de venta y navegación con teclado.

---

## 8. Cómo levantar el entorno

```powershell
# 1. Base de datos (Docker) - puerto 5433
docker compose up -d

# 2. Sincronizar + sembrar DB
cd packages/database
npx prisma db push
npx prisma db seed

# 3. Aplicación web
cd apps/web
npm run dev   # http://localhost:3000
```

Credenciales de prueba: **admin / admin123** · **cajera1 / cajera123**