import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { PromocionError, promocionesVigentes, validarPromocion } from "@/lib/promociones";

// ============================================================
// GET  /api/promociones            → admin: todas las promociones
// GET  /api/promociones?vigentes=1 → cualquier usuario: las vigentes
//                                    (el POS las aplica en el carrito)
// POST /api/promociones            → admin: alta
// ============================================================

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { searchParams } = new URL(request.url);

  if (searchParams.get("vigentes") === "1") {
    return NextResponse.json({ promociones: await promocionesVigentes(prisma) });
  }
  if (auth.user.rol !== "ADMINISTRADORA") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const filas = await prisma.promocion.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({
    promociones: filas.map((p) => ({
      ...p,
      valor: p.valor != null ? Number(p.valor) : null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    const data = validarPromocion(body);
    if (data.codigoItem) {
      const existe = await prisma.producto.findFirst({ where: { codigoItem: data.codigoItem } });
      if (!existe) throw new PromocionError("El producto de la promoción no existe", 404);
    }
    if (data.idCategoria) {
      const existe = await prisma.categoria.findFirst({ where: { id: data.idCategoria } });
      if (!existe) throw new PromocionError("La categoría de la promoción no existe", 404);
    }
    const creada = await prisma.promocion.create({ data });
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Promoción creada: ${creada.nombre}`,
        moduloSistema: "INVENTARIO",
        jsonPayload: { idPromocion: creada.idPromocion, tipo: creada.tipo },
      },
    });
    return NextResponse.json(
      { promocion: { ...creada, valor: creada.valor != null ? Number(creada.valor) : null } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof PromocionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[promociones:post]", error);
    return NextResponse.json({ error: "Error al crear la promoción" }, { status: 500 });
  }
}
