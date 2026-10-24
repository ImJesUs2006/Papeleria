import type { Prisma } from "@papeleria/database";
import { calcularArqueo } from "./cash";

type Db = Pick<Prisma.TransactionClient, "retiroEfectivo">;

interface SesionParaArqueo {
  idCaja: string;
  fondoInicial: unknown;
  totalVentasEfectivo: unknown;
  totalVentasDigital: unknown;
  totalRecargas: unknown;
  totalEgresos: unknown;
}

/** Lo que el sistema espera encontrar en la caja (efectivo, vouchers, recargas). */
export async function esperadosDeSesion(db: Db, sesion: SesionParaArqueo) {
  const retiros = await db.retiroEfectivo.aggregate({
    where: { idCaja: sesion.idCaja },
    _sum: { monto: true },
  });
  const a = calcularArqueo({
    fondoInicial: Number(sesion.fondoInicial),
    totalVentasEfectivo: Number(sesion.totalVentasEfectivo),
    totalVentasDigital: Number(sesion.totalVentasDigital),
    totalRecargas: Number(sesion.totalRecargas),
    totalEgresos: Number(sesion.totalEgresos) || 0,
    retirosEfectivo: Number(retiros._sum.monto ?? 0),
    efectivoDeclarado: 0,
    digitalDeclarado: 0,
    recargasDeclarado: 0,
  });
  return {
    esperadoEfectivo: a.esperadoEfectivo,
    esperadoDigital: a.esperadoDigital,
    esperadoRecargas: a.esperadoRecargas,
  };
}
