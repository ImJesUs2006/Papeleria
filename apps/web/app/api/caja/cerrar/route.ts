import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { calcularArqueo, round2 } from "@/lib/cash";

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

  const efectivoDeclarado = Number(body.efectivoDeclarado);
  const digitalDeclarado = Number(body.digitalDeclarado ?? 0);
  const recargasDeclarado = Number(body.recargasDeclarado ?? 0);

  if (!Number.isFinite(efectivoDeclarado) || efectivoDeclarado < 0) {
    return NextResponse.json(
      { error: "Monto de efectivo declarado inválido" },
      { status: 400 }
    );
  }

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
    });

    if (!sesion) {
      return NextResponse.json(
        { error: "No hay una caja abierta" },
        { status: 409 }
      );
    }

    const arqueo = calcularArqueo({
      fondoInicial: Number(sesion.fondoInicial),
      totalVentasEfectivo: Number(sesion.totalVentasEfectivo),
      totalVentasDigital: Number(sesion.totalVentasDigital),
      totalRecargas: Number(sesion.totalRecargas),
      efectivoDeclarado,
      digitalDeclarado,
      recargasDeclarado,
    });

    const notasCierre = [
      body.notas ?? "",
      arqueo.descuadre
        ? `DESCUADRE detectado: diferencia de $${arqueo.diferenciaTotal.toFixed(2)}`
        : "Sin descuadre",
      arqueo.faltanteEfectivo !== 0
        ? `Efectivo: $${arqueo.faltanteEfectivo.toFixed(2)}`
        : "",
      arqueo.faltanteDigital !== 0
        ? `Digital: $${arqueo.faltanteDigital.toFixed(2)}`
        : "",
      arqueo.faltanteRecargas !== 0
        ? `Recargas: $${arqueo.faltanteRecargas.toFixed(2)}`
        : "",
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
        },
      });

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Cierre de caja ${sesion.idCaja}: total declarado $${round2(
            arqueo.totalDeclarado
          )}, ${arqueo.descuadre ? "con DESCUADRE" : "sin descuadre"}`,
          moduloSistema: "CAJA",
          jsonPayload: JSON.parse(JSON.stringify({ arqueo })),
        },
      });

      return cierre;
    });

    return NextResponse.json({
      cierre: cerrada,
      arqueo,
      descuadre: arqueo.descuadre,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al cerrar la caja" },
      { status: 500 }
    );
  }
}