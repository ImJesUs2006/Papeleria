import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// GET /api/caja/estado → sesión vigente (ABIERTA/EN_CIERRE) o null.
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sesion = await prisma.sesionCaja.findFirst({
    where: { estado: { in: ["ABIERTA", "EN_CIERRE"] } },
    orderBy: { horaApertura: "desc" },
    select: {
      idCaja: true,
      folioCaja: true,
      idUsuario: true,
      fondoInicial: true,
      totalVentasEfectivo: true,
      totalVentasDigital: true,
      totalRecargas: true,
      horaApertura: true,
      estado: true,
      cierreToken: true,
      cierreInicioEn: true,
      _count: { select: { retiros: true } },
    },
  });

  if (!sesion) {
    return NextResponse.json({ sesion: null });
  }

  const retiros = await prisma.retiroEfectivo.aggregate({
    where: { idCaja: sesion.idCaja },
    _sum: { monto: true },
  });

  return NextResponse.json({
    sesion: {
      idCaja: sesion.idCaja,
      folioCaja: sesion.folioCaja,
      idUsuario: sesion.idUsuario,
      fondoInicial: Number(sesion.fondoInicial),
      totalVentasEfectivo: Number(sesion.totalVentasEfectivo),
      totalVentasDigital: Number(sesion.totalVentasDigital),
      totalRecargas: Number(sesion.totalRecargas),
      totalRetiros: Number(retiros._sum.monto ?? 0),
      numRetiros: sesion._count.retiros,
      horaApertura: sesion.horaApertura.toISOString(),
      estado: sesion.estado,
      cierreToken: sesion.estado === "EN_CIERRE" ? sesion.cierreToken : null,
      cierreInicioEn: sesion.cierreInicioEn?.toISOString() ?? null,
    },
  });
}