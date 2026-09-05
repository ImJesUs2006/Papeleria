import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const hoy = new Date();
  const desde = searchParams.get("desde") ? new Date(searchParams.get("desde")!) : new Date(hoy.getTime() - 30 * 86400000);
  const hasta = searchParams.get("hasta") ? new Date(searchParams.get("hasta")!) : hoy;

  try {
    const [ventas, lineas, productos, sesionAbierta] = await Promise.all([
      prisma.venta.findMany({
        where: { fechaHora: { gte: desde, lte: hasta }, estado: "COMPLETADA" },
        select: { totalNeto: true, fechaHora: true },
      }),
      prisma.lineaDetalleVenta.findMany({
        where: { venta: { fechaHora: { gte: desde, lte: hasta }, estado: "COMPLETADA" } },
        include: { producto: { select: { descripcion: true } } },
      }),
      prisma.producto.findMany({
        select: { descripcion: true, stockActual: true, stockMinimo: true },
      }),
      prisma.sesionCaja.findFirst({ where: { estado: "ABIERTA" } }),
    ]);

    // Tendencia por horario
    const porHora = new Map<number, { monto: number; ventas: number }>();
    for (const v of ventas) {
      const h = new Date(v.fechaHora).getHours();
      const cur = porHora.get(h) ?? { monto: 0, ventas: 0 };
      cur.monto += Number(v.totalNeto);
      cur.ventas += 1;
      porHora.set(h, cur);
    }
    const ventasPorHora = Array.from({ length: 24 }, (_, h) => ({
      hora: `${String(h).padStart(2, "0")}:00`,
      monto: Math.round((porHora.get(h)?.monto ?? 0) * 100) / 100,
      ventas: porHora.get(h)?.ventas ?? 0,
    }));

    // Top productos vendidos
    const agrupado = new Map<string, { descripcion: string; cantidad: number; monto: number }>();
    for (const l of lineas) {
      const k = l.codigoItem;
      const cur = agrupado.get(k) ?? { descripcion: l.producto.descripcion, cantidad: 0, monto: 0 };
      cur.cantidad += l.cantidad;
      cur.monto += Number(l.subtotalLinea);
      agrupado.set(k, cur);
    }
    const topProductos = Array.from(agrupado.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5)
      .map((p) => ({ ...p, monto: Math.round(p.monto * 100) / 100 }));

    // Alertas de stock
    const alertasStock = productos
      .filter((p) => p.stockActual <= p.stockMinimo)
      .sort((a, b) => a.stockActual - b.stockActual)
      .slice(0, 10);
    const agotados = productos.filter((p) => p.stockActual === 0).length;
    const alertaBaja = alertasStock.filter((p) => p.stockActual > 0).length;

    const totalVentas = Math.round(ventas.reduce((a, v) => a + Number(v.totalNeto), 0) * 100) / 100;

    return NextResponse.json({
      rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      resumen: {
        totalVentas,
        numVentas: ventas.length,
        ticketPromedio: ventas.length ? Math.round((totalVentas / ventas.length) * 100) / 100 : 0,
        agotados,
        alertaBaja,
      },
      ventasPorHora,
      topProductos,
      alertasStock,
      caja: sesionAbierta
        ? {
            fondoInicial: Number(sesionAbierta.fondoInicial),
            totalVentasEfectivo: Number(sesionAbierta.totalVentasEfectivo),
            totalVentasDigital: Number(sesionAbierta.totalVentasDigital),
            totalRecargas: Number(sesionAbierta.totalRecargas),
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al generar métricas" }, { status: 500 });
  }
}