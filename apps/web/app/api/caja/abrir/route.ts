import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// POST /api/caja/abrir  (autenticado; usa el usuario real del JWT)
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

  const fondoInicial = Number(body.fondoInicial);
  if (!Number.isFinite(fondoInicial) || fondoInicial < 0) {
    return NextResponse.json({ error: "Fondo inicial inválido" }, { status: 400 });
  }

  try {
    const existingOpen = await prisma.sesionCaja.findFirst({
      where: { estado: { in: ["ABIERTA", "EN_CIERRE"] } },
    });

    if (existingOpen) {
      return NextResponse.json(
        { error: "Ya existe una sesión de caja abierta o en cierre" },
        { status: 409 }
      );
    }

    const sesion = await prisma.sesionCaja.create({
      data: {
        idUsuario: user.idPersona,
        fondoInicial: Math.round(fondoInicial * 100) / 100,
        estado: "ABIERTA",
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Caja abierta con fondo inicial: $${fondoInicial}`,
        moduloSistema: "CAJA",
        jsonPayload: { fondoInicial, idCaja: sesion.idCaja },
      },
    });

    return NextResponse.json(sesion);
  } catch (error) {
    return NextResponse.json({ error: "Error al abrir caja" }, { status: 500 });
  }
}