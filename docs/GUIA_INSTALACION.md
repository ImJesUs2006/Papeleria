# Guía de instalación desde cero (repositorio clonado)

Pasos para que **una persona nueva** levante el sistema completo en su máquina, partiendo de un `git clone` vacío.

Requisitos previos:
- **Node.js 18+** y **npm** (probado con npm 10)
- **Docker Desktop** en ejecución (para la base de datos PostgreSQL)
- Opcional: **Git** para clonar

---

## 1. Clonar el repositorio

```powershell
git clone <URL-del-repo> Papeleria
cd Papeleria
```

## 2. Instalar dependencias (monorepo)

Instala una sola vez desde la raíz; npm enlaza los workspaces `apps/web` y `packages/database`.

```powershell
npm install
```

## 3. Crear los archivos de entorno

El sistema usa **tres archivos `.env`** (uno por capa). `docker-compose.yml` ya no trae contraseñas fijas: lee del `.env` de la raíz y **falla si no defines `POSTGRES_PASSWORD` y `PGADMIN_DEFAULT_PASSWORD`**.

### 3.1. `.env` de la raíz (Docker) — obligatorio

```powershell
Copy-Item .env.example .env
```

Ábrelo y edita al menos las contraseñas:

```dotenv
POSTGRES_USER="papeleria"
POSTGRES_PASSWORD="cambia-esta-contrasena"
POSTGRES_DB="papeleria_db"
POSTGRES_PORT="5433"

PGADMIN_DEFAULT_EMAIL="admin@papeleria.local"
PGADMIN_DEFAULT_PASSWORD="cambia-este-password-admin"
PGADMIN_PORT="5050"
```

### 3.2. `.env` de la aplicación y de Prisma

Copia los modelos de cada paquete y usa **la misma contraseña del paso 3.1** en el `DATABASE_URL`:

```powershell
Copy-Item packages\database\.env.example packages\database\.env
Copy-Item apps\web\.env.example apps\web\.env
```

El puerto `5433` (configurado vía `POSTGRES_PORT`) es **intencional**: coincide con el contenedor, ya que el PostgreSQL local de Windows u otras apps suelen ocupar el `5432`.

**`apps/web/.env`**
```dotenv
DATABASE_URL="postgresql://papeleria:cambia-esta-contrasena@localhost:5433/papeleria_db?schema=public"
JWT_SECRET="cambia-este-secreto-jwt"
JWT_EXPIRES_IN="8h"
NEXTAUTH_URL="http://localhost:3000"
NODE_ENV="development"
```

**`packages/database/.env`**
```dotenv
DATABASE_URL="postgresql://papeleria:cambia-esta-contrasena@localhost:5433/papeleria_db?schema=public"
```

> `JWT_SECRET` se lee en `apps/web/lib/jwt.ts`. Para cualquier entorno que no sea desarrollo, **cámbialo por un valor aleatorio** (ej. `openssl rand -base64 48`). Ninguno de estos archivos se sube al repositorio: el `.gitignore` ignora `.env`.

## 4. Levantar la base de datos (Docker)

Desde la raíz:

```powershell
docker compose up -d
```

Esto inicia dos contenedores (primera vez descarga imágenes, tarda unos minutos):
- `papeleria-db` → PostgreSQL 16 expuesto en el host **`localhost:5433`** (configurable con `POSTGRES_PORT`).
- `papeleria-pgadmin` → panel web en **`http://localhost:5050`** (configurable con `PGADMIN_PORT`; acceso con `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` del `.env`).

> Si olvidaste crear el `.env` de la raíz, el comando **falla** con un mensaje indicando que definas `POSTGRES_PASSWORD` y `PGADMIN_DEFAULT_PASSWORD` (es intencional, para no esconder credenciales).

Verifica que el contenedor de la BD esté sano:

```powershell
docker ps --filter name=papeleria-db
```

## 5. Sincronizar el esquema y sembrar datos

Desde `packages/database` (o con los alias de turbo desde la raíz):

```powershell
cd packages/database
npx prisma db push   # crea/actualiza tablas y coerce el cliente Prisma
npx prisma db seed   # inserta usuarios y catálogo de prueba
```

También disponible desde la raíz: `npm run db:push` y `npm run db:seed`.

**Usuarios de prueba** creados por el seed:

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `admin123` | ADMINISTRADORA |
| `cajera1` | `cajera123` | CAJERA |

## 6. Arrancar la aplicación

Desde la **raíz** (turbo corre ambos paquetes en paralelo):

```powershell
npm run dev
```

Abre **http://localhost:3000** y entra con `admin / admin123`.

> Si el puerto `3000` está ocupado, ciérralo primero:
> ```powershell
> Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
> ```

## 7. Correr las pruebas (opcional)

```powershell
cd apps/web
npm test   # 11 pruebas Vitest (transacciones de venta + arqueo de caja)
```

---

## Resolución de problemas frecuentes

- **`EADDRINUSE: address already in use :::3000`** → quedó un `next dev` anterior abierto; mátalo (paso 6) y reintenta.
- **`Error: listen EADDRINUSE` en otros puertos** → comprueba que no se superpongan `5433`, `3000`, `5050`.
- **`DATABASE_URL` apuntando al puerto por defecto** → recuerda: Docker expone `5433`.
- **`prisma db push` no conecta** → revisa que Docker esté arriba (`docker ps`) y que el contenedor esté sano.
- **`Missing script: "dev"` en `packages/database`** → ejecuta siempre `npm run dev` desde la raíz (turbo usa el script `dev` de cada workspace), no desde la carpeta.
- **CSS sin estilos / página en HTML crudo** → verificó que el pipeline PostCSS esté presente (`apps/web/postcss.config.mjs`); reinstala con `npm install` si falta.