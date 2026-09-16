import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { getSession } from "@/lib/auth";
import { buildStyledWorkbook } from "@/lib/export-exceljs";
import { getReporteData, ReporteError } from "@/lib/reports";

// ============================================================
// GET /api/reportes  → descarga Excel ejecutiva (exceljs)
//   Encabezado con color, fila congelada, auto-filtro,
//   autoancho, formato de moneda y fila de totales.
// ============================================================

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
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const idCaja = searchParams.get("idCaja");

    const reporte = await getReporteData(tipo, { desde, hasta, idCaja });

    const buffer = await buildStyledWorkbook({
      sheetName: reporte.sheetName,
      columns: reporte.columns,
      rows: reporte.rows,
      headerColor: "0F766E",
      totalLabel: "TOTAL",
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: session.idPersona,
        accion: `Exportación de reporte: ${tipo}`,
        moduloSistema: "REPORTES",
        jsonPayload: { tipo, filas: reporte.rows.length },
      },
    });

    const fileName = `${tipo}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    if (error instanceof ReporteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error?.message || "Error al generar reporte" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";