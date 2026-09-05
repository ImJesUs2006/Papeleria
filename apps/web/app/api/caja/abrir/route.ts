import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";

export async function POST(request: Request) {
  try {
    const { fondoInicial } = await request.json();

    if (typeof fondoInicial !== "number" || fondoInicial < 0) {
      return NextResponse.json(
        { error: "Fondo inicial inválido" },
        { status: 400 }
      );
    }

    // Check if there's already an open session
    const existingOpen = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
    });

    if (existingOpen) {
      return NextResponse.json(
        { error: "Ya existe una sesión de caja abierta" },
        { status: 409 }
      );
    }

    // TODO: Get actual user ID from session/JWT
    const userId = "placeholder-user-id";

    const sesion = await prisma.sesionCaja.create({
      data: {
        idUsuario: userId,
        fondoInicial,
        estado: "ABIERTA",
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: userId,
        accion: `Caja abierta con fondo inicial: $${fondoInicial}`,
        moduloSistema: "CAJA",
        jsonPayload: { fondoInicial, idCaja: sesion.idCaja },
      },
    });

    return NextResponse.json(sesion);
  } catch (error) {
    return NextResponse.json(
      { error: "Error al abrir caja" },
      { status: 500 }
    );
  }
}
