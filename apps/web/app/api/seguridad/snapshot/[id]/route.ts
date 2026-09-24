import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// GET /api/seguridad/snapshot/[id] — Detalle (JSON) de un snapshot.
// ============================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const row = await prisma.snapshotSeguridad.findUnique({ where: { id } });
    if (!row) {
      return NextResponse.json({ error: "Snapshot no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      id: row.id,
      fecha: row.fecha,
      motivo: row.motivo,
      datosJson: row.datosJson,
    });
  } catch {
    return NextResponse.json({ error: "Error al leer el snapshot" }, { status: 500 });
  }
}