import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tipo, monto } = body;

    if (
      (tipo !== "PAPELERIA" && tipo !== "RECARGA") ||
      typeof monto !== "number" ||
      monto <= 0
    ) {
      return NextResponse.json(
        { error: "Tipo o monto inválido" },
        { status: 400 }
      );
    }

    const sesionOpen = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
    });

    if (!sesionOpen) {
      return NextResponse.json(
        { error: "No hay caja abierta" },
        { status: 409 }
      );
    }

    const data =
      tipo === "PAPELERIA"
        ? { totalVentasEfectivo: { increment: monto } }
        : { totalRecargas: { increment: monto } };

    const sesion = await prisma.sesionCaja.update({
      where: { idCaja: sesionOpen.idCaja },
      data,
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: sesionOpen.idUsuario,
        accion:
          tipo === "PAPELERIA"
            ? `Ingreso papelería registrado: $${monto}`
            : `Recarga telefónica registrada: $${monto}`,
        moduloSistema: "CAJA",
        jsonPayload: { tipo, monto, idCaja: sesionOpen.idCaja },
      },
    });

    return NextResponse.json(sesion);
  } catch (error) {
    return NextResponse.json(
      { error: "Error al registrar ingreso de caja" },
      { status: 500 }
    );
  }
}