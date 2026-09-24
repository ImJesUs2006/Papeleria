export const round2 = (n: number): number => {
  const escalado = n * 100;
  const redondeado = Math.trunc(escalado + (escalado >= 0 ? 0.5 : -0.5));
  return redondeado / 100;
};

export interface ArqueoInput {
  fondoInicial: number;
  totalVentasEfectivo: number;
  totalVentasDigital: number;
  totalRecargas: number;
  /** Salidas de efectivo de la caja (reembolsos, abonos a proveedores). */
  totalEgresos?: number;
  /** Retiros parciales de la caja (Fase 3): se restan del efectivo esperado. */
  retirosEfectivo?: number;
  efectivoDeclarado: number;
  digitalDeclarado: number;
  recargasDeclarado: number;
}

export interface ArqueoResult {
  esperadoEfectivo: number;
  esperadoDigital: number;
  esperadoRecargas: number;
  declaradoEfectivo: number;
  declaradoDigital: number;
  declaradoRecargas: number;
  /** Positivo = faltante en caja; negativo = sobrante. */
  faltanteEfectivo: number;
  faltanteDigital: number;
  faltanteRecargas: number;
  totalEsperado: number;
  totalDeclarado: number;
  diferenciaTotal: number;
  descuadre: boolean;
}

const EPSILON = 0.01;

/**
 * Arqueo de caja: cruza los montos físicos declarados por la cajera
 * contra los calculados por el sistema a partir de la sesión.
 * - El efectivo esperado = fondoInicial + ventas en efectivo − egresos de efectivo.
 * - El digital esperado = ventas con tarjeta/digital.
 * - Las recargas esperadas = total de recargas telefónicas.
 */
export function calcularArqueo(input: ArqueoInput): ArqueoResult {
  const egresos = input.totalEgresos ?? 0;
  const retiros = input.retirosEfectivo ?? 0;
  const esperadoEfectivo = round2(
    input.fondoInicial + input.totalVentasEfectivo - egresos - retiros
  );
  const esperadoDigital = round2(input.totalVentasDigital);
  const esperadoRecargas = round2(input.totalRecargas);

  const faltanteEfectivo = round2(esperadoEfectivo - input.efectivoDeclarado);
  const faltanteDigital = round2(esperadoDigital - input.digitalDeclarado);
  const faltanteRecargas = round2(esperadoRecargas - input.recargasDeclarado);

  const totalEsperado = round2(esperadoEfectivo + esperadoDigital + esperadoRecargas);
  const totalDeclarado = round2(
    input.efectivoDeclarado + input.digitalDeclarado + input.recargasDeclarado
  );
  const diferenciaTotal = round2(totalEsperado - totalDeclarado);

  return {
    esperadoEfectivo,
    esperadoDigital,
    esperadoRecargas,
    declaradoEfectivo: input.efectivoDeclarado,
    declaradoDigital: input.digitalDeclarado,
    declaradoRecargas: input.recargasDeclarado,
    faltanteEfectivo,
    faltanteDigital,
    faltanteRecargas,
    totalEsperado,
    totalDeclarado,
    diferenciaTotal,
    descuadre: Math.abs(diferenciaTotal) > EPSILON,
  };
}