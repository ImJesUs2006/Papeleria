# Papelería — Sistema de Gestión

SaaS de gestión integral para una papelería: **Punto de Venta (POS)** con lector de códigos de barras, **caja** con arqueo, **inventario** (carga masiva Excel + etiquetas QR/código de barras + edición rápida), **proveedores y pedidos** con calendario de entregas, **reportes** exportables a Excel, **dashboard** con métricas y **bitácora** de auditoría.

**Stack:** Next.js 14 (App Router) · Prisma + PostgreSQL (Docker) · TurboRepo · Tailwind · Zustand · Recharts · Vitest

---

## Instalación desde cero (repo clonado)

Sigue la guía completa en **[`docs/GUIA_INSTALACION.md`](docs/GUIA_INSTALACION.md)**. Resumen:

```powershell
git clone <URL-del-repo> Papeleria
cd Papeleria
npm install

# 1) Credenciales de Docker (OBLIGATORIO, docker-compose las exige)
Copy-Item .env.example .env   # edita las contraseñas

# 2) Base de datos (Docker, puerto 5433)
docker compose up -d

# 3) Crear .env de la app y de prisma (usa la MISMA contraseña del paso 1)
#    apps/web/.env.example          → apps/web/.env
#    packages/database/.env.example → packages/database/.env

# 4) Esquema + datos de prueba
cd packages/database
npx prisma db push
npx prisma db seed

# 5) Aplicación
cd ../..
npm run dev        # http://localhost:3000
```

> **Importante:** `docker-compose.yml` no trae contraseñas hardcodeadas; lee las variables de `POSTGRES_PASSWORD` y `PGADMIN_DEFAULT_PASSWORD` del archivo `.env` de la raíz y **falla si no existen**. Usa la misma contraseña en el `DATABASE_URL` de `apps/web/.env` y `packages/database/.env`.

**Usuarios de prueba:** `admin / admin123` (ADMINISTRADORA) · `cajera1 / cajera123` (CAJERA)

**Pruebas:** `cd apps/web; npm test` (11 tests Vitest)

---

## Documentación

- [`docs/GUIA_INSTALACION.md`](docs/GUIA_INSTALACION.md) — paso a paso para alguien nuevo.
- [`docs/INFORME_SISTEMAv9.md`](docs/INFORME_SISTEMAv9.md) — arquitectura de la iteración 9.
- [`docs/INFORME_SISTEMAv8.md`](docs/INFORME_SISTEMAv8.md) — arquitectura de la iteración 8.
- [`docs/INFORME_SISTEMAv7.md`](docs/INFORME_SISTEMAv7.md) — arquitectura de la iteración 7.
- [`docs/INFORME_SISTEMAv6.md`](docs/INFORME_SISTEMAv6.md) — arquitectura de la iteración 6.
- [`docs/INFORME_SISTEMAv5.md`](docs/INFORME_SISTEMAv5.md) — arquitectura de la iteración 5.
- [`docs/INFORME_SISTEMAv4.md`](docs/INFORME_SISTEMAv4.md) — arquitectura de la iteración 4.
- [`docs/INFORME_SISTEMAv3.md`](docs/INFORME_SISTEMAv3.md) — arquitectura de la iteración 3.
- [`docs/INFORME_SISTEMAv2.md`](docs/INFORME_SISTEMAv2.md) — arquitectura de la iteración 2 .
- [`docs/INFORME_SISTEMAv1.md`](docs/INFORME_SISTEMAv1.md) — auditoría de la iteración 1.
