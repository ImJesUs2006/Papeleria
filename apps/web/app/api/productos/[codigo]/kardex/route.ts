import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// GET /api/productos/[codigo]/kardex?limite=100
// Historial inmutable de movimientos de inventario de un producto
// (Fase 3), de más reciente a más antiguo. Cada movimiento trae el
// responsable y la razón legible (venta/devolución/ajuste).
// ============================================================

export async function GET(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { codigo } = await params;
  const url = new URL(request.url);
  const limiteRaw = Number(url.searchParams.get("limite") ?? 100);
  const limite = Number.isInteger(limiteRaw)
    ? Math.min(Math.max(limiteRaw, 1), 500)
    : 100;

  const producto = await prisma.producto.findUnique({
    where: { codigoItem: codigo },
    select: { codigoItem: true, descripcion: true, stockActual: true },
  });
  if (!producto) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const movimientos = await prisma.movimientoKardex.findMany({
    where: { codigoItem: codigo },
    orderBy: { fecha: "desc" },
    take: limite,
    include: { usuario: { select: { nombre: true } } },
  });

  return NextResponse.json({
    producto,
    movimientos: movimientos.map((m) => ({
      idMovimiento: m.idMovimiento,
      fecha: m.fecha,
      cantidadCambio: m.cantidadCambio,
      tipo: m.tipo,
      motivo: m.motivo,
      usuario: m.usuario?.nombre ?? "Sistema",
    })),
  });
}

export const dynamic = "force-dynamic";