import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, any> = {};
  const STRING_FIELDS = ["nombre", "telefono", "email", "direccion", "contacto"] as const;
  for (const f of STRING_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.activo !== undefined) data.activo = !!body.activo;
  if (body.limiteCredito !== undefined) {
    const v = body.limiteCredito === "" || body.limiteCredito === null ? null : Number(body.limiteCredito);
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      return NextResponse.json({ error: "Límite de crédito inválido" }, { status: 400 });
    }
    data.limiteCredito = v === null ? null : Math.round(v * 100) / 100;
  }

  try {
    const existente = await prisma.proveedor.findUnique({
      where: { idProveedor: id },
    });
    if (!existente) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const proveedor = await tx.proveedor.update({
        where: { idProveedor: id },
        data,
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Proveedor actualizado: ${proveedor.nombre}`,
          moduloSistema: "CONFIGURACION",
          jsonPayload: { idProveedor: id, cambios: Object.keys(data) },
        },
      });
      return proveedor;
    });

    return NextResponse.json({ idProveedor: actualizado.idProveedor });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al actualizar proveedor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await params;

  try {
    const existente = await prisma.proveedor.findUnique({
      where: { idProveedor: id },
    });
    if (!existente) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    // Baja lógica para no romper FK de pedidos históricos.
    await prisma.$transaction(async (tx) => {
      await tx.proveedor.update({
        where: { idProveedor: id },
        data: { activo: false },
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Proveedor desactivado: ${existente.nombre}`,
          moduloSistema: "CONFIGURACION",
          jsonPayload: { idProveedor: id },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al eliminar proveedor" },
      { status: 500 }
    );
  }
}