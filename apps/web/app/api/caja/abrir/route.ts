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

    // Folio correlativo CAJA-### (numérico, para que CAJA-10 > CAJA-9).
    const anteriores = await prisma.sesionCaja.findMany({
      where: { folioCaja: { not: null } },
      select: { folioCaja: true },
    });
    const numeros = anteriores
      .map((s) => parseInt((s.folioCaja ?? "").replace(/[^\d]/g, ""), 10))
      .filter((n) => !Number.isNaN(n));
    const siguiente = (numeros.length ? Math.max(...numeros) : 0) + 1;
    const folioCaja = `CAJA-${String(siguiente).padStart(3, "0")}`;

    const sesion = await prisma.sesionCaja.create({
      data: {
        idUsuario: user.idPersona,
        fondoInicial: Math.round(fondoInicial * 100) / 100,
        estado: "ABIERTA",
        folioCaja,
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Caja abierta (${folioCaja}) con fondo inicial: $${fondoInicial}`,
        moduloSistema: "CAJA",
        jsonPayload: { fondoInicial, idCaja: sesion.idCaja, folioCaja },
      },
    });

    return NextResponse.json(sesion);
  } catch (error) {
    return NextResponse.json({ error: "Error al abrir caja" }, { status: 500 });
  }
}