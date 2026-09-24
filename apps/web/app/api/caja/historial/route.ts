import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { calcularArqueo } from "@/lib/cash";

// ============================================================
// GET /api/caja/historial
// Historial de sesiones CERRADAS (últimas 50).
// Recalcula el arqueo a partir de las cantidades PERSISTIDAS en el
// cierre (contado vs esperado) para presentar el descuadre real,
// incluyendo el cajero y los datos necesarios para re-imprimir el
// ticket térmico del corte. El esperado de efectivo se recalcula
// restando los retiros autorizados de la sesión (Fase 3).
// ============================================================

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sesiones = await prisma.sesionCaja.findMany({
    where: { estado: "CERRADA" },
    orderBy: { horaCierre: "desc" },
    take: 50,
    include: {
      usuario: { select: { nombre: true } },
      retiros: {
        select: { monto: true, motivo: true, fechaHora: true },
        orderBy: { fechaHora: "asc" },
      },
    },
  });

  const historial = sesiones.map((s) => {
    const retirosEfectivo = s.retiros.reduce((sum, r) => sum + Number(r.monto), 0);
    const arqueo = calcularArqueo({
      fondoInicial: Number(s.fondoInicial),
      totalVentasEfectivo: Number(s.totalVentasEfectivo),
      totalVentasDigital: Number(s.totalVentasDigital),
      totalRecargas: Number(s.totalRecargas),
      totalEgresos: Number(s.totalEgresos) || 0,
      retirosEfectivo,
      efectivoDeclarado: Number(s.efectivoContado ?? 0),
      digitalDeclarado: Number(s.vouchersContado ?? 0),
      recargasDeclarado: Number(s.recargasContado ?? 0),
    });

    return {
      idCaja: s.idCaja,
      horaApertura: s.horaApertura,
      horaCierre: s.horaCierre,
      cajero: s.usuario?.nombre ?? "Sistema",
      fondoInicial: Number(s.fondoInicial),
      retirosEfectivo,
      retiros: s.retiros.map((r) => ({
        monto: Number(r.monto),
        motivo: r.motivo ?? "Sin motivo",
        fechaHora: r.fechaHora,
      })),
      descuadre: Boolean(s.descuadre),
      notasCierre: s.notasCierre ?? null,
      arqueo,
    };
  });

  return NextResponse.json({ historial });
}

export const dynamic = "force-dynamic";