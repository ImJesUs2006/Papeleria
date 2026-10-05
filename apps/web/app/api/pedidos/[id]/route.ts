import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { registrarMovimientosKardex } from "@/lib/kardex";
import { tenantDb } from "@/lib/tenant";
import { claveProducto } from "@/lib/tenant-keys";

const ESTADOS_VALIDOS = ["PENDIENTE", "ENTREGADO", "CANCELADO", "EN_RUTA"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;
  const { id } = await params;

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
      where: { idPedido: id },
      include: {
        proveedor: { select: { nombre: true } },
        items: { include: { producto: { select: { esServicio: true } } } },
      },
    });
    if (!existente) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    // ENTREGADO y CANCELADO son estados finales: reabrir un pedido ya
    // recibido duplicaría (o dejaría huérfana) la entrada de mercancía.
    const esFinal = existente.estado === "ENTREGADO" || existente.estado === "CANCELADO";
    if (data.estado !== undefined && data.estado !== existente.estado && esFinal) {
      return NextResponse.json(
        { error: `El pedido ya está ${existente.estado} y no puede cambiar de estado` },
        { status: 409 }
      );
    }
    const recibe = data.estado === "ENTREGADO" && existente.estado !== "ENTREGADO";
    if (recibe && data.fechaEntrega === undefined && !existente.fechaEntrega) {
      data.fechaEntrega = new Date();
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      // Transición condicionada: dos recepciones simultáneas no duplican stock.
      const transicion = await tx.pedidoProveedor.updateMany({
        where: recibe
          ? { idPedido: id, estado: { notIn: ["ENTREGADO", "CANCELADO"] } }
          : { idPedido: id },
        data,
      });
      if (transicion.count === 0) {
        throw Object.assign(new Error("El pedido ya fue recibido o cancelado"), { status: 409 });
      }
      const pedido = await tx.pedidoProveedor.findUniqueOrThrow({ where: { idPedido: id } });

      // Recepción: la mercancía entra al inventario con su trazo en Kardex.
      if (recibe) {
        const fisicos = existente.items.filter((i) => !i.producto.esServicio && i.cantidad > 0);
        for (const item of fisicos) {
          await tx.producto.update({
            where: claveProducto(item.codigoItem),
            data: { stockActual: { increment: item.cantidad } },
          });
        }
        await registrarMovimientosKardex(
          tx,
          fisicos.map((item) => ({
            codigoItem: item.codigoItem,
            tipo: "ENTRADA" as const,
            cantidad: item.cantidad,
            motivo: `Recepción de pedido a ${existente.proveedor.nombre}`.slice(0, 190),
            idUsuario: user.idPersona,
          }))
        );
      }
      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Pedido a ${existente.proveedor.nombre} actualizado: estado ${pedido.estado}`,
          moduloSistema: "INVENTARIO",
          jsonPayload: { idPedido: id, cambios: Object.keys(data) },
        },
      });
      return pedido;
    });

    return NextResponse.json({
      idPedido: actualizado.idPedido,
      estado: actualizado.estado,
    });
  } catch (error: any) {
    if (error?.status === 409) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al actualizar pedido" }, { status: 500 });
  }
}