import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { excluirAnuladas } from "@/lib/reports";
import {
  antiguedadCuentas,
  clasificacionABC,
  coberturaInventario,
  indicadores,
  mapaCalor,
  margenPorCategoria,
  mezclaPagos,
  serieDiaria,
  variacion,
} from "@/lib/analitica";

// GET /api/reportes/analisis?dias=7|30|90 → análisis del negocio para las
// gráficas de Reportes (tendencia, horas pico, ABC, margen por categoría,
// días de inventario, cuentas por pagar y mezcla de pagos).
const DIA = 86_400_000;

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "reportes", modulo: "dashboard" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);

  const pedidos = Number(new URL(request.url).searchParams.get("dias"));
  const dias = [7, 30, 90].includes(pedidos) ? pedidos : 30;
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
  const desdeAnterior = new Date(desde.getTime() - dias * DIA);

  const anuladas = await excluirAnuladas(prisma as any);
  const filtro = (gte: Date, lt: Date) => ({ fechaHora: { gte, lt }, estado: { not: "CANCELADA" as const }, ...anuladas });

  const [ventas, ventasAntes, pagos, lineas, productos, cuentas] = await Promise.all([
    prisma.venta.findMany({ where: filtro(desde, hoy), select: { fechaHora: true, totalNeto: true } }),
    prisma.venta.findMany({ where: filtro(desdeAnterior, desde), select: { fechaHora: true, totalNeto: true } }),
    prisma.pagoVenta.findMany({ where: { venta: filtro(desde, hoy) }, select: { metodo: true, monto: true } }),
    prisma.lineaDetalleVenta.findMany({
      where: { venta: filtro(desde, hoy) },
      select: {
        codigoItem: true,
        cantidad: true,
        subtotalLinea: true,
        costoUnitario: true,
        producto: { select: { descripcion: true, categoria: { select: { nombre: true } } } },
      },
    }),
    prisma.producto.findMany({
      where: { activo: true, esServicio: false },
      select: { codigoItem: true, descripcion: true, stockActual: true, grupoVariante: true },
    }),
    prisma.cuentaPorPagar.findMany({
      where: { estado: "PENDIENTE", saldo: { gt: 0 } },
      select: { saldo: true, fechaVencimiento: true },
    }),
  ]);

  const v = ventas.map((x) => ({ fecha: x.fechaHora, total: Number(x.totalNeto) }));
  const va = ventasAntes.map((x) => ({ fecha: x.fechaHora, total: Number(x.totalNeto) }));
  const actual = indicadores(v);
  const anterior = indicadores(va);

  // Por producto: venta (sin impuestos), unidades y costo congelado.
  const porProducto = new Map<string, { descripcion: string; venta: number; unidades: number }>();
  for (const l of lineas) {
    const p = porProducto.get(l.codigoItem) ?? { descripcion: l.producto.descripcion, venta: 0, unidades: 0 };
    p.venta += Number(l.subtotalLinea);
    p.unidades += Number(l.cantidad);
    porProducto.set(l.codigoItem, p);
  }
  const abc = clasificacionABC([...porProducto.entries()].map(([codigo, p]) => ({ codigo, descripcion: p.descripcion, venta: p.venta })));

  // Los modelos de variantes no llevan existencia propia: se omiten.
  const cobertura = coberturaInventario(
    productos
      .filter((p) => p.grupoVariante !== p.codigoItem)
      .map((p) => ({
        codigo: p.codigoItem,
        descripcion: p.descripcion,
        stock: Number(p.stockActual),
        vendido: porProducto.get(p.codigoItem)?.unidades ?? 0,
      })),
    dias
  );
  const ordenar = <T,>(lista: T[], fn: (a: T, b: T) => number) => [...lista].sort(fn).slice(0, 8);

  return NextResponse.json({
    dias,
    desde: desde.toISOString(),
    indicadores: {
      actual,
      anterior,
      cambio: {
        total: variacion(actual.total, anterior.total),
        tickets: variacion(actual.tickets, anterior.tickets),
        ticketPromedio: variacion(actual.ticketPromedio, anterior.ticketPromedio),
      },
    },
    serie: serieDiaria(v, desde, dias),
    mapa: mapaCalor(v),
    abc: { ...abc, filas: abc.filas.slice(0, 15), totalProductos: abc.filas.length },
    categorias: margenPorCategoria(
      lineas.map((l) => ({
        categoria: l.producto.categoria?.nombre ?? null,
        venta: Number(l.subtotalLinea),
        costo: l.costoUnitario != null ? Number(l.costoUnitario) * Number(l.cantidad) : null,
      }))
    ),
    cobertura: {
      resumen: cobertura.resumen,
      criticos: ordenar(
        cobertura.filas.filter((f) => f.estado === "CRITICO" || f.estado === "AGOTADO"),
        (a, b) => (a.diasCobertura ?? 0) - (b.diasCobertura ?? 0)
      ),
      sinMovimiento: ordenar(cobertura.filas.filter((f) => f.estado === "SIN_MOVIMIENTO" && f.stock > 0), (a, b) => b.stock - a.stock),
      exceso: ordenar(cobertura.filas.filter((f) => f.estado === "EXCESO"), (a, b) => (b.diasCobertura ?? 0) - (a.diasCobertura ?? 0)),
    },
    cuentas: antiguedadCuentas(cuentas.map((c) => ({ saldo: Number(c.saldo), vence: c.fechaVencimiento }))),
    pagos: mezclaPagos(pagos.map((p) => ({ metodo: p.metodo, monto: Number(p.monto) }))),
  });
}
