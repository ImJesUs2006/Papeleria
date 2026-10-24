import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// PATCH  /api/categorias/[id] → { nombre?, color?, orden? }
// DELETE /api/categorias/[id] → la borra; sus productos quedan "sin categoría"
// ============================================================

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: { nombre?: string; color?: string; orden?: number } = {};
  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre ?? "").trim();
    if (nombre.length < 2 || nombre.length > 60) {
      return NextResponse.json({ error: "El nombre debe tener entre 2 y 60 caracteres" }, { status: 400 });
    }
    const repetida = await prisma.categoria.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" }, NOT: { id } },
    });
    if (repetida) {
      return NextResponse.json({ error: "Ya existe una categoría con ese nombre" }, { status: 409 });
    }
    data.nombre = nombre;
  }
  if (body?.color !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(body.color))) {
      return NextResponse.json({ error: "Color inválido (usa #RRGGBB)" }, { status: 400 });
    }
    data.color = String(body.color);
  }
  if (body?.orden !== undefined) {
    const orden = Number(body.orden);
    if (!Number.isInteger(orden) || orden < 0 || orden > 10_000) {
      return NextResponse.json({ error: "Orden inválido" }, { status: 400 });
    }
    data.orden = orden;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const existe = await prisma.categoria.findUnique({ where: { id } });
  if (!existe) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
  const categoria = await prisma.categoria.update({ where: { id }, data });
  return NextResponse.json({ categoria });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  const existe = await prisma.categoria.findUnique({ where: { id } });
  if (!existe) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });

  const liberados = await prisma.$transaction(async (tx) => {
    const r = await tx.producto.updateMany({ where: { idCategoria: id }, data: { idCategoria: null } });
    // Las promociones de esa categoría ya no tendrían a qué aplicar.
    await tx.promocion.updateMany({ where: { idCategoria: id }, data: { activa: false } });
    await tx.categoria.delete({ where: { id } });
    await tx.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Categoría eliminada: ${existe.nombre} (${r.count} productos quedaron sin categoría)`,
        moduloSistema: "INVENTARIO",
        jsonPayload: { id, nombre: existe.nombre, productos: r.count },
      },
    });
    return r.count;
  });
  return NextResponse.json({ ok: true, productosSinCategoria: liberados });
}
