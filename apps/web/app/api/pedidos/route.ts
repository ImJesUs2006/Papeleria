import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

const ESTADOS_VALIDOS = ["PENDIENTE", "ENTREGADO", "CANCELADO", "EN_RUTA"];

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");
  const soloPendientes = searchParams.get("pendientes") === "true";

  try {
    const pedidos = await prisma.pedidoProveedor.findMany({
      where: {
        ...(estado && ESTADOS_VALIDOS.includes(estado) ? { estado } : {}),
        ...(soloPendientes
          ? { estado: { in: ["PENDIENTE", "EN_RUTA"] } }
          : {}),
      },
      orderBy: { fechaEntrega: "asc" },
      include: {
        proveedor: { select: { nombre: true } },
        items: {
          include: { producto: { select: { descripcion: true } } },
        },
      },
    });

    return NextResponse.json({
      data: pedidos.map((p) => ({
        idPedido: p.idPedido,
        proveedor: p.proveedor.nombre,
        fechaPedido: p.fechaPedido,
        fechaEntrega: p.fechaEntrega,
        totalEstimado: Number(p.totalEstimado),
        estado: p.estado,
        notas: p.notas,
        items: p.items.map((i) => ({
          idItemPedido: i.idItemPedido,
          codigoItem: i.codigoItem,
          descripcion: i.producto.descripcion,
          cantidad: i.cantidad,
          precioCotizado: Number(i.precioCotizado),
        })),
        totalItems: p.items.length,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar pedidos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  if (!body.idProveedor) {
    return NextResponse.json({ error: "Debes seleccionar un proveedor" }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "El pedido debe tener al menos un producto" }, { status: 400 });
  }

  const fechaEntrega = body.fechaEntrega ? new Date(body.fechaEntrega) : null;
  if (fechaEntrega && isNaN(fechaEntrega.getTime())) {
    return NextResponse.json({ error: "Fecha de entrega inválida" }, { status: 400 });
  }

  try {
    const existeProveedor = await prisma.proveedor.findUnique({
      where: { idProveedor: body.idProveedor, activo: true },
    });
    if (!existeProveedor) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    const totalEstimado = body.items.reduce((acc: number, it: any) => {
      return acc + Number(it.precioCotizado ?? 0) * Number(it.cantidad ?? 0);
    }, 0);

    const pedido = await prisma.$transaction(async (tx) => {
      const creado = await tx.pedidoProveedor.create({
        data: {
          idProveedor: body.idProveedor,
          fechaEntrega,
          totalEstimado: Math.round(totalEstimado * 100) / 100,
          estado: body.estado && ESTADOS_VALIDOS.includes(body.estado) ? body.estado : "PENDIENTE",
          notas: body.notas || null,
          createdBy: user.idPersona,
          items: {
            create: body.items.map((it: any) => ({
              codigoItem: it.codigoItem,
              cantidad: Math.round(Number(it.cantidad)),
              precioCotizado: Math.round(Number(it.precioCotizado ?? 0) * 100) / 100,
            })),
          },
        },
      });

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Pedido a ${existeProveedor.nombre} creado (${creado.idPedido.slice(0, 8)})`,
          moduloSistema: "INVENTARIO",
          jsonPayload: {
            idPedido: creado.idPedido,
            items: body.items.length,
            fechaEntrega: fechaEntrega?.toISOString(),
          },
        },
      });

      return creado;
    });

    return NextResponse.json({ idPedido: pedido.idPedido }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear pedido" }, { status: 500 });
  }
}