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
npx prisma migrate deploy   # aplica las migraciones versionadas (crea/actualiza tablas)
npx prisma db seed   # inserta usuarios y catálogo de prueba
```

También disponible desde la raíz: `npm run db:deploy` y `npm run db:seed`.

> Desde la versión multi-negocio el esquema se gestiona con **migraciones** (`packages/database/prisma/migrations`). Para cambiar el esquema usa `npm run db:migrate` (genera la migración) en lugar de `db push`.

### 5.1. Actualizar una computadora que ya tenía el sistema

```powershell
git pull
npm install
npm run db:baseline
npm run db:generate
npm run dev
```

`npm run db:baseline` revisa la base y hace lo que haga falta **sin borrar datos**:

| Situación de la base | Qué hace |
|---|---|
| Ya usa migraciones | Aplica solo las pendientes (igual que `db:deploy`). |
| Vacía | Crea todas las tablas. |
| Creada con el método anterior (`db push`), con o sin tablas faltantes | Pide un respaldo; con `npm run db:baseline -- --sin-respaldo` agrega las tablas que falten, marca la migración inicial y aplica el resto. |

Si ves **"The database schema is not empty" (P3005)** o **"relation … does not exist" (P3018)** al hacer `db:deploy`, usa `db:baseline` en su lugar. Si una migración quedó a medias, restaura el respaldo y vuelve a correr `db:baseline`.

No ejecutes `db:seed` en una base que ya tiene datos.

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

> **Consola de plataforma (solo el dueño del sistema):** define `PLATAFORMA_TOKEN`
> (24+ caracteres) en `apps/web/.env`, reinicia y entra a **http://localhost:3000/plataforma**
> con esa clave. Ahí das de alta negocios con su giro (y catálogo de ejemplo),
> los suspendes/reactivas y restableces la contraseña de su administradora.
> Cuando hay más de un negocio, en `/login` hay que escribir el **código del negocio**
> (el de la semilla es `default`).

> Si el puerto `3000` está ocupado, ciérralo primero:
> ```powershell
> Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
> ```

### 6.1. Usar sin internet (instalar como aplicación)

El sistema es una **aplicación web instalable (PWA)**. Instalada, se abre con su propio icono y
sin barra del navegador, y **sigue cobrando aunque se caiga el internet**:

- Las ventas sin conexión se guardan en el equipo y se envían solas al volver la red
  (un aviso arriba dice cuántas hay en cola). No cierres sesión con ventas pendientes.
- El catálogo de productos se guarda en el equipo para buscar y cobrar sin red.
- Sin red **no** se pueden: dar de alta productos, asignar clientes o puntos a la venta,
  hacer devoluciones ni cortes. Todo eso requiere al servidor.

Cómo instalarla:

1. Abre el sistema en **Chrome o Edge** desde una dirección `https://` o `http://localhost`
   (el navegador no permite instalar ni trabajar sin red por `http` en la red local).
2. Pulsa **Instalar aplicación** en el menú (abajo, junto al Ayudante) o el icono de instalar
   en la barra de direcciones. En iPhone/iPad: Safari → Compartir → *Agregar a inicio*.
3. La parte sin conexión se activa en modo producción (`npm run build` y `npm run start`);
   en `npm run dev` la app funciona, pero no se guarda para usarse sin red.

### 6.2. Servidor local en la tienda (opcional)

Si la tienda pasa **días** sin internet, se puede correr el sistema completo en una PC del
negocio, igual que en esta guía: Docker con la base de datos + `npm run build` y `npm run start`.
Las cajas de la tienda entran por la red local a `http://<ip-de-esa-pc>:3000`. Esa instalación
es independiente: no se sincroniza con un servidor en la nube (sería un proyecto aparte).

### 6.3. Correo, soporte y avisos legales (antes de vender)

Todo es opcional y se configura en `apps/web/.env` (ver ejemplos en `apps/web/.env.example`):

