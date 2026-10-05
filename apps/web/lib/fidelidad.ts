// ============================================================
// Fidelización (Fase 12): Puntos Monedero y nivel de cliente.
// Funciones puras y testeables, usadas por el servidor (sales,
// clientes, returns) y por el cliente (POS / tarjeta virtual).
// ============================================================

/** Monto histórico a partir del cual un cliente es MAYOREO. */
export const MAYOREO_MIN_PESOS = 2000;

export const NIVEL_CLIENTE = {
  MENUDEO: "MENUDEO",
  MAYOREO: "MAYOREO",
} as const;
export type NivelCliente = keyof typeof NIVEL_CLIENTE;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Nivel por historial de compras: MAYOREO si acumula ≥ $2000. */
export function calcularNivel(montoHistorico: number): NivelCliente {
  const monto = Number.isFinite(Number(montoHistorico)) ? Number(montoHistorico) : 0;
  return monto >= MAYOREO_MIN_PESOS ? "MAYOREO" : "MENUDEO";
}

/**
 * Puntos que GANA una venta: 1 punto por cada `pesosCompraPorPunto`
 * pesos del total. Los canjes (PUNTOS_MONEDERO) no generan puntos.
 */
export function puntosGanadosPorCompra(
  totalNeto: number,
  pesosCompraPorPunto: number
): number {
  const peso = Number.isFinite(pesosCompraPorPunto) && pesosCompraPorPunto > 0
    ? pesosCompraPorPunto
    : 100;
  const total = Number.isFinite(totalNeto) ? Math.max(totalNeto, 0) : 0;
  return Math.floor(total / peso);
}

/**
 * Puntos que se necesitan para CANJEAR `totalNeto`: cada punto cubre
 * `valorPuntoPesos` pesos (se redondea hacia arriba para no perder dinero).
 */
export function puntosRequeridos(totalNeto: number, valorPuntoPesos: number): number {
  const valor = Number.isFinite(valorPuntoPesos) && valorPuntoPesos > 0
    ? valorPuntoPesos
    : 1;
  const total = Number.isFinite(totalNeto) ? Math.max(totalNeto, 0) : 0;
  return Math.ceil(total / valor);
}

/** Valor en pesos del saldo de puntos disponible. */
export function equivalenciaPuntos(
  puntos: number | null | undefined,
  valorPuntoPesos = 1
): number {
  const pts = Number.isFinite(Number(puntos)) ? Math.max(Number(puntos), 0) : 0;
  const valor = Number.isFinite(Number(valorPuntoPesos)) && Number(valorPuntoPesos) > 0
    ? Number(valorPuntoPesos)
    : 1;
  return round2(pts * valor);
}

/** ¿El saldo de puntos alcanza para cubrir el total de la venta? */
export function puntosAlcanzan(
  totalNeto: number,
  puntos: number | null | undefined,
  valorPuntoPesos = 1
): boolean {
  const total = Number.isFinite(Number(totalNeto)) ? Number(totalNeto) : 0;
  return equivalenciaPuntos(puntos, valorPuntoPesos) >= total;
}