import { leerEscalas } from "@/lib/precios";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tienePermiso } from "@/lib/permisos";
import { tenantDb } from "@/lib/tenant";
import { conStockDeSucursal, moverStock, stockEnSucursal } from "@/lib/existencias";

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  // El costo solo lo ve quien maneja inventario (no la cajera en el cobro).
  const veCosto = tienePermiso(auth.user, "inventario");
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    const encontrados = await prisma.producto.findMany({
      where: {
        activo: true,
        OR: [
          { codigoItem: { contains: query, mode: "insensitive" } },
          { descripcion: { contains: query, mode: "insensitive" } },
          { codigoBarras: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 10,
      orderBy: { descripcion: "asc" },
    });
    const productos = await conStockDeSucursal(prisma, auth.user.idSucursal, encontrados);

    return NextResponse.json(
      productos.map((p) => ({
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: p.precioUnitario,
        precioMayoreo: p.precioMayoreo != null ? Number(p.precioMayoreo) : null,
        escalasPrecio: leerEscalas(p.escalasPrecio, Number(p.precioUnitario)),
        tasaIva: p.tasaIva != null ? Number(p.tasaIva) : null,
        exentoIva: p.exentoIva === true,
        tasaIeps: p.tasaIeps != null ? Number(p.tasaIeps) : null,
        idCategoria: p.idCategoria ?? null,
        usaSeries: p.usaSeries === true,
        usaLotes: p.usaLotes === true,
        grupoVariante: p.grupoVariante ?? null,
        imagenUrl: p.imagenUrl ?? null,
        stockActual: p.stockActual,
        tipoImpresion: p.tipoImpresion,
        permiteDecimales: p.permiteDecimales,
        esServicio: p.esServicio,
        precioCompra: veCosto && p.precioCompra != null ? Number(p.precioCompra) : null,
        unidadCompra: p.unidadCompra ?? null,
        piezasPorUnidad: p.piezasPorUnidad ?? 1,
        unidadVenta: p.unidadVenta ?? null,
      }))
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Error al buscar productos" },
      { status: 500 }
    );
  }
}
