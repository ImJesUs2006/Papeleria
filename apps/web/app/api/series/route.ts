import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { registrarSeries, SerieError } from "@/lib/series";
import { esObjetoJson } from "@/lib/validacion";
import { tienePermiso } from "@/lib/permisos";

// ============================================================
// GET  /api/series?codigoItem=…[&estado=DISPONIBLE|VENDIDO][&q=…]
//      → series del producto (cualquier usuario: el POS las consulta)
// GET  /api/series?todas=1[&estado][&q] → todas las series (inventario)
// POST /api/series { codigoItem, series[] } → alta de unidades con serie en
//      la sucursal activa (permiso de inventario)
// ============================================================

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { searchParams } = new URL(request.url);
  const codigoItem = String(searchParams.get("codigoItem") ?? "").trim();
  const estado = searchParams.get("estado");
  const q = String(searchParams.get("q") ?? "").trim().toUpperCase();
  // La lista completa es para quien maneja inventario; el POS siempre filtra.
  const todas = searchParams.get("todas") === "1" && tienePermiso(auth.user, "inventario");
  if (!codigoItem && !q && !todas) {
    return NextResponse.json({ error: "Indica codigoItem o q" }, { status: 400 });
  }
  const series = await prisma.numeroSerie.findMany({
    where: {
      ...(codigoItem ? { codigoItem } : {}),
      ...(estado === "DISPONIBLE" || estado === "VENDIDO" ? { estado } : {}),
      ...(q
        ? todas
          ? {
              OR: [
                { serie: { contains: q } },
                { codigoItem: { contains: q, mode: "insensitive" as const } },
                { producto: { descripcion: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : { serie: { contains: q } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { producto: { select: { descripcion: true } } },
  });
  return NextResponse.json({
    series: series.map((s) => ({
      idSerie: s.idSerie,
      serie: s.serie,
      codigoItem: s.codigoItem,
      descripcion: s.producto.descripcion,
      estado: s.estado,
      idSucursal: s.idSucursal,
      folioVenta: s.folioVenta,
      registrada: s.createdAt,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  if (!auth.user.idSucursal) {
    return NextResponse.json({ error: "Tu sesión no tiene sucursal" }, { status: 409 });
  }

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const series = await prisma.$transaction((tx) =>
      registrarSeries(tx, {
        codigoItem: String(body?.codigoItem ?? "").trim(),
        idSucursal: auth.user.idSucursal!,
        series: body?.series,
        idUsuario: auth.user.idPersona,
      })
    );
    return NextResponse.json({ registradas: series.length, series }, { status: 201 });
  } catch (error) {
    if (error instanceof SerieError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[series:post]", error);
    return NextResponse.json({ error: "Error al registrar las series" }, { status: 500 });
  }
}
