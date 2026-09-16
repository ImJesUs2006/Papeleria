import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getReporteData, ReporteError } from "@/lib/reports";

// ============================================================
// GET /api/reportes/data → vista previa interactiva (JSON).
// Devuelve las mismas columnas/filas que el Excel, recortadas
// a MAX_PREVIEW para no saturar el navegador.
// ============================================================

const MAX_PREVIEW = 300;

export async function GET(request: Request) {
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

  try {
    const reporte = await getReporteData(tipo, { desde, hasta, idCaja });
    const totalFilas = reporte.rows.length;
    const rows = reporte.rows.slice(0, MAX_PREVIEW).map((r) =>
      r.map((c) => (typeof c === "number" ? c : String(c ?? "")))
    );

    return NextResponse.json({
      title: reporte.title,
      headers: reporte.columns.map((c) => c.header),
      numFmt: reporte.columns.map((c) => c.numFmt || null),
      total: reporte.columns.map((c) => c.total || false),
      rows,
      totalFilas,
      truncado: totalFilas > MAX_PREVIEW,
    });
  } catch (error: any) {
    if (error instanceof ReporteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error?.message || "Error al generar vista previa" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";