import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { round2 } from "@/lib/sales";

// ============================================================
// POST /api/caja/retiros   (SOLO ADMINISTRADORA)
// Retiro parcial de efectivo de la caja ABIERTA, con auditoría.
//
// Garantías (Red Team):
//   - El rol debe ser ADMINISTRADORA (los retiros son decisión gerencial).
//   - Monto > 0 y no puede exceder el efectivo físico disponible
//     (fondo + ventas efectivo + abonos − egresos − retiros previos).
//   - La caja debe estar ABIERTA (no durante el corte ciego).
//   - Al cerrar, el corte ciego resta estos montos del esperado para
//     no marcar un descuadre matemático inexistente.
// ============================================================

const RETIRO_SCHEMA = z
  .object({
    monto: z
      .number()
      .finite("Monto inválido")
      .positive("El retiro debe ser mayor a cero")
      .max(999_999_999, "Monto fuera de rango"),
    idCaja: z.string().uuid("Caja inválida").optional(),
    motivo: z.string().trim().min(2, "Indica el motivo del retiro").max(120),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = auth.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = RETIRO_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Retiro inválido" },
      { status: 400 }
    );
  }
  const monto = round2(parsed.data.monto);
  if (monto <= 0) {
    return NextResponse.json({ error: "El retiro debe ser mayor a cero" }, { status: 400 });
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const caja = parsed.data.idCaja
        ? await tx.sesionCaja.findUnique({
            where: { idCaja: parsed.data.idCaja },
            select: {
              idCaja: true,
              fondoInicial: true,
              totalVentasEfectivo: true,
              totalEgresos: true,
              estado: true,
            },
          })
        : await tx.sesionCaja.findFirst({
            where: { estado: "ABIERTA" },
            orderBy: { horaApertura: "desc" },
            select: {
              idCaja: true,
              fondoInicial: true,
              totalVentasEfectivo: true,
              totalEgresos: true,
              estado: true,
            },
          });

      if (!caja) {
        throw new Error("_NO_CAJA");
      }
      if (caja.estado !== "ABIERTA") {
        throw new Error("_CAJA_NO_ABIERTA");
      }

      // Efectivo físicamente disponible (los abonos ya suman en ventasEfectivo).
      const retirosPrevios = await tx.retiroEfectivo.aggregate({
        where: { idCaja: caja.idCaja },
        _sum: { monto: true },
      });
      const disponible = round2(
        Number(caja.fondoInicial) +
          Number(caja.totalVentasEfectivo) -
          Number(caja.totalEgresos ?? 0) -
          Number(retirosPrevios._sum.monto ?? 0)
      );
      if (monto - disponible > 0.009) {
        throw new Error("_RETIRO_EXCEDE");
      }

      const retiro = await tx.retiroEfectivo.create({
        data: {
          idCaja: caja.idCaja,
          idAdmin: admin.idPersona,
          monto,
          motivo: parsed.data.motivo,
        },
      });

      await tx.bitacoraLog.create({
        data: {
          idUsuario: admin.idPersona,
          accion: `Retiro de caja por $${monto.toFixed(2)} (${parsed.data.motivo})`,
          moduloSistema: "CAJA",
          jsonPayload: {
            idRetiro: retiro.idRetiro,
            idCaja: caja.idCaja,
            monto,
            motivo: parsed.data.motivo,
            efectivoDisponible: disponible,
          },
        },
      });

      return { idRetiro: retiro.idRetiro, idCaja: caja.idCaja, disponible };
    });

    return NextResponse.json({ retiro: resultado });
  } catch (error: any) {
    if (error?.message === "_NO_CAJA") {
      return NextResponse.json(
        { error: "No hay una caja abierta para retirar" },
        { status: 404 }
      );
    }
    if (error?.message === "_CAJA_NO_ABIERTA") {
      return NextResponse.json(
        { error: "La caja no está abierta; no se puede retirar durante el cierre" },
        { status: 409 }
      );
    }
    if (error?.message === "_RETIRO_EXCEDE") {
      return NextResponse.json(
        { error: "El retiro excede el efectivo disponible en la caja" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error al registrar el retiro" }, { status: 500 });
  }
}