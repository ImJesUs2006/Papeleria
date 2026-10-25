// ============================================================
// Precios por volumen (mayoreo por escalas) — puro: servidor y carrito.
//
// Cada producto puede tener hasta 5 escalas: "desde N piezas, a $X c/u",
// con nombre opcional ("Paquete", "Caja"). El precio baja solo cuando la
// cantidad de la línea llega a la escala. El interruptor "Precio mayorista"
// del POS aplica el mejor precio disponible (la escala más baja o el
// precio de mayoreo clásico) sin importar la cantidad.
//
// El servidor recalcula SIEMPRE con estas mismas reglas: el carrito solo
// muestra el precio, nunca lo impone.
// ============================================================

export interface EscalaPrecio {
  /** Cantidad mínima (entera, ≥ 2) a partir de la cual aplica. */
  desde: number;
  /** Precio unitario en esa escala (menor al de menudeo). */
  precio: number;
  /** Nombre visible opcional: "Paquete", "Caja", "Media docena". */
  nombre?: string | null;
}

export const MAX_ESCALAS = 5;

const r2 = (n: number) => Math.round(n * 100) / 100;

export class EscalaError extends Error {}

/**
 * Valida las escalas capturadas. Reglas:
 *  - desde: entero entre 2 y 100 000, sin repetirse;
 *  - precio: > 0 y menor al precio de menudeo;
 *  - a más cantidad, precio igual o menor (no puede "subir" el precio);
 *  - máximo 5 escalas, nombre de hasta 30 caracteres.
 * Devuelve las escalas ordenadas por cantidad.
 */
export function validarEscalas(raw: unknown, precioMenudeo: number): EscalaPrecio[] {
  if (raw == null || raw === "") return [];
  if (!Array.isArray(raw)) throw new EscalaError("Las escalas de precio deben ser una lista");
  if (raw.length > MAX_ESCALAS) throw new EscalaError(`Máximo ${MAX_ESCALAS} escalas de precio por producto`);
  const escalas: EscalaPrecio[] = raw.map((e: any, i) => {
    const desde = Number(e?.desde);
    const precio = Number(e?.precio);
    const nombre = typeof e?.nombre === "string" ? e.nombre.trim().slice(0, 30) : "";
    const n = i + 1;
    if (!Number.isInteger(desde) || desde < 2 || desde > 100_000) {
      throw new EscalaError(`Escala ${n}: la cantidad mínima debe ser un entero entre 2 y 100,000`);
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      throw new EscalaError(`Escala ${n}: el precio debe ser mayor a cero`);
    }
    if (precio >= precioMenudeo) {
      throw new EscalaError(
        `Escala ${n}: el precio por volumen ($${r2(precio).toFixed(2)}) debe ser menor al de menudeo ($${r2(precioMenudeo).toFixed(2)})`
      );
    }
    return { desde, precio: r2(precio), ...(nombre ? { nombre } : {}) };
  });
  escalas.sort((a, b) => a.desde - b.desde);
  for (let i = 1; i < escalas.length; i++) {
    if (escalas[i].desde === escalas[i - 1].desde) {
      throw new EscalaError(`Hay dos escalas desde ${escalas[i].desde} piezas`);
    }
    if (escalas[i].precio > escalas[i - 1].precio) {
      throw new EscalaError(
        `A mayor cantidad el precio no puede subir: desde ${escalas[i].desde} cuesta más que desde ${escalas[i - 1].desde}`
      );
    }
  }
  return escalas;
}

/** Lectura tolerante de lo guardado (datos viejos o corruptos → sin escalas). */
export function leerEscalas(raw: unknown, precioMenudeo: number): EscalaPrecio[] {
  try {
    return validarEscalas(raw, precioMenudeo);
  } catch {
    return [];
  }
}

export interface ProductoConPrecios {
  precioUnitario: unknown;
  precioMayoreo?: unknown;
  escalasPrecio?: unknown;
}

/** Escala que aplica a `cantidad` (la de mayor "desde" que se alcanza). */
export function escalaAplicable(escalas: EscalaPrecio[], cantidad: number): EscalaPrecio | null {
  let aplica: EscalaPrecio | null = null;
  for (const e of escalas) if (cantidad >= e.desde) aplica = e;
  return aplica;
}

/** Siguiente escala que aún no se alcanza (para sugerir "lleva N y paga $X"). */
export function siguienteEscala(escalas: EscalaPrecio[], cantidad: number): EscalaPrecio | null {
  return escalas.find((e) => cantidad < e.desde) ?? null;
}

/**
 * Precio unitario que se cobra por `cantidad` piezas.
 * Menudeo → escala alcanzada → (cliente mayorista) el mejor precio.
 * Nunca devuelve 0 ni NaN, ni un precio mayor al de menudeo.
 */
export function precioPorCantidad(p: ProductoConPrecios, cantidad: number, esMayoreo = false): number {
  const menudeoRaw = Number(p.precioUnitario);
  const menudeo = Number.isFinite(menudeoRaw) && menudeoRaw > 0 ? menudeoRaw : 0;
  const escalas = leerEscalas(p.escalasPrecio, menudeo);
  // Sin precio de lista válido solo puede quedar el de mayoreo (o 0).
  let precio = menudeo > 0 ? menudeo : Infinity;
  const aplica = escalaAplicable(escalas, Number(cantidad) || 0);
  if (aplica) precio = Math.min(precio, aplica.precio);
  if (esMayoreo) {
    const mayoreo = Number(p.precioMayoreo);
    if (Number.isFinite(mayoreo) && mayoreo > 0) precio = Math.min(precio, mayoreo);
    if (escalas.length) precio = Math.min(precio, escalas[escalas.length - 1].precio);
  }
  return Number.isFinite(precio) ? r2(precio) : 0;
}

/** Texto corto para etiquetas y tarjetas: "12+ $4.00 · Caja 100+ $3.50". */
export function describirEscalas(escalas: EscalaPrecio[]): string {
  return escalas
    .map((e) => `${e.nombre ? `${e.nombre} ` : ""}${e.desde}+ $${e.precio.toFixed(2)}`)
    .join(" · ");
}
