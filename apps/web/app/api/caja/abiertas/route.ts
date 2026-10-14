import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// GET /api/caja/abiertas → todas las cajas abiertas o en cierre del
// negocio, con su cajero(a) y sucursal (multi-caja). Solo administradora.
// ============================================================

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const cajas = await prisma.sesionCaja.findMany({
    where: { estado: { in: ["ABIERTA", "EN_CIERRE"] } },
    orderBy: { horaApertura: "asc" },
    include: {
      usuario: { select: { nombre: true } },
      sucursal: { select: { nombre: true } },
    },
  });
  return NextResponse.json({
    cajas: cajas.map((c) => ({
      idCaja: c.idCaja,
      folioCaja: c.folioCaja,
      nombreCaja: c.nombreCaja,
      estado: c.estado,
      cajero: c.usuario.nombre,
      sucursal: c.sucursal?.nombre ?? null,
      horaApertura: c.horaApertura.toISOString(),
      fondoInicial: Number(c.fondoInicial),
      totalVentasEfectivo: Number(c.totalVentasEfectivo),
      totalVentasDigital: Number(c.totalVentasDigital),
      totalRecargas: Number(c.totalRecargas),
    })),
  });
}
