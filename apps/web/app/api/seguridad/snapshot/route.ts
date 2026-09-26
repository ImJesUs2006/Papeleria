import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// GET /api/seguridad/snapshot — Historial de snapshots.
// Solo ADMINISTRADORA. Se usa en "Ver historial de recuperación".
// ============================================================

export async function GET() {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const rows = await prisma.snapshotSeguridad.findMany({
      orderBy: { fecha: "desc" },
      take: 50,
      include: { usuario: { select: { nombre: true, username: true } } },
    });

    return NextResponse.json({
      data: rows.map((s) => {
        // Los totales y la versión viven dentro de datosJson; el listado los
        // expone sin revelar el blob completo (que puede traer logos en base64).
        const snap = (s.datosJson ?? {}) as {
          totales?: { ventas?: { totalNeto?: number; conteo?: number } };
          configuracion?: { configVersion?: number };
        };
        const ventas = snap.totales?.ventas;
        return {
          id: s.id,
          fecha: s.fecha,
          motivo: s.motivo,
          idUsuario: s.idUsuario,
          nombreUsuario: s.usuario?.nombre ?? null,
          totalVentas: Number(ventas?.totalNeto ?? 0),
          totalTransacciones: Number(ventas?.conteo ?? 0),
          configVersion: Number(snap.configuracion?.configVersion ?? 0),
        };
      }),
    });
  } catch {
    return NextResponse.json({ error: "Error al leer el historial" }, { status: 500 });
  }
}