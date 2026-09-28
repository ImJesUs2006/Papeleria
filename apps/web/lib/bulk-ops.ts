// ============================================================
// Operaciones masivas sobre productos (Fase 10): ajuste de precio
// en lote y baja múltiple. Funciones PURAS para poder testearlas
// con Vitest sin tocar la base de datos.
// ============================================================

export const AJUSTE_PORCENTAJE_MIN = -100;
export const AJUSTE_PORCENTAJE_MAX = 2000;
export const AJUSTE_MONTO_MAX = 999999;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export type TipoAjuste = "PORCENTAJE" | "MONTO_FIJO";

/** Especificación de un ajuste de precio en lote (porcentaje o monto fijo). */
export interface AjustePrecioSpec {
  tipo: TipoAjuste;
  valor: number;
}

/**
 * Aplica un porcentaje (+/-) a un precio de venta con redondeo a 2
 * decimales. Nunca devuelve negativo. @param porcentaje -100..2000.
 */
export function aplicarAjustePrecio(precio: number, porcentaje: number): number {
  const ajustado = round2(precio * (1 + porcentaje / 100));
  return Math.max(0, ajustado);
}

/**
 * Aplica un monto FIJO (+/-) en pesos/$ al precio de venta con redondeo a
 * 2 decimales. Nunca devuelve negativo.
 */
export function aplicarAjusteMontoFijo(precio: number, monto: number): number {
  return Math.max(0, round2(precio + monto));
}

/** Normaliza un parámetro numérico o de objeto a una especificación válida. */
function normalizarSpec(entry: AjustePrecioSpec | number): AjustePrecioSpec {
  if (typeof entry === "number") return { tipo: "PORCENTAJE", valor: entry };
  const spec = entry as AjustePrecioSpec;
  if (spec?.tipo !== "MONTO_FIJO" && spec?.tipo !== "PORCENTAJE") {
    throw new Error("Tipo de ajuste inválido (PORCENTAJE | MONTO_FIJO)");
  }
  return { tipo: spec.tipo, valor: Number(spec.valor) };
}

function validarSpec(spec: AjustePrecioSpec): void {
  if (!Number.isFinite(spec.valor)) {
    throw new Error("El valor del ajuste debe ser numérico");
  }
  if (spec.tipo === "PORCENTAJE") {
    if (spec.valor < AJUSTE_PORCENTAJE_MIN || spec.valor > AJUSTE_PORCENTAJE_MAX) {
      throw new Error(
        `El porcentaje debe estar entre ${AJUSTE_PORCENTAJE_MIN} y ${AJUSTE_PORCENTAJE_MAX}`
      );
    }
    return;
  }
  if (Math.abs(spec.valor) > AJUSTE_MONTO_MAX) {
    throw new Error(`El monto fijo debe estar entre -${AJUSTE_MONTO_MAX} y ${AJUSTE_MONTO_MAX}`);
  }
}

export interface ProductoParaAjuste {
  codigoItem: string;
  precioUnitario: number;
  precioCompra: number | null;
}

export interface AjusteAplicado {
  codigoItem: string;
  precioAnterior: number;
  precioNuevo: number;
}

export interface AjusteOmitido {
  codigoItem: string;
  motivo: string;
}

export interface ResultadoAjuste {
  aplicados: AjusteAplicado[];
  omitidos: AjusteOmitido[];
}

/**
 * Calcula el ajuste de precio de un lote respetando la invariante del
 * negocio: el precio de venta nunca baja del precio de compra. Los
 * productos que violarían esa regla se omiten con un motivo.
 * Acepta `numero` (porcentaje, retrocompatible) u `{ tipo, valor }`.
 */
export function calcularAjustePrecios(
  productos: ProductoParaAjuste[],
  parametro: AjustePrecioSpec | number
): ResultadoAjuste {
  const spec = normalizarSpec(parametro);
  validarSpec(spec);

  const aplicados: AjusteAplicado[] = [];
  const omitidos: AjusteOmitido[] = [];

  for (const p of productos) {
    const nuevo =
      spec.tipo === "MONTO_FIJO"
        ? aplicarAjusteMontoFijo(p.precioUnitario, spec.valor)
        : aplicarAjustePrecio(p.precioUnitario, spec.valor);
    if (p.precioCompra != null && nuevo < p.precioCompra) {
      omitidos.push({
        codigoItem: p.codigoItem,
        motivo: `El precio de venta no puede quedar menor al de compra ($${p.precioCompra.toFixed(
          2
        )})`,
      });
      continue;
    }
    if (nuevo === p.precioUnitario) {
      omitidos.push({ codigoItem: p.codigoItem, motivo: "Sin cambio" });
      continue;
    }
    aplicados.push({
      codigoItem: p.codigoItem,
      precioAnterior: p.precioUnitario,
      precioNuevo: nuevo,
    });
  }

  return { aplicados, omitidos };
}

/** Valida un arreglo de códigos para operaciones masivas. */
export function validarCodigosSeleccion(
  codigos: unknown,
  max = 500
): { ok: true; codigos: string[] } | { ok: false; error: string } {
  if (!Array.isArray(codigos) || codigos.length === 0) {
    return { ok: false, error: "Selecciona al menos un producto" };
  }
  if (codigos.length > max) {
    return { ok: false, error: `Máximo ${max} productos por operación` };
  }
  const unicos = [...new Set(codigos.map((c) => String(c).trim()).filter(Boolean))];
  if (unicos.length === 0) {
    return { ok: false, error: "Códigos de producto inválidos" };
  }
  return { ok: true, codigos: unicos };
}