import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requirePlataforma } from "@/lib/plataforma";

// GET /api/plataforma/bitacora → lo último que se hizo desde la consola.
export async function GET() {
  if (!(await requirePlataforma())) return NextResponse.json({ error: "Sin sesión de plataforma" }, { status: 401 });
  const [registros, negocios] = await Promise.all([
    prisma.plataformaLog.findMany({ orderBy: { fecha: "desc" }, take: 150 }),
    prisma.negocio.findMany({ select: { idNegocio: true, nombre: true, codigo: true } }),
  ]);
  return NextResponse.json({
    registros: registros.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      accion: r.accion,
      negocio: negocios.find((n) => n.idNegocio === r.idNegocio)?.codigo ?? null,
    })),
  });
}
