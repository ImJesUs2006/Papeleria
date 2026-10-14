import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// PATCH  /api/promociones/[id]  { activa }  → activar / pausar
// DELETE /api/promociones/[id]              → eliminar
// Solo administradora.
// ============================================================

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  if (typeof body?.activa !== "boolean") {
    return NextResponse.json({ error: "Indica activa: true | false" }, { status: 400 });
  }

  const r = await prisma.promocion.updateMany({
    where: { idPromocion: id },
    data: { activa: body.activa },
  });
  if (r.count === 0) {
    return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, activa: body.activa });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  // Las ventas guardan el NOMBRE de la promoción en la línea, así que
  // eliminarla no altera el historial.
  const r = await prisma.promocion.deleteMany({ where: { idPromocion: id } });
  if (r.count === 0) {
    return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
  }
  await prisma.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `Promoción eliminada (${id})`,
      moduloSistema: "INVENTARIO",
    },
  });
  return NextResponse.json({ ok: true });
}
