import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { validar, esObjetoJson } from "@/lib/validacion";
import { PROVEEDOR_PATCH_SCHEMA, PROVEEDOR_SCHEMA } from "@/lib/esquemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const v = validar(PROVEEDOR_PATCH_SCHEMA, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, campos: v.campos }, { status: 400 });
  }
  // Solo los campos enviados; los vacíos opcionales quedan en null.
  const data: Record<string, unknown> = {};
  for (const [k, valor] of Object.entries(v.datos)) {
    if (body[k] !== undefined) data[k] = valor ?? null;
  }
  if (data.diasCredito === null) data.diasCredito = 0;

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
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
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