import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { claveProducto } from "@/lib/tenant-keys";
import { leerEscalas } from "@/lib/precios";

// ============================================================
// GET /api/productos/[codigo]/ficha
// Todo lo del producto en un solo lugar (panel "Ficha" de Inventario):
// precios y escalas, existencia por sucursal, lotes vigentes, series,
// variantes hermanas y lo vendido en los últimos 30 días.
// ============================================================

export async function GET(_request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { codigo } = await params;

  const p = await prisma.producto.findUnique({
    where: claveProducto(codigo),
    include: { categoria: { select: { nombre: true, color: true } } },
  });
  if (!p) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const hace30 = new Date(Date.now() - 30 * 86_400_000);
  const [existencias, lotes, series, variantes, ventas] = await Promise.all([
    prisma.existencia.findMany({
      where: { codigoItem: p.codigoItem },
      include: { sucursal: { select: { nombre: true, esMatriz: true, activa: true } } },
    }),
    p.usaLotes
      ? prisma.lote.findMany({
          where: { codigoItem: p.codigoItem, cantidad: { gt: 0 } },
          orderBy: [{ caducidad: "asc" }, { createdAt: "asc" }],
          take: 100,
        })
      : [],
    p.usaSeries
      ? prisma.numeroSerie.findMany({
          where: { codigoItem: p.codigoItem },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: { serie: true, estado: true, idSucursal: true, folioVenta: true },
        })
      : [],
    p.grupoVariante
      ? prisma.producto.findMany({
          where: { grupoVariante: p.grupoVariante, activo: true, NOT: { codigoItem: p.codigoItem } },
          select: { codigoItem: true, descripcion: true, atributosVariante: true, stockActual: true },
          take: 50,
        })
      : [],
    prisma.lineaDetalleVenta.findMany({
      where: {
        codigoItem: p.codigoItem,
        venta: { fechaHora: { gte: hace30 }, estado: { not: "CANCELADA" } },
      },
      select: { cantidad: true, subtotalLinea: true, venta: { select: { fechaHora: true } } },
    }),
  ]);

  const sucursales = new Map(existencias.map((e) => [e.idSucursal, e.sucursal.nombre]));
  const unidades30 = ventas.reduce((s, v) => s + Number(v.cantidad), 0);
  const ultimaVenta = ventas.reduce<Date | null>(
    (u, v) => (!u || v.venta.fechaHora > u ? v.venta.fechaHora : u),
    null
  );
  const stock = Number(p.stockActual);
  const precio = Number(p.precioUnitario);
  const costo = p.costoPromedio != null ? Number(p.costoPromedio) : p.precioCompra != null ? Number(p.precioCompra) : null;

  return NextResponse.json({
    producto: {
      codigoItem: p.codigoItem,
      descripcion: p.descripcion,
      imagenUrl: p.imagenUrl,
      categoria: p.categoria,
      precioUnitario: precio,
      precioMayoreo: p.precioMayoreo != null ? Number(p.precioMayoreo) : null,
      escalasPrecio: leerEscalas(p.escalasPrecio, precio),
      costo,
      margenPorcentaje: costo != null && precio > 0 ? Math.round(((precio - costo) / precio) * 1000) / 10 : null,
      stockTotal: stock,
      stockMinimo: Number(p.stockMinimo),
      esServicio: p.esServicio,
      usaLotes: p.usaLotes,
      usaSeries: p.usaSeries,
      codigoBarras: p.codigoBarras,
      ubicacionEstante: p.ubicacionEstante,
      atributos: p.atributos,
      atributosVariante: p.atributosVariante,
    },
    existencias: existencias
      .filter((e) => e.sucursal.activa)
      .map((e) => ({
        idSucursal: e.idSucursal,
        sucursal: e.sucursal.nombre,
        esMatriz: e.sucursal.esMatriz,
        stock: Number(e.stock),
        activa: e.idSucursal === auth.user.idSucursal,
      })),
    lotes: lotes.map((l) => ({
      idLote: l.idLote,
      numeroLote: l.numeroLote,
      caducidad: l.caducidad,
      cantidad: Number(l.cantidad),
      sucursal: sucursales.get(l.idSucursal) ?? "—",
    })),
    series: {
      disponibles: series.filter((s) => s.estado === "DISPONIBLE").length,
      vendidas: series.filter((s) => s.estado === "VENDIDA").length,
      lista: series.slice(0, 50).map((s) => ({
        serie: s.serie,
        estado: s.estado,
        sucursal: sucursales.get(s.idSucursal) ?? "—",
        folioVenta: s.folioVenta,
      })),
    },
    variantes: variantes.map((v) => ({
      codigoItem: v.codigoItem,
      descripcion: v.descripcion,
      atributos: v.atributosVariante,
      stock: Number(v.stockActual),
    })),
    ventas30: {
      unidades: Math.round(unidades30 * 1000) / 1000,
      importe: Math.round(ventas.reduce((s, v) => s + Number(v.subtotalLinea), 0) * 100) / 100,
      ultimaVenta,
      // Días que alcanza la existencia al ritmo de los últimos 30 días.
      diasDeInventario: unidades30 > 0 ? Math.round(stock / (unidades30 / 30)) : null,
    },
  });
}

export const dynamic = "force-dynamic";