| Para qué | Variables | Si no se definen |
|---|---|---|
| «¿Olvidaste tu contraseña?» por correo | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `CORREO_REMITENTE`, `URL_PUBLICA` | La pantalla de recuperación pide acudir a la administradora. En desarrollo el enlace aparece en la consola del servidor. |
| Contacto de soporte en el login y el Ayudante | `SOPORTE_WHATSAPP`, `SOPORTE_CORREO`, `SOPORTE_HORARIO` | No se muestra. |
| Datos del responsable en `/privacidad` y `/terminos` | `LEGAL_RESPONSABLE`, `LEGAL_DOMICILIO`, `LEGAL_CORREO` | Texto genérico. |

> El aviso de privacidad y los términos son **una plantilla**: revísalos con un abogado
> antes de vender. Están en `apps/web/lib/legal.ts`; si cambias el fondo, sube
> `VERSION_LEGAL` y cada dueño(a) los volverá a aceptar al entrar.

Cada usuario puede tener un **correo** (Configuración → Usuarios, icono de sobre) para
recuperar su contraseña sola. El enlace vale 1 hora, sirve una vez y cierra las sesiones
abiertas con la contraseña anterior.

**Entrar como soporte:** en la consola, ficha del negocio → *Entrar como soporte* abre una
sesión de 1 hora como su dueño(a), con un aviso visible y registrada en su bitácora. El dueño(a)
puede bloquearlo en Configuración → Seguridad y datos.

### 6.4. Respaldos

- **Del servidor (todos los negocios):** `npm run db:respaldo` guarda un `.dump` comprimido en
  `backups/` (o en `RESPALDOS_DIR`) y conserva los 14 más recientes. Usa `pg_dump` si está
  instalado o, si no, el del contenedor de Docker. Para hacerlo diario en Windows, una sola vez:
  ```powershell
  powershell -ExecutionPolicy Bypass -File packages\database\scripts\programar-respaldo.ps1 -Hora "23:30"
  ```
  Conviene que `RESPALDOS_DIR` sea una carpeta sincronizada (OneDrive, Google Drive) para tener
  una copia fuera de la computadora. En un hosting con base de datos administrada (Neon,
  Supabase, Railway…) activa además sus respaldos automáticos.
- **Restaurar** (borra lo actual y deja la base como en el respaldo):
  ```powershell
  cmd /c "docker exec -i papeleria-db pg_restore --clean --if-exists -U papeleria -d papeleria_db < backups\respaldo-papeleria_db-AAAAMMDD-HHMM.dump"
  ```
- **De cada negocio:** el dueño(a) descarga un Excel con productos, clientes, proveedores,
  ventas y usuarios en Configuración → Seguridad y datos → *Descargar respaldo*.

## 7. Correr las pruebas (opcional)

```powershell
cd apps/web
npm test   # pruebas unitarias (Vitest)
```

---

## Resolución de problemas frecuentes

- **`EADDRINUSE: address already in use :::3000`** → quedó un `next dev` anterior abierto; mátalo (paso 6) y reintenta.
- **`Error: listen EADDRINUSE` en otros puertos** → comprueba que no se superpongan `5433`, `3000`, `5050`.
- **`DATABASE_URL` apuntando al puerto por defecto** → recuerda: Docker expone `5433`.
- **`prisma migrate deploy` no conecta** → revisa que Docker esté arriba (`docker ps`) y que el contenedor esté sano.
- **`P3005: The database schema is not empty`** → la base se creó con `db push`; usa `npm run db:baseline` (sección 5.1).
- **`Could not find Prisma Schema`** → corre los comandos de Prisma desde la raíz con los alias `npm run db:*`, o desde `packages/database`.
- **Error de certificado SSL al hacer `git pull`/`git push` en Windows** → `git -c http.sslBackend=schannel pull`.
- **`Missing script: "dev"` en `packages/database`** → ejecuta siempre `npm run dev` desde la raíz (turbo usa el script `dev` de cada workspace), no desde la carpeta.
- **CSS sin estilos / página en HTML crudo** → verificó que el pipeline PostCSS esté presente (`apps/web/postcss.config.mjs`); reinstala con `npm install` si falta.