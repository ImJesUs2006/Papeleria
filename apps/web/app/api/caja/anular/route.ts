import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// POST /api/caja/anular — Auditoría de Caja (Fase 10).
// La ADMINISTRADORA anula una sesión de caja CERRADA. Los registros,
// ventas y totales se CONSERVAN intactos (pista de auditoría), pero
// sus ingresos se descartan de reportes y dashboard. El motivo es
// obligatorio y queda tanto en la sesión como en bitácora.
// ============================================================

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
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

  const idCaja = typeof body?.idCaja === "string" && body.idCaja ? body.idCaja : "";
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
  if (!idCaja) {
    return NextResponse.json(
      { error: "Falta el identificador de la sesión" },
      { status: 400 }
    );
  }
  if (motivo.length < 4) {
    return NextResponse.json(
      { error: "Escribe el motivo de la anulación (mínimo 4 caracteres)" },
      { status: 400 }
    );
  }

  try {
    const sesion = await prisma.sesionCaja.findUnique({ where: { idCaja } });
    if (!sesion) {
      return NextResponse.json(
        { error: "Sesión de caja no encontrada" },
        { status: 404 }
      );
    }
    if (sesion.estado !== "CERRADA") {
      return NextResponse.json(
        {
          error:
            sesion.estado === "ANULADA"
              ? "La sesión ya fue anulada"
              : "Solo se anulan sesiones cerradas",
        },
        { status: 409 }
      );
    }

    const anulada = await prisma.$transaction(async (tx) => {
      const actualizada = await tx.sesionCaja.update({
        where: { idCaja },
        data: {
          estado: "ANULADA",
          motivoAnulacion: motivo,
          horaCierre: sesion.horaCierre ?? new Date(),
        },
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Sesión de caja ${sesion.folioCaja ?? sesion.idCaja} ANULADA (ingresos descartados)`,
          moduloSistema: "CAJA",
          jsonPayload: {
            idCaja,
            folioCaja: sesion.folioCaja,
            motivo,
          },
        },
      });
      return actualizada;
    });

    return NextResponse.json({
      sesion: {
        idCaja,
        estado: anulada.estado,
        motivoAnulacion: anulada.motivoAnulacion,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al anular la sesión de caja" },
      { status: 500 }
    );
  }
}