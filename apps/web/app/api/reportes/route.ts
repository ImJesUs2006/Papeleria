import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { getSession } from "@/lib/auth";
import { buildExcelBuffer } from "@/lib/excel";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (session.rol !== "ADMINISTRADORA") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") || "inventario";

    let buffer: Buffer;
    let fileName: string;

    switch (tipo) {
      case "inventario": {
        const productos = await prisma.producto.findMany({
          where: { activo: true },
          orderBy: { descripcion: "asc" },
        });

        const headers = [
          "Código",
          "Descripción",
          "Precio Unitario",
          "Stock Actual",
          "Stock Mínimo",
          "Ubicación",
          "Proveedor",
          "Tipo Impresión",
          "Necesita Reabastecimiento",
        ];

        const data = productos.map((p) => [
          p.codigoItem,
          p.descripcion,
          Number(p.precioUnitario),
          p.stockActual,
          p.stockMinimo,
          p.ubicacionEstante || "",
          p.proveedor || "",
          p.tipoImpresion || "",
          p.stockActual <= p.stockMinimo ? "SÍ" : "",
        ]);

        buffer = buildExcelBuffer(headers, data, "Inventario");
        fileName = `inventario_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      case "reabastecimiento": {
        // Fetch all active products, filter in JS (Prisma can't compare two columns directly)
        const todos = await prisma.producto.findMany({
          where: { activo: true },
        });

        const productosBajos = todos
          .filter((p) => p.stockActual <= p.stockMinimo)
          .sort((a, b) => a.stockActual - b.stockActual);

        const headers = [
          "Código",
          "Descripción",
          "Stock Actual",
          "Stock Mínimo",
          "Déficit",
          "Proveedor",
          "Ubicación",
        ];

        const data = productosBajos.map((p) => [
          p.codigoItem,
          p.descripcion,
          p.stockActual,
          p.stockMinimo,
          p.stockMinimo - p.stockActual,
          p.proveedor || "Sin proveedor",
          p.ubicacionEstante || "",
        ]);

        buffer = buildExcelBuffer(headers, data, "Reabastecimiento");
        fileName = `reabastecimiento_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      case "ventas": {
        const desde = searchParams.get("desde");
        const hasta = searchParams.get("hasta");

        const where: any = {};
        if (desde || hasta) {
          where.fechaHora = {};
          if (desde) where.fechaHora.gte = new Date(desde);
          if (hasta) where.fechaHora.lte = new Date(hasta + "T23:59:59");
        }

        const ventas = await prisma.venta.findMany({
          where,
          include: {
            lineasDetalle: true,
            usuario: true,
          },
          orderBy: { fechaHora: "desc" },
        });

        const headers = [
          "Folio",
          "Fecha",
          "Hora",
          "Cajera",
          "Método Pago",
          "Subtotal",
          "IVA",
          "Total",
          "Estado",
          "Artículos",
        ];

        const data = ventas.map((v) => [
          v.folioVenta,
          v.fechaHora.toLocaleDateString("es-MX"),
          v.fechaHora.toLocaleTimeString("es-MX"),
          v.usuario.nombre,
          v.metodoPago,
          Number(v.subtotal),
          Number(v.iva),
          Number(v.totalNeto),
          v.estado,
          v.lineasDetalle.reduce((sum, l) => sum + l.cantidad, 0),
        ]);

        buffer = buildExcelBuffer(headers, data, "Ventas");
        fileName = `ventas_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      case "ventas-por-producto": {
        const desde = searchParams.get("desde");
        const hasta = searchParams.get("hasta");

        const whereLinea: any = {};
        if (desde || hasta) {
          whereLinea.venta = { fechaHora: {} };
          if (desde) whereLinea.venta.fechaHora.gte = new Date(desde);
          if (hasta) whereLinea.venta.fechaHora.lte = new Date(hasta + "T23:59:59");
        }

        const lineas = await prisma.lineaDetalleVenta.findMany({
          where: whereLinea,
          include: { producto: true },
        });

        // Aggregate by product
        const agg = new Map<string, { descripcion: string; cantidad: number; total: number }>();
        for (const l of lineas) {
          const existing = agg.get(l.codigoItem);
          if (existing) {
            existing.cantidad += l.cantidad;
            existing.total += Number(l.subtotalLinea);
          } else {
            agg.set(l.codigoItem, {
              descripcion: l.producto.descripcion,
              cantidad: l.cantidad,
              total: Number(l.subtotalLinea),
            });
          }
        }

        const sorted = Array.from(agg.entries())
          .sort((a, b) => b[1].total - a[1].total);

        const headers = ["Código", "Descripción", "Unidades Vendidas", "Total Generado"];
        const data = sorted.map(([codigo, v]) => [
          codigo,
          v.descripcion,
          v.cantidad,
          v.total,
        ]);

        buffer = buildExcelBuffer(headers, data, "Ventas por Producto");
        fileName = `ventas_por_producto_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      case "top-mas-vendidos": {
        const lineas = await prisma.lineaDetalleVenta.findMany({
          include: { producto: true },
        });

        const agg = new Map<string, { descripcion: string; cantidad: number; total: number }>();
        for (const l of lineas) {
          const existing = agg.get(l.codigoItem);
          if (existing) {
            existing.cantidad += l.cantidad;
            existing.total += Number(l.subtotalLinea);
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

        const headers = ["Rank", "Código", "Descripción", "Unidades Vendidas", "Total Generado"];
        const data = top20.map(([codigo, v], i) => [
          i + 1,
          codigo,
          v.descripcion,
          v.cantidad,
          v.total,
        ]);

        buffer = buildExcelBuffer(headers, data, "Top 20 Más Vendidos");
        fileName = `top_20_vendidos_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      case "cierre-caja": {
        const idCaja = searchParams.get("idCaja");
        if (!idCaja) {
          return NextResponse.json(
            { error: "Se requiere idCaja para reporte de cierre" },
            { status: 400 }
          );
        }

        const sesion = await prisma.sesionCaja.findUnique({
          where: { idCaja },
          include: {
            ventas: { include: { lineasDetalle: true } },
            usuario: true,
          },
        });

        if (!sesion) {
          return NextResponse.json(
            { error: "Sesión de caja no encontrada" },
            { status: 404 }
          );
        }

        // Separate by payment method and sale type
        const efectivo = sesion.ventas
          .filter((v) => v.metodoPago === "EFECTIVO")
          .reduce((sum, v) => sum + Number(v.totalNeto), 0);
        const digital = sesion.ventas
          .filter((v) => v.metodoPago !== "EFECTIVO")
          .reduce((sum, v) => sum + Number(v.totalNeto), 0);

        const headers = [
          "Concepto",
          "Monto",
        ];
        const data = [
          ["Fondo Inicial", Number(sesion.fondoInicial)],
          ["", ""],
          ["--- VENTAS PAPELERÍA ---", ""],
          ["Total Efectivo Papelería", efectivo],
          ["Total Digital Papelería", digital],
          ["Subtotal Papelería", efectivo + digital],
          ["", ""],
          ["--- RECARGAS ---", ""],
          ["Total Recargas", Number(sesion.totalRecargas)],
          ["", ""],
          ["=== RESUMEN ===", ""],
          ["Fondo Inicial", Number(sesion.fondoInicial)],
          ["+ Ventas Papelería", efectivo + digital],
          ["+ Recargas", Number(sesion.totalRecargas)],
          ["= Total Esperado en Caja", Number(sesion.fondoInicial) + efectivo + digital + Number(sesion.totalRecargas)],
          ["", ""],
          ["Cajera", sesion.usuario.nombre],
          ["Apertura", sesion.horaApertura.toLocaleString("es-MX")],
          ["Cierre", sesion.horaCierre?.toLocaleString("es-MX") || "Abierta"],
          ["Estado", sesion.estado],
        ];

        buffer = buildExcelBuffer(headers, data, "Cierre de Caja");
        fileName = `cierre_caja_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      case "bitacora": {
        const logs = await prisma.bitacoraLog.findMany({
          include: { usuario: true },
          orderBy: { fechaHora: "desc" },
          take: 5000,
        });

        const headers = [
          "Fecha/Hora",
          "Usuario",
          "Acción",
          "Módulo",
          "Detalles",
          "IP",
        ];

        const data = logs.map((l) => [
          l.fechaHora.toLocaleString("es-MX"),
          l.usuario?.nombre || "Sistema",
          l.accion,
          l.moduloSistema,
          l.detallesError || "",
          l.ipOrigen || "",
        ]);

        buffer = buildExcelBuffer(headers, data, "Bitácora");
        fileName = `bitacora_${new Date().toISOString().slice(0, 10)}.xlsx`;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Tipo de reporte desconocido: "${tipo}"` },
          { status: 400 }
        );
    }

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: session.idPersona,
        accion: `Exportación de reporte: ${tipo}`,
        moduloSistema: "REPORTES",
        jsonPayload: { tipo, fileName },
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error al generar reporte" },
      { status: 500 }
    );
  }
}
