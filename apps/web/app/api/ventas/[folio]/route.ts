import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { calcularDevuelto } from "@/lib/returns";
import { tenantDb } from "@/lib/tenant";

// GET /api/ventas/[folio] → venta con cantidades disponibles para devolver.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ folio: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { folio } = await params;

  try {
    const venta = await prisma.venta.findUnique({
      where: { folioVenta: folio },
      include: {
        lineasDetalle: {
          include: { producto: { select: { descripcion: true } } },
        },
        devoluciones: { include: { lineas: true } },
      },
    });

    if (!venta) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }

    const devuelto = calcularDevuelto(venta.devoluciones);

    return NextResponse.json({
      folioVenta: venta.folioVenta,
      fechaHora: venta.fechaHora,
      estado: venta.estado,
      metodoPago: venta.metodoPago,
      subtotal: Number(venta.subtotal),
      iva: Number(venta.iva),
      totalNeto: Number(venta.totalNeto),
      items: venta.lineasDetalle.map((l) => {
        const yaDevuelto = devuelto.get(l.codigoItem) ?? 0;
        return {
          codigoItem: l.codigoItem,
          descripcion: l.producto.descripcion,
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioMomento),
          subtotalLinea: Number(l.subtotalLinea),
          devuelto: yaDevuelto,
          disponible: Math.max(0, Number(l.cantidad) - yaDevuelto),
        };
      }),
      devoluciones: venta.devoluciones.map((d) => ({
        folioDevolucion: d.folioDevolucion,
        fechaHora: d.fechaHora,
        tipo: d.tipo,
        metodoReembolso: d.metodoReembolso,
        totalNeto: Number(d.totalNeto),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar la venta" }, { status: 500 });
  }
}
