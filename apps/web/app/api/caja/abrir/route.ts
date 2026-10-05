import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/feature-flags";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// POST /api/caja/abrir  (autenticado; usa el usuario real del JWT)
// Configuración personalizable (Fase 10): si el negocio exige fondo
// inicial (requerirFondoInicial), el body debe traerlo; en caso
// contrario se tolera su ausencia y arranca con $0.
// ============================================================

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const config = await getBusinessConfig(user.idNegocio);
  const fondoBruto = Number(body?.fondoInicial);
  const trajoFondo =
    typeof body?.fondoInicial !== "undefined" &&
    Number.isFinite(fondoBruto) &&
    fondoBruto >= 0;
  if (config.requerirFondoInicial && !trajoFondo) {
    return NextResponse.json(
      { error: "El negocio exige un fondo inicial válido para abrir caja" },
      { status: 400 }
    );
  }
  const fondoInicial = trajoFondo ? fondoBruto : 0;

  try {
    // Transacción serializable: dos aperturas simultáneas no crean dos
    // sesiones abiertas ni repiten el folio correlativo.
    const resultado = await prisma.$transaction(
      async (tx) => {
        const existingOpen = await tx.sesionCaja.findFirst({
          where: { estado: { in: ["ABIERTA", "EN_CIERRE"] } },
          select: { idCaja: true },
        });
        if (existingOpen) return null;

        // Folio correlativo CAJA-### (numérico, para que CAJA-10 > CAJA-9).
        const anteriores = await tx.sesionCaja.findMany({
          where: { folioCaja: { not: null } },
          select: { folioCaja: true },
        });
        const numeros = anteriores
          .map((s) => parseInt((s.folioCaja ?? "").replace(/[^\d]/g, ""), 10))
          .filter((n) => !Number.isNaN(n));
        const siguiente = (numeros.length ? Math.max(...numeros) : 0) + 1;

        return tx.sesionCaja.create({
          data: {
            idUsuario: user.idPersona,
            fondoInicial: Math.round(fondoInicial * 100) / 100,
            estado: "ABIERTA",
            folioCaja: `CAJA-${String(siguiente).padStart(3, "0")}`,
          },
        });
      },
      { isolationLevel: "Serializable" }
    );

    if (!resultado) {
      return NextResponse.json(
        { error: "Ya existe una sesión de caja abierta o en cierre" },
        { status: 409 }
      );
    }
    const sesion = resultado;
    const folioCaja = sesion.folioCaja;

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Caja abierta (${folioCaja}) con fondo inicial: $${fondoInicial}`,
        moduloSistema: "CAJA",
        jsonPayload: { fondoInicial, idCaja: sesion.idCaja, folioCaja },
      },
    });

    return NextResponse.json(sesion);
  } catch (error: any) {
    // P2034 (serialización) / P2002 (folio repetido): otra apertura ganó la carrera.
    if (error?.code === "P2034" || error?.code === "P2002") {
      return NextResponse.json(
        { error: "Otra apertura de caja está en curso; intenta de nuevo" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Error al abrir caja" }, { status: 500 });
  }
}