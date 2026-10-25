import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { validar, esObjetoJson } from "@/lib/validacion";
import { PEDIDO_SCHEMA } from "@/lib/esquemas";

const ESTADOS_VALIDOS = ["PENDIENTE", "ENTREGADO", "CANCELADO", "EN_RUTA", "PARCIAL"];

export async function GET(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");
  const soloPendientes = searchParams.get("pendientes") === "true";

  try {
    const pedidos = await prisma.pedidoProveedor.findMany({
      where: {
        ...(estado && ESTADOS_VALIDOS.includes(estado) ? { estado } : {}),
        ...(soloPendientes
          ? { estado: { in: ["PENDIENTE", "EN_RUTA", "PARCIAL"] } }
          : {}),
      },
      orderBy: { fechaEntrega: "asc" },
      include: {
        proveedor: { select: { nombre: true } },
        items: {
          include: { producto: { select: { descripcion: true, usaLotes: true, usaSeries: true, unidadCompra: true } } },
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
        condicionPago: p.condicionPago,
        notas: p.notas,
        items: p.items.map((i) => ({
          idItemPedido: i.idItemPedido,
          codigoItem: i.codigoItem,
          descripcion: i.producto.descripcion,
          cantidad: i.cantidad,
          cantidadRecibida: i.cantidadRecibida,
          usaLotes: i.producto.usaLotes,
          usaSeries: i.producto.usaSeries,
          precioCotizado: Number(i.precioCotizado),
          // Fase D: cantidad y precio van en esta unidad ("Paquete" de N piezas).
          unidadCompra: i.piezasPorUnidad > 1 ? i.producto.unidadCompra ?? "Paquete" : null,
          piezasPorUnidad: i.piezasPorUnidad,
        })),
        totalItems: p.items.length,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar pedidos" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth(["ADMINISTRADORA"], { permiso: "inventario", modulo: "proveedores" })();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const v = validar(PEDIDO_SCHEMA, body);
  if (!v.ok) {
    return NextResponse.json({ error: v.error, campos: v.campos }, { status: 400 });
  }
  const pedidoIn = v.datos;
  const fechaEntrega = pedidoIn.fechaEntrega ?? null;
  const items = pedidoIn.items;

  try {
    const existeProveedor = await prisma.proveedor.findUnique({
      where: { idProveedor: pedidoIn.idProveedor, activo: true },
    });
    if (!existeProveedor) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }
    // Todos los productos deben existir en el catálogo de este negocio.
    const existentes = await prisma.producto.findMany({
      where: { codigoItem: { in: items.map((i) => i.codigoItem) } },
      select: { codigoItem: true, piezasPorUnidad: true },
    });
    const faltan = items.filter((i) => !existentes.some((e) => e.codigoItem === i.codigoItem));
    if (faltan.length > 0) {
      return NextResponse.json(
        { error: `No existe en el catálogo: ${faltan.map((f) => f.codigoItem).join(", ")}` },
        { status: 400 }
      );
    }

    const totalEstimado = items.reduce((acc, it) => acc + it.precioCotizado * it.cantidad, 0);

    const pedido = await prisma.$transaction(async (tx) => {
      const creado = await tx.pedidoProveedor.create({
        data: {
          idProveedor: pedidoIn.idProveedor,
          condicionPago: pedidoIn.condicionPago,
          fechaEntrega,
          totalEstimado: Math.round(totalEstimado * 100) / 100,
          estado: body.estado && ESTADOS_VALIDOS.includes(body.estado) ? body.estado : "PENDIENTE",
          notas: pedidoIn.notas ?? null,
          createdBy: user.idPersona,
          items: {
            create: items.map((it) => ({
              codigoItem: it.codigoItem,
              cantidad: it.cantidad,
              precioCotizado: it.precioCotizado,
              // La cantidad y el precio van en la unidad de compra del producto.
              piezasPorUnidad: existentes.find((e) => e.codigoItem === it.codigoItem)?.piezasPorUnidad ?? 1,
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
            items: items.length,
            condicionPago: pedidoIn.condicionPago,
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