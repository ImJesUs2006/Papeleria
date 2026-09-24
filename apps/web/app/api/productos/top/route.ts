import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

// ============================================================
// GET /api/productos/top — Catálogo visual del POS (UX Fase 1).
// Devuelve hasta 20 productos: primero los marcados como FAVORITO,
// luego los MÁS VENDIDOS (agregado de ventas), y completa con los
// más recientes con stock. Disponible para cualquier sesión.
// ============================================================

const MAX_DEFAULT = 20;

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const param = parseInt(
    new URL(request.url).searchParams.get("limit") || String(MAX_DEFAULT),
    10
  );
  const limit = Math.max(1, Math.min(MAX_DEFAULT, Number.isFinite(param) ? param : MAX_DEFAULT));

  try {
    const [favoritos, vendidos] = await Promise.all([
      prisma.producto.findMany({
        where: { activo: true, favorito: true, stockActual: { gt: 0 } },
        orderBy: { descripcion: "asc" },
        take: limit,
      }),
      prisma.lineaDetalleVenta.groupBy({
        by: ["codigoItem"],
        where: { venta: { estado: { in: ["ACTIVA", "COMPLETADA"] } } },
        _sum: { cantidad: true },
      }),
    ]);

    const vendidosMap = new Map<string, number>(
      vendidos.map((v) => [v.codigoItem, Number(v._sum.cantidad ?? 0)])
    );
    const topCodes = [...vendidosMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([codigo]) => codigo);

    const resultado = new Map<string, any>();
    for (const f of favoritos) {
      resultado.set(f.codigoItem, { ...f, vendidos: vendidosMap.get(f.codigoItem) ?? 0 });
    }

    // Completa con los más vendidos (aún no incluidos).
    if (resultado.size < limit && topCodes.length > 0) {
      const faltan = limit - resultado.size;
      const codes = topCodes.filter((c) => !resultado.has(c)).slice(0, faltan);
      if (codes.length > 0) {
        const productos = await prisma.producto.findMany({
          where: { codigoItem: { in: codes }, activo: true, stockActual: { gt: 0 } },
        });
        for (const p of productos) {
          resultado.set(p.codigoItem, { ...p, vendidos: vendidosMap.get(p.codigoItem) ?? 0 });
        }
      }
    }

    // Último recurso: productos recientes con stock (catálogo de inicio).
    if (resultado.size < limit) {
      const faltan = limit - resultado.size;
      const recientes = await prisma.producto.findMany({
        where: {
          activo: true,
          stockActual: { gt: 0 },
          codigoItem: { notIn: [...resultado.keys()] },
        },
        orderBy: { fechaActualizacion: "desc" },
        take: faltan,
      });
      for (const p of recientes) {
        resultado.set(p.codigoItem, { ...p, vendidos: 0 });
      }
    }

    const data = [...resultado.values()].slice(0, limit).map((p) => ({
      codigoItem: p.codigoItem,
      descripcion: p.descripcion,
      precioUnitario: Number(p.precioUnitario),
      stockActual: p.stockActual,
      tipoImpresion: p.tipoImpresion ?? null,
      codigoBarras: p.codigoBarras ?? null,
      favorito: Boolean(p.favorito),
      vendidos: p.vendidos,
    }));

    return NextResponse.json({ data, total: data.length });
  } catch {
    return NextResponse.json({ error: "Error al obtener el catálogo" }, { status: 500 });
  }
}