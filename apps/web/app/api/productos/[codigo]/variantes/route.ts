import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { claveProducto } from "@/lib/tenant-keys";
import { conStockDeSucursal } from "@/lib/existencias";
import { generarVariantes, VarianteError } from "@/lib/variantes";

// ============================================================
// GET  /api/productos/[codigo]/variantes → productos del mismo modelo
// POST /api/productos/[codigo]/variantes { ejes: [{ nombre, valores[] }] }
//      → genera las combinaciones que falten (permiso de inventario)
// ============================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ codigo: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { codigo } = await params;
  const base = await prisma.producto.findUnique({ where: claveProducto(codigo) });
  if (!base) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  const grupo = base.grupoVariante ?? base.codigoItem;
  const variantes = await prisma.producto.findMany({
    where: { grupoVariante: grupo, activo: true },
    orderBy: { codigoItem: "asc" },
  });
  const conStock = await conStockDeSucursal(prisma, auth.user.idSucursal, variantes);
  return NextResponse.json({
    grupo,
    variantes: conStock.map((v) => ({
      codigoItem: v.codigoItem,
      descripcion: v.descripcion,
      atributosVariante: v.atributosVariante,
      precioUnitario: Number(v.precioUnitario),
      stockActual: Number(v.stockActual),
      codigoBarras: v.codigoBarras,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ codigo: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { codigo } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const resultado = await prisma.$transaction((tx) => generarVariantes(tx, codigo, body?.ejes));
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Variantes de ${codigo}: ${resultado.creadas.length} creadas`,
        moduloSistema: "INVENTARIO",
        jsonPayload: resultado,
      },
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof VarianteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[variantes:post]", error);
    return NextResponse.json({ error: "Error al generar variantes" }, { status: 500 });
  }
}
