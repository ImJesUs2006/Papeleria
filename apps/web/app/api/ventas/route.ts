import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { executeSale, SaleError } from "@/lib/sales";

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

  try {
    // Caja abierta (si existe) para asignar el ingreso financiero.
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
    });

    const resultado = await prisma.$transaction((tx) =>
      executeSale(tx, body, {
        idUsuario: user.idPersona,
        idCaja: sesion?.idCaja ?? null,
      })
    );

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof SaleError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Error interno al registrar la venta" },
      { status: 500 }
    );
  }
}