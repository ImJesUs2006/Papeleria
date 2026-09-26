import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// GET /api/caja/ventas → tickets de la sesión vigente
// (o de la sesión cerrada más reciente si no hay una abierta).
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
      horaApertura: true,
      idUsuario: true,
    },
  });

  const activa = sesion ?? (await prisma.sesionCaja.findFirst({
    orderBy: { horaCierre: "desc" },
    select: { idCaja: true, folioCaja: true, horaApertura: true, idUsuario: true },
  }));

  if (!activa) {
    return NextResponse.json({ sesion: null, ventas: [] });
  }

  const [cajero, ventas] = await Promise.all([
    prisma.usuario.findUnique({
      where: { idPersona: activa.idUsuario },
      select: { nombre: true },
    }),
    prisma.venta.findMany({
      where: { idCaja: activa.idCaja },
      orderBy: { fechaHora: "desc" },
      take: 200,
      select: {
        folioVenta: true,
        fechaHora: true,
        metodoPago: true,
        totalNeto: true,
        estado: true,
      },
    }),
  ]);

  return NextResponse.json({
    sesion: {
      idCaja: activa.idCaja,
      folioCaja: activa.folioCaja,
      horaApertura: activa.horaApertura.toISOString(),
      cajero: cajero?.nombre ?? "—",
      abierta: Boolean(sesion),
    },
    ventas: ventas.map((v) => ({
      folioVenta: v.folioVenta,
      fechaHora: v.fechaHora.toISOString(),
      metodoPago: v.metodoPago,
      totalNeto: Number(v.totalNeto),
      estado: v.estado,
    })),
  });
}