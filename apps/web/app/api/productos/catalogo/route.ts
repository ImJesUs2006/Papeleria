import { leerEscalas } from "@/lib/precios";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { conStockDeSucursal } from "@/lib/existencias";

// ============================================================
// GET /api/productos/catalogo → catálogo ligero de la sucursal activa
// para guardarlo en el dispositivo y vender sin red (Paso 8).
// ============================================================

const MAX = 5000;

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const productos = await prisma.producto.findMany({
    where: { activo: true },
    orderBy: { descripcion: "asc" },
    take: MAX,
  });
  const conStock = await conStockDeSucursal(prisma, auth.user.idSucursal, productos);
  return NextResponse.json({
    generado: new Date().toISOString(),
    productos: conStock.map((p) => ({
      codigoItem: p.codigoItem,
      codigoBarras: p.codigoBarras ?? null,
      descripcion: p.descripcion,
      precioUnitario: Number(p.precioUnitario),
      precioMayoreo: p.precioMayoreo != null ? Number(p.precioMayoreo) : null,
      escalasPrecio: leerEscalas(p.escalasPrecio, Number(p.precioUnitario)),
      stockActual: Number(p.stockActual),
      stockMinimo: Number(p.stockMinimo),
      permiteDecimales: p.permiteDecimales,
      esServicio: p.esServicio,
      usaSeries: p.usaSeries,
      favorito: Boolean(p.favorito),
      idCategoria: p.idCategoria ?? null,
      tasaIva: p.tasaIva != null ? Number(p.tasaIva) : null,
      exentoIva: p.exentoIva === true,
      tasaIeps: p.tasaIeps != null ? Number(p.tasaIeps) : null,
      // Las imágenes en data URI pesan demasiado para la copia local.
      imagenUrl: p.imagenUrl && !p.imagenUrl.startsWith("data:") ? p.imagenUrl : null,
    })),
  });
}
