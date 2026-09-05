import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

const ESTADOS_VALIDOS = ["PENDIENTE", "ENTREGADO", "CANCELADO", "EN_RUTA"];

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, any> = {};
  if (body.estado !== undefined) {
    if (!ESTADOS_VALIDOS.includes(body.estado)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    data.estado = body.estado;
  }
  if (body.fechaEntrega !== undefined) {
    if (body.fechaEntrega) {
      const f = new Date(body.fechaEntrega);
      if (isNaN(f.getTime())) {
        return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
      }
      data.fechaEntrega = f;
    } else {
      data.fechaEntrega = null;
    }
  }
  if (body.notas !== undefined) data.notas = body.notas || null;

  try {
    const existente = await prisma.pedidoProveedor.findUnique({
      where: { idPedido: params.id },
      include: { proveedor: { select: { nombre: true } } },
    });
    if (!existente) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedidoProveedor.update({
        where: { idPedido: params.id },
        data,
      });
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Pedido a ${existente.proveedor.nombre} actualizado: estado ${pedido.estado}`,
          moduloSistema: "INVENTARIO",
          jsonPayload: { idPedido: params.id, cambios: Object.keys(data) },
        },
      });
      return pedido;
    });

    return NextResponse.json({
      idPedido: actualizado.idPedido,
      estado: actualizado.estado,
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar pedido" }, { status: 500 });
  }
}