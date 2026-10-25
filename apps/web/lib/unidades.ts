// ============================================================
// Tipo de producto y unidades (Fase D) — puro: pantalla y servidor.
//
// Antes eran 4 casillas sueltas (granel, servicio, lotes, series) que se
// excluían entre sí sin decirlo. Ahora son dos preguntas:
//   1. ¿Cómo se vende?   pieza · a granel (kg, m, L…) · servicio
//   2. ¿Control extra?   ninguno · lotes con caducidad · serie por pieza · variantes
// y se traducen a las mismas banderas de siempre en la base de datos.
//
// Además, la unidad de COMPRA: "Paquete de 24 piezas". El pedido al
// proveedor se captura en paquetes y el inventario sube en piezas.
// ============================================================

export type ModoVenta = "PIEZA" | "GRANEL" | "SERVICIO";
export type ControlExtra = "NINGUNO" | "LOTES" | "SERIES" | "VARIANTES";

export interface BanderasTipo {
  permiteDecimales: boolean;
  esServicio: boolean;
  usaLotes: boolean;
  usaSeries: boolean;
}

export const MODOS_VENTA: Array<{ valor: ModoVenta; titulo: string; detalle: string; ejemplo: string }> = [
  { valor: "PIEZA", titulo: "Por pieza", detalle: "Se vende en unidades enteras.", ejemplo: "Cuaderno, refresco, taladro" },
  { valor: "GRANEL", titulo: "A granel", detalle: "Admite fracciones: kilos, metros, litros.", ejemplo: "Queso por kg, listón por metro" },
  { valor: "SERVICIO", titulo: "Servicio", detalle: "No lleva existencia ni inventario.", ejemplo: "Copias, impresión, recarga" },
];

export const CONTROLES_EXTRA: Array<{ valor: ControlExtra; titulo: string; detalle: string; ejemplo: string }> = [
  { valor: "NINGUNO", titulo: "Ninguno", detalle: "Solo se cuenta cuántas hay.", ejemplo: "Lo más común" },
  {
    valor: "LOTES",
    titulo: "Lotes con caducidad",
    detalle: "Cada entrega tiene su lote y fecha; se vende primero lo que caduca antes.",
    ejemplo: "Medicamento, alimentos",
  },
  {
    valor: "SERIES",
    titulo: "Serie por pieza",
    detalle: "Cada pieza tiene su número; al vender se indica cuál (garantías).",
    ejemplo: "Calculadora, taladro",
  },
  {
    valor: "VARIANTES",
    titulo: "Variantes",
    detalle: "Un modelo en varias tallas, colores o medidas; cada combinación lleva su existencia.",
    ejemplo: "Playera CH/M/G, tornillo 1/4 y 3/8",
  },
];

/** Unidades de venta a granel sugeridas. */
export const UNIDADES_GRANEL = ["kg", "g", "m", "cm", "L", "ml"] as const;
/** Unidades de compra sugeridas (texto libre permitido). */
export const UNIDADES_COMPRA = ["Paquete", "Caja", "Bulto", "Docena", "Display", "Rollo", "Costal"] as const;

export const MAX_PIEZAS_POR_UNIDAD = 10_000;

export class UnidadError extends Error {}

/** Controles extra que tienen sentido para cada forma de venta. */
export function controlesPermitidos(modo: ModoVenta, lotesSeries = true): ControlExtra[] {
  if (modo === "SERVICIO") return ["NINGUNO"];
  if (!lotesSeries) return ["NINGUNO"];
  // Una serie es una pieza: no existe "medio taladro con serie".
  if (modo === "GRANEL") return ["NINGUNO", "LOTES", "VARIANTES"];
  return ["NINGUNO", "LOTES", "SERIES", "VARIANTES"];
}

/** Banderas de la base de datos → las dos preguntas. */
export function tipoDeProducto(p: Partial<BanderasTipo> & { grupoVariante?: string | null }): {
  modo: ModoVenta;
  control: ControlExtra;
} {
  const modo: ModoVenta = p.esServicio ? "SERVICIO" : p.permiteDecimales ? "GRANEL" : "PIEZA";
  const control: ControlExtra =
    modo === "SERVICIO"
      ? "NINGUNO"
      : p.usaSeries && modo === "PIEZA"
        ? "SERIES"
        : p.usaLotes
          ? "LOTES"
          : p.grupoVariante
            ? "VARIANTES"
            : "NINGUNO";
  return { modo, control };
}

/** Las dos preguntas → banderas (siempre consistentes entre sí). */
export function banderasDeTipo(modo: ModoVenta, control: ControlExtra): BanderasTipo {
  const permitido = controlesPermitidos(modo).includes(control) ? control : "NINGUNO";
  return {
    permiteDecimales: modo === "GRANEL",
    esServicio: modo === "SERVICIO",
    usaLotes: permitido === "LOTES",
    usaSeries: permitido === "SERIES",
  };
}

/** ¿El stock se captura a mano en el alta? (lotes y series entran por su registro). */
export function stockSeCapturaDirecto(modo: ModoVenta, control: ControlExtra): boolean {
  return modo !== "SERVICIO" && control !== "LOTES" && control !== "SERIES";
}

/** Valida la unidad de compra: sin nombre = pieza (factor 1). */
export function validarUnidadCompra(raw: { unidadCompra?: unknown; piezasPorUnidad?: unknown }): {
  unidadCompra: string | null;
  piezasPorUnidad: number;
} {
  const nombre = typeof raw.unidadCompra === "string" ? raw.unidadCompra.trim().slice(0, 20) : "";
  const factorRaw = raw.piezasPorUnidad == null || raw.piezasPorUnidad === "" ? 1 : Number(raw.piezasPorUnidad);
  if (!Number.isInteger(factorRaw) || factorRaw < 1 || factorRaw > MAX_PIEZAS_POR_UNIDAD) {
    throw new UnidadError(`Las piezas por unidad de compra deben ser un entero entre 1 y ${MAX_PIEZAS_POR_UNIDAD.toLocaleString("es-MX")}`);
  }
  if (!nombre || nombre.toLowerCase() === "pieza") {
    if (factorRaw !== 1) throw new UnidadError("Indica cómo se llama la unidad de compra (Paquete, Caja…)");
    return { unidadCompra: null, piezasPorUnidad: 1 };
  }
  if (factorRaw === 1) {
    throw new UnidadError(`¿Cuántas piezas trae cada ${nombre.toLowerCase()}? Debe ser más de 1`);
  }
  return { unidadCompra: nombre, piezasPorUnidad: factorRaw };
}

/** Unidad de venta a granel: kg, m, L… (null = pieza). */
export function validarUnidadVenta(raw: unknown, granel: boolean): string | null {
  if (!granel) return null;
  const u = typeof raw === "string" ? raw.trim().slice(0, 10) : "";
  return u || "kg";
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Piezas que entran al inventario al recibir `cantidad` unidades de compra. */
export function piezasDe(cantidadUnidades: number, piezasPorUnidad: number): number {
  return cantidadUnidades * Math.max(1, Math.trunc(piezasPorUnidad) || 1);
}

/** Costo de una pieza a partir del costo de la unidad de compra. */
export function costoPorPieza(costoUnidad: number, piezasPorUnidad: number): number {
  return r4(costoUnidad / Math.max(1, Math.trunc(piezasPorUnidad) || 1));
}

/** "Paquete de 24 piezas" · "Pieza". */
export function describirUnidadCompra(unidad: string | null | undefined, piezas: number | null | undefined): string {
  const n = Math.max(1, Math.trunc(Number(piezas)) || 1);
  if (!unidad || n === 1) return "Pieza";
  return `${unidad} de ${n} piezas`;
}

/** "paquetes" / "paquete" para mostrar cantidades de compra. */
export function nombreUnidadCompra(unidad: string | null | undefined, cantidad: number): string {
  const base = (unidad || "Pieza").toLowerCase();
  if (cantidad === 1) return base;
  return /[aeiou]$/.test(base) ? `${base}s` : `${base}es`;
}
