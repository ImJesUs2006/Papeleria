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
      data: rows.map((s) => ({
        id: s.id,
        fecha: s.fecha,
        motivo: s.motivo,
        idUsuario: s.idUsuario,
        nombreUsuario: s.usuario?.nombre ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Error al leer el historial" }, { status: 500 });
  }
}