import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { randomUUID } from "crypto";

// ============================================================
// GET  /api/caja/cerrar/iniciar  → estado del corte ciego activo
//      (para reanudar tras recarga; devuelve el token de cierre,
//       cuya única autoridad es concluir el corte).
// POST /api/caja/cerrar/iniciar  → transición ABIERTA ⇒ EN_CIERRE.
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sesion = await prisma.sesionCaja.findFirst({
    where: { estado: "EN_CIERRE" },
    orderBy: { cierreInicioEn: "desc" },
    select: { idCaja: true, cierreToken: true, cierreInicioEn: true },
  });

  if (!sesion || !sesion.cierreToken) {
    return NextResponse.json({ activo: false });
  }

  return NextResponse.json({
    activo: true,
    idCaja: sesion.idCaja,
    cierreToken: sesion.cierreToken,
    horaInicio: sesion.cierreInicioEn,
  });
}

export async function POST() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
      orderBy: { horaApertura: "desc" },
    });

    if (!sesion) {
      return NextResponse.json({ error: "No hay una caja abierta" }, { status: 409 });
    }

    const token = randomUUID();
    const iniciada = await prisma.$transaction(async (tx) => {
      // Transición con condición en UPDATE: solo si sigue ABIERTA.
      const actualizada = await tx.sesionCaja.updateMany({
        where: { idCaja: sesion.idCaja, estado: "ABIERTA" },
        data: {
          estado: "EN_CIERRE",
          cierreToken: token,
          cierreInicioEn: new Date(),
          cierreIniciadoPor: user.idPersona,
        },
      });

      if (actualizada.count === 0) {
        throw Object.assign(new Error("Caja ya en proceso de cierre"), { status: 409 });
      }

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Corte ciego INICIADO para caja ${sesion.idCaja}`,
          moduloSistema: "CAJA",
          jsonPayload: { idCaja: sesion.idCaja, cierreToken: token },
        },
      });

      return token;
    });

    return NextResponse.json({
      ok: true,
      cierreToken: token,
      idCaja: sesion.idCaja,
      horaInicio: new Date().toISOString(),
    });
  } catch (error: any) {
    if (error?.status === 409) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al iniciar el corte" }, { status: 500 });
  }
}