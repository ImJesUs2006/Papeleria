# Informe Técnico del Sistema de Gestión para Papelería — v8

**Versión evaluada:** Iteración 8 (Fase 3 de evolución SaaS: Kardex inmutable y trazabilidad · CRM con Crédito de Tienda, puntos de fidelidad y abonos · Multi-caja con retiros parciales · **Sistema de temas de interfaz**)
**Fecha:** Septiembre 2026
**Stack:** Next.js 15.5.25 (App Router) · React 18.3 · Prisma 5 + PostgreSQL (Docker :5433) · Zustand · Framer Motion · Recharts · ExcelJS · Tailwind · Vitest · Turbo · GitHub Actions

> Complementa y actualiza `INFORME_SISTEMAv7.md`. La iteración 7 hizo el inventario auditable (kardex con signo), el crédito de tienda operativo con abonos a caja y los retiros parciales de la administradora; la 8 **da identidad visual configurable al sistema** reemplazando el color temático único por un **tema base** (`NEON | MINIMALISTA | BRUTALISTA | CORPORATIVO`) más un **color de acento** independiente, aplicado 100 % con tokens semánticos de Tailwind que cambian su valor CSS nativo según `data-theme`.

---

## 1. Resumen ejecutivo

La Fase 3 (v7) cubrió kardex inmutable, crédito de tienda y retiros parciales. La iteración 8 añade:

- **M5 — Sistema de temas:** se elimina `ConfiguracionNegocio.temaColor` y se introduce `temaBase` (enum `NEON | MINIMALISTA | BRUTALISTA | CORPORATIVO`, default `"NEON"`) + `colorAcento` (hex `#rrggbb`, default `#10b981`). `BrandTheme` inyecta `data-theme="<temaBase>"` en `<html>` y repinta `--neon-green`/`--marca-color`/`--color-accento` con el acento del negocio. Los tokens semánticos de Tailwind (`bg-app`, `bg-surface-400…900`, `text-gray-100/200/300`, `text-muted`, `shadow-card`, `shadow-neon/glow`) definen su valor en `globals.css`, que cambia según `data-theme`: **Minimalista** quita el fondo negro y las sombras brillantes (plano y claro, conserva el acento en botones principales), **Brutalista** usa blanco con bordes negros y sombra sólida, **Corporativo** luz profesional con capas suaves.

**Estado de verificación:** `lint` ✅ (2 warnings preexistentes en inventario) · `typecheck` ✅ · `npm test` ✅ **52/52** · `npm run build` ✅ (42 páginas + 42 rutas de API).

---

## 2. M5 — Sistema de temas de interfaz ✅

### 2.1 Esquema (constraint de ejecución respetado: solo schema → db push del usuario)
- `ConfiguracionNegocio` cambia `temaColor String @default("#10b981")` → `temaBase String @default("NEON")` + `colorAcento String @default("#10b981")`. Se editó **solo** `schema.prisma`, se validó (`prisma format` + `prisma validate` desde `packages/database`), y el usuario aplicó `npx prisma db push` antes de tocar lógica/UI.

### 2.2 Capa de dominio (`lib/business-types.ts` · `lib/validate-config.ts`)
- `TEMAS_BASE = { NEON: "Neón", MINIMALISTA: "Minimalista", BRUTALISTA: "Brutalista", CORPORATIVO: "Corporativo" }`, `type TemaBase`, `DEFAULT_TEMA_BASE = "NEON"`, `DEFAULT_COLOR_ACENTO = "#10b981"`.
- `BusinessConfig` exige `temaBase: TemaBase` y `colorAcento: string`. Zod (`BUSINESS_CONFIG_SCHEMA`) valida `temaBase` con `enum` y `colorAcento` con `^#[0-9a-fA-F]{6}$`, ambos con default. `normalizeConfig` (feature-flags) sanea cualquier fila legada con fallbacks seguros.

### 2.3 Aplicación global (SSR + runtime)
- `app/layout.tsx` pone el default `<html class="dark" data-theme="neon">` y `body bg-app` → **sin parpadeo** al arrancar en Neón.
- `components/brand-theme.tsx` (cliente): lee store → `setAttribute("data-theme", temaBase.toLowerCase())` (solo entre los 4 válidos) y aplica el acento como `--neon-green`/`--marca-color`/`--color-accento`. Así el **colorAcento re-pinta botones principales y acentos en cualquier tema**.

### 2.4 Tokens semánticos (Tailwind + CSS nativo)
- `tailwind.config.ts`: `app`/`acento`/`btn-ink`; `surface-400…900` y `surface-950` → `rgb(var(--surface-*-rgb) / <alpha-value>)`; `gray-100/200/300`, `muted` → variables; sombras `card/neon/neon-cyan/neon-magenta/glow/neon-glow/neon-inset` → `var(--shadow-*)`. **Se sustituyó `text-surface-900` → `text-btn-ink`** (tinta fija #0a0a0a para botones sobre acento) en los 37 usos, de modo que `--surface-900-rgb` puede invertirse libremente para fondos/clases de panel.
- `globals.css` define 4 bloques `:root[data-theme=…]`:
  - **neon:** `--bg-app #0a0a0a`, superficies `#111…`, tinta clara, sombras de neón (color-mix sobre `--neon-green`).
  - **minimalista:** `color-scheme: light`, `--bg-app #f4f5f7`, tarjetas `#fff`, tinta `#111…`, **todas las sombras `none`**.
  - **brutalista:** `#fff`/`#0a0a0a`, `--shadow-card: 5px 5px 0 #000`, sin brillos.
  - **corporativo:** fondos slate, sombra suave `0 1px 3px rgba(15,23,42,.08)`.
- `body` usa `var(--bg-app)` y `rgb(var(--gray-100-rgb))`; scrollbars siguen el tema. Se migraron los fondos de pantallas completas (`layout`, `login`, `setup`, `error`, `auth-guard`, `dashboard-layout`) de `bg-surface-900` → `bg-app`.

### 2.5 Configuración y resto del sistema
- `app/(dashboard)/configuracion/page.tsx` (Marca Blanca · Identidad): **selector de tema base** (4 botones Neón / Minimalista / Brutalista / Corporativo, activo resaltado con el acento) + **color de acento** (picker + swatches predefinidas). Guardar envía `temaBase` y `colorAcento`.
- `PUT /api/configuracion/negocio` y `POST /api/setup` persisten ambos campos (Zod-strict).
- `GET /api/reportes` usa `headerColor: config.colorAcento` para el encabezado del Excel (identidad de marca).
- Snapshots (`lib/snapshots.ts` + `tests/snapshots.test.ts`): la captura/restauración conserva `temaBase` y `colorAcento` (fixtures actualizados, 52/52 verde).

---

## 3. Verificación

`npm run typecheck` ✅ · `npm test` ✅ **52/52** · `npm run lint` ✅ (2 warnings preexistentes en inventario) · `npm run build` ✅ (42 páginas + 42 rutas).

## 4. Cómo probarlo manualmente

1. **Cambiar de tema:** *Configuración → Marca Blanca → Tema de la interfaz* → elegir **Minimalista** y *Guardar*. La app deja el fondo negro y las sombras brillantes: paneles planos y claros, texto legible, y los botones principales conservan el `colorAcento`.
2. **Acento en cualquier tema:** con Minimalista activo, cambiar *Color de acento* a p. ej. `#38bdf8` → los botones principales y acentos se repintan de azul.
3. **Brutalista / Corporativo:** repetir con los otros temas; Brutalista muestra sombra sólida `5px 5px 0 #000` y bordes negros.
4. **Snapshot:** capturar un estado, cambiar el tema, `Restablecer seguridad` con snapshot → vuelve el tema capturado.
5. **Excel:** en *Reportes → Inventario → descargar*, el encabezado usa `colorAcento`.

## 5. Notas, decisiones y deuda

- **`temaColor` se reemplaza, no coexiste:** la columna se eliminó del schema (el `db push` la descartó). Las instalaciones previas pierden el acento elegido y caen al default `#10b981`; basta re-guardar *Configuración* para fijarlo de nuevo.
- **`btn-ink` fijo:** el texto de los botones sobre acento es `#0a0a0a` fijo (antes `surface-900`); esto permite que la escala `surface-*` se invierta en los temas claros sin romper el contraste de los CTAs.
- **`color-scheme` condicional:** `dark` en neón, `light` en claros — los inputs de color/date del navegador se muestran correctos en cada tema.
- **Brillo solo en Neón:** por decisión de diseño, `shadow-neon*`/`glow` son `none` fuera de Neón excepto la sombra sólida del Brutalista y la suave del Corporativo.
- **Deuda:** el `data-theme` SSR asume Neón (default); un usuario que persista otro tema verá un breve flash de fondo oscuro al primer render del documento (no al navegar, gracias al atributo en `<html>`).