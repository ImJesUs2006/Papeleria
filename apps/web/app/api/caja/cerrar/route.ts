import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { calcularArqueo, round2 } from "@/lib/cash";

// ============================================================
// POST /api/caja/cerrar
// CONCLUYE el corte ciego iniciado por /cerrar/iniciar.
//
// Flujo de confianza:
//   1. La caja debe estar EN_CIERRE con el token expedido.
//   2. La cajera declara SOLO lo físico: efectivo contado, vouchers
//      (terminal/transferencia) y recargas. El sistema NO le mostró
//      antes lo esperado (corte ciego).
//   3. El servidor calcula el descuadre y lo persiste en la sesión
//      y en bitácora (faltante positivo / sobrante negativo).
//   4. La respuesta con totales esperados se emite DESPUÉS de cerrar.
// ============================================================

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const cierreToken = typeof body.cierreToken === "string" ? body.cierreToken : "";
  if (!cierreToken) {
    return NextResponse.json({ error: "Falta token de cierre" }, { status: 400 });
  }

  const efectivoContado = Number(body.efectivoContado);
  const vouchersContado = Number(body.vouchersContado ?? 0);
  const recargasContado = Number(body.recargasContado ?? 0);

  if (
    !Number.isFinite(efectivoContado) ||
    efectivoContado < 0 ||
    !Number.isFinite(vouchersContado) ||
    vouchersContado < 0 ||
    !Number.isFinite(recargasContado) ||
    recargasContado < 0
  ) {
    return NextResponse.json({ error: "Monto contado inválido" }, { status: 400 });
  }

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "EN_CIERRE", cierreToken },
    });

    if (!sesion) {
      return NextResponse.json(
        { error: "No hay un corte ciego abierto con ese token; re-inicia el corte" },
        { status: 409 }
      );
    }

    const arqueo = calcularArqueo({
      fondoInicial: Number(sesion.fondoInicial),
      totalVentasEfectivo: Number(sesion.totalVentasEfectivo),
      totalVentasDigital: Number(sesion.totalVentasDigital),
      totalRecargas: Number(sesion.totalRecargas),
      totalEgresos: Number(sesion.totalEgresos) || 0,
      efectivoDeclarado: efectivoContado,
      digitalDeclarado: vouchersContado,
      recargasDeclarado: recargasContado,
    });

    const notasCierre = [
      body.notas ? String(body.notas) : "",
      arqueo.descuadre
        ? `DESCUADRE de $${round2(Math.abs(arqueo.diferenciaTotal)).toFixed(2)} (${
            arqueo.diferenciaTotal > 0 ? "FALTANTE" : "SOBRANTE"
          })`
        : "Sin descuadre",
      `Efectivo: esperado ${round2(arqueo.esperadoEfectivo).toFixed(2)} / contado ${round2(
        arqueo.declaradoEfectivo
      ).toFixed(2)}`,
      `Vouchers: esperado ${round2(arqueo.esperadoDigital).toFixed(2)} / contado ${round2(
        arqueo.declaradoDigital
      ).toFixed(2)}`,
      `Recargas: esperado ${round2(arqueo.esperadoRecargas).toFixed(2)} / contado ${round2(
        arqueo.declaradoRecargas
      ).toFixed(2)}`,
    ]
      .filter(Boolean)
      .join(" | ");

    const cerrada = await prisma.$transaction(async (tx) => {
      const cierre = await tx.sesionCaja.update({
        where: { idCaja: sesion.idCaja },
        data: {
          estado: "CERRADA",
          horaCierre: new Date(),
          notasCierre: notasCierre || null,
          efectivoContado: round2(efectivoContado),
          vouchersContado: round2(vouchersContado),
          recargasContado: round2(recargasContado),
          faltanteTotal: round2(arqueo.diferenciaTotal),
          descuadre: arqueo.descuadre,
        },
      });

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Cierre de caja ${sesion.idCaja} ${
            arqueo.descuadre
              ? `con DESCUADRE de ${round2(arqueo.diferenciaTotal).toFixed(2)}`
              : "sin descuadre"
          }`,
          moduloSistema: "CAJA",
          jsonPayload: {
            cierreToken,
            efectivoContado,
            vouchersContado,
            recargasContado,
            esperadoEfectivo: arqueo.esperadoEfectivo,
            esperadoDigital: arqueo.esperadoDigital,
            esperadoRecargas: arqueo.esperadoRecargas,
            diferenciaTotal: arqueo.diferenciaTotal,
          },
        },
      });

      return cierre;
    });

    return NextResponse.json({
      cierre: {
        idCaja: cerrada.idCaja,
        estado: cerrada.estado,
        horaCierre: cerrada.horaCierre,
        descuadre: arqueo.descuadre,
      },
      arqueo,
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al cerrar la caja" }, { status: 500 });
  }
}