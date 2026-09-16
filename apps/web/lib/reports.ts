import { prisma } from "@papeleria/database";
import type { ExportColumn } from "@/lib/export-exceljs";

// ============================================================
// Fuente única de datos para reportes.
// La usan tanto la vista previa (JSON) como el export (Excel),
// garantizando que ambos coincidan exactamente.
// ============================================================

export const MONEDA_FMT = '"$"#,##0.00';

export interface ReporteData {
  title: string;
  sheetName: string;
  columns: ExportColumn[];
  rows: (string | number)[][];
}

export interface ReporteParams {
  desde?: string | null;
  hasta?: string | null;
  idCaja?: string | null;
}

export class ReporteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function rangoFecha(desde?: string | null, hasta?: string | null) {
  const where: any = {};
  if (desde || hasta) {
    where.fechaHora = {};
    if (desde) where.fechaHora.gte = new Date(desde);
    if (hasta) where.fechaHora.lte = new Date(hasta + "T23:59:59");
  }
  return where;
}

export async function getReporteData(
  tipo: string,
  params: ReporteParams
): Promise<ReporteData> {
  switch (tipo) {
    case "inventario": {
      const productos = await prisma.producto.findMany({
        where: { activo: true },
        orderBy: { descripcion: "asc" },
      });
      return {
        title: "Inventario completo",
        sheetName: "Inventario",
        columns: [
          { header: "Código", width: 16 },
          { header: "Descripción", width: 34 },
          { header: "Precio Unitario", numFmt: MONEDA_FMT, total: true },
          { header: "Stock Actual", total: true },
          { header: "Stock Mínimo" },
          { header: "Ubicación" },
          { header: "Proveedor" },
          { header: "Tipo Impresión" },
          { header: "Reabastecer" },
        ],
        rows: productos.map((p) => [
          p.codigoItem,
          p.descripcion,
          Number(p.precioUnitario),
          p.stockActual,
          p.stockMinimo,
          p.ubicacionEstante || "",
          p.proveedor || "",
          p.tipoImpresion || "",
          p.stockActual <= p.stockMinimo ? "SÍ" : "",
        ]),
      };
    }

    case "reabastecimiento": {
      const todos = await prisma.producto.findMany({ where: { activo: true } });
      const bajos = todos
        .filter((p) => p.stockActual <= p.stockMinimo)
        .sort((a, b) => a.stockActual - b.stockActual);
      return {
        title: "Productos por reabastecer",
        sheetName: "Reabastecimiento",
        columns: [
          { header: "Código", width: 16 },
          { header: "Descripción", width: 34 },
          { header: "Stock Actual", total: true },
          { header: "Stock Mínimo", total: true },
          { header: "Déficit", total: true },
          { header: "Proveedor" },
          { header: "Ubicación" },
        ],
        rows: bajos.map((p) => [
          p.codigoItem,
          p.descripcion,
          p.stockActual,
          p.stockMinimo,
          p.stockMinimo - p.stockActual,
          p.proveedor || "Sin proveedor",
          p.ubicacionEstante || "",
        ]),
      };
    }

    case "ventas": {
      const ventas = await prisma.venta.findMany({
        where: rangoFecha(params.desde, params.hasta),
        include: { lineasDetalle: true, usuario: true },
        orderBy: { fechaHora: "desc" },
      });
      return {
        title: "Reporte de ventas",
        sheetName: "Ventas",
        columns: [
          { header: "Folio", width: 22 },
          { header: "Fecha" },
          { header: "Hora" },
          { header: "Cajera", width: 22 },
          { header: "Método Pago" },
          { header: "Subtotal", numFmt: MONEDA_FMT, total: true },
          { header: "IVA", numFmt: MONEDA_FMT, total: true },
          { header: "Total", numFmt: MONEDA_FMT, total: true },
          { header: "Estado" },
          { header: "Artículos", total: true },
        ],
        rows: ventas.map((v) => [
          v.folioVenta,
          v.fechaHora.toLocaleDateString("es-MX"),
          v.fechaHora.toLocaleTimeString("es-MX"),
          v.usuario.nombre,
          v.metodoPago,
          Number(v.subtotal),
          Number(v.iva),
          Number(v.totalNeto),
          v.estado,
          v.lineasDetalle.reduce((s, l) => s + l.cantidad, 0),
        ]),
      };
    }

    case "ventas-por-producto": {
      const whereLinea: any = {};
      if (params.desde || params.hasta) {
        whereLinea.venta = rangoFecha(params.desde, params.hasta);
      }
      const lineas = await prisma.lineaDetalleVenta.findMany({
        where: whereLinea,
        include: { producto: true },
      });
      const agg = new Map<string, { descripcion: string; cantidad: number; total: number }>();
      for (const l of lineas) {
        const e = agg.get(l.codigoItem);
        if (e) {
          e.cantidad += l.cantidad;
          e.total += Number(l.subtotalLinea);
        } else {
          agg.set(l.codigoItem, {
            descripcion: l.producto.descripcion,
            cantidad: l.cantidad,
            total: Number(l.subtotalLinea),
          });
        }
      }
      const sorted = Array.from(agg.entries()).sort((a, b) => b[1].total - a[1].total);
      return {
        title: "Ventas por producto",
        sheetName: "Ventas por Producto",
        columns: [
          { header: "Código", width: 16 },
          { header: "Descripción", width: 34 },
          { header: "Unidades Vendidas", total: true },
          { header: "Total Generado", numFmt: MONEDA_FMT, total: true },
        ],
        rows: sorted.map(([codigo, v]) => [codigo, v.descripcion, v.cantidad, v.total]),
      };
    }

    case "top-mas-vendidos": {
      const lineas = await prisma.lineaDetalleVenta.findMany({
        include: { producto: true },
      });
      const agg = new Map<string, { descripcion: string; cantidad: number; total: number }>();
      for (const l of lineas) {
        const e = agg.get(l.codigoItem);
        if (e) {
          e.cantidad += l.cantidad;
          e.total += Number(l.subtotalLinea);
        } else {
          agg.set(l.codigoItem, {
            descripcion: l.producto.descripcion,
            cantidad: l.cantidad,
            total: Number(l.subtotalLinea),
          });
        }
      }
      const top20 = Array.from(agg.entries())
        .sort((a, b) => b[1].cantidad - a[1].cantidad)
        .slice(0, 20);
      return {
        title: "Top 20 más vendidos",
        sheetName: "Top 20",
        columns: [
          { header: "Rank" },
          { header: "Código", width: 16 },
          { header: "Descripción", width: 34 },
          { header: "Unidades Vendidas", total: true },
          { header: "Total Generado", numFmt: MONEDA_FMT, total: true },
        ],
        rows: top20.map(([codigo, v], i) => [i + 1, codigo, v.descripcion, v.cantidad, v.total]),
      };
    }

    case "cierre-caja": {
      if (!params.idCaja) throw new ReporteError("Se requiere idCaja para el cierre de caja");
      const sesion = await prisma.sesionCaja.findUnique({
        where: { idCaja: params.idCaja },
        include: { ventas: { include: { lineasDetalle: true } }, usuario: true },
      });
      if (!sesion) throw new ReporteError("Sesión de caja no encontrada", 404);

      // Desglose por método y por día natural de la caja (corte ciego).
      const porMetodo = new Map<string, { total: number; ventas: number }>();
      for (const v of sesion.ventas) {
        const e = porMetodo.get(v.metodoPago) || { total: 0, ventas: 0 };
        e.total += Number(v.totalNeto);
        e.ventas += 1;
        porMetodo.set(v.metodoPago, e);
      }
      const totalVentas = sesion.ventas.reduce((s, v) => s + Number(v.totalNeto), 0);
      const esperadoEfectivo =
        Number(sesion.fondoInicial) +
        Number(sesion.totalVentasEfectivo) -
        (Number(sesion.totalEgresos) || 0);
      const esperadoTotal =
        Number(sesion.fondoInicial) +
        Number(sesion.totalVentasEfectivo) +
        Number(sesion.totalVentasDigital) +
        Number(sesion.totalRecargas) -
        (Number(sesion.totalEgresos) || 0);

      const rows: (string | number)[][] = [
        ["Cajera", sesion.usuario.nombre],
        ["Apertura", sesion.horaApertura.toLocaleString("es-MX")],
        ["Cierre", sesion.horaCierre?.toLocaleString("es-MX") || "En proceso"],
        ["Estado", sesion.estado],
        ["", ""],
        ["CONCEPTO", "MONTO"],
        ["Fondo inicial", Number(sesion.fondoInicial)],
        ["Ventas efectivo", Number(sesion.totalVentasEfectivo)],
        ["Ventas digital/tarjeta", Number(sesion.totalVentasDigital)],
        ["Recargas", Number(sesion.totalRecargas)],
        ["Egresos (reembolsos/abonos)", Number(sesion.totalEgresos) || 0],
        ["Total esperado", esperadoTotal],
        ["", ""],
        ["CONTEO DECLARADO", "MONTO"],
        ["Efectivo contado", Number(sesion.efectivoContado ?? 0)],
        ["Vouchers contados", Number(sesion.vouchersContado ?? 0)],
        ["Recargas contadas", Number(sesion.recargasContado ?? 0)],
        ["Total contado", Number(sesion.efectivoContado ?? 0) + Number(sesion.vouchersContado ?? 0) + Number(sesion.recargasContado ?? 0)],
        ["", ""],
        ["DESCUADRE", Number(sesion.faltanteTotal ?? 0)],
        ["¿Hubo descuadre?", sesion.descuadre ? "SÍ" : "NO"],
      ];

      // Desglose por método de pago.
      for (const [metodo, v] of porMetodo.entries()) {
        rows.push([`Ventas ${metodo}`, v.total]);
      }

      return {
        title: `Cierre de caja ${sesion.idCaja}`,
        sheetName: "Cierre de Caja",
        columns: [
          { header: "Concepto", width: 28 },
          { header: "Monto", numFmt: MONEDA_FMT },
        ],
        rows,
      };
    }

    case "bitacora": {
      const logs = await prisma.bitacoraLog.findMany({
        include: { usuario: true },
        orderBy: { fechaHora: "desc" },
        take: 5000,
      });
      return {
        title: "Bitácora de auditoría",
        sheetName: "Bitácora",
        columns: [
          { header: "Fecha/Hora", width: 22 },
          { header: "Usuario", width: 20 },
          { header: "Acción", width: 40 },
          { header: "Módulo" },
          { header: "Detalles", width: 30 },
          { header: "IP" },
        ],
        rows: logs.map((l) => [
          l.fechaHora.toLocaleString("es-MX"),
          l.usuario?.nombre || "Sistema",
          l.accion,
          l.moduloSistema,
          l.detallesError || "",
          l.ipOrigen || "",
        ]),
      };
    }

    default:
      throw new ReporteError(`Tipo de reporte desconocido: "${tipo}"`);
  }
}

export const TIPOS_REPORTE = [
  "inventario",
  "reabastecimiento",
  "ventas",
  "ventas-por-producto",
  "top-mas-vendidos",
  "cierre-caja",
  "bitacora",
] as const;

export type TipoReporte = (typeof TIPOS_REPORTE)[number];