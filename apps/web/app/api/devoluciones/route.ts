import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/feature-flags";
import { executeReturn, ReturnError } from "@/lib/returns";
import { tenantDb } from "@/lib/tenant";
import { AutorizacionError, verificarAutorizacion } from "@/lib/autorizacion";
import { esObjetoJson } from "@/lib/validacion";

/** La devolución pasa el plazo o el monto: falta la clave de la administradora. */
class RequiereAutorizacion extends Error {}

const DIA_MS = 86_400_000;

const MAPA_REEMBOLSO: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TRANSFERENCIA: "TRANSFERENCIA",
  TARJETA_TERMINAL: "TARJETA_TERMINAL",
  TARJETA: "TARJETA_TERMINAL",
  NOTA_CREDITO: "NOTA_CREDITO",
  PUNTOS_MONEDERO: "PUNTOS_MONEDERO",
};

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  const { searchParams } = new URL(request.url);
  const folioVenta = searchParams.get("folioVenta");

  try {
    const devoluciones = await prisma.devolucion.findMany({
      where: folioVenta ? { folioVenta } : {},
      orderBy: { fechaHora: "desc" },
      take: 100,
      include: {
        usuario: { select: { nombre: true } },
        lineas: { include: { producto: { select: { descripcion: true } } } },
      },
    });

    // Resumen de los últimos 30 días: cuánto se devuelve, por qué y qué.
    const hace30 = new Date(Date.now() - 30 * DIA_MS);
    const ultimas = devoluciones.filter((d) => d.fechaHora >= hace30);
    const porMotivo = new Map<string, number>();
    const porProducto = new Map<string, { descripcion: string; cantidad: number }>();
    for (const d of ultimas) {
      const m = d.motivoCategoria ?? "SIN_MOTIVO";
      porMotivo.set(m, (porMotivo.get(m) ?? 0) + 1);
      for (const l of d.lineas) {
        const p = porProducto.get(l.codigoItem) ?? { descripcion: l.producto.descripcion, cantidad: 0 };
        p.cantidad += Number(l.cantidad);
        porProducto.set(l.codigoItem, p);
      }
    }
    const resumen = {
      numero: ultimas.length,
      total: Math.round(ultimas.reduce((s, d) => s + Number(d.totalNeto), 0) * 100) / 100,
      porMotivo: [...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([motivo, veces]) => ({ motivo, veces })),
      productos: [...porProducto.entries()]
        .sort((a, b) => b[1].cantidad - a[1].cantidad)
        .slice(0, 5)
        .map(([codigoItem, p]) => ({ codigoItem, ...p })),
    };

    return NextResponse.json({
      resumen,
      data: devoluciones.map((d) => ({
        idDevolucion: d.idDevolucion,
        folioDevolucion: d.folioDevolucion,
        folioVenta: d.folioVenta,
        fechaHora: d.fechaHora,
        tipo: d.tipo,
        motivo: d.motivo,
        motivoCategoria: d.motivoCategoria,
        metodoReembolso: d.metodoReembolso,
        subtotal: Number(d.subtotal),
        iva: Number(d.iva),
        totalNeto: Number(d.totalNeto),
        usuario: d.usuario.nombre,
        items: d.lineas.map((l) => ({
          codigoItem: l.codigoItem,
          descripcion: l.producto.descripcion,
          cantidad: l.cantidad,
          precioUnitario: Number(l.precioMomento),
          subtotalLinea: Number(l.subtotalLinea),
          destino: l.destino,
        })),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar devoluciones" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth()();
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

  const tipo = body.tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : "DEVOLUCION";

  // Valida el método de reembolso contra los habilitados por el negocio.
  // Excepción (Fase 12): PUNTOS_MONEDERO se permite aunque hoy esté
  // desactivado, porque una venta pagada con puntos DEBE poder devolverse;
  // `executeReturn` confirma que la venta original fue de puntos.
  if (tipo === "DEVOLUCION" && body.metodoReembolso !== "PUNTOS_MONEDERO") {
    const config = await getBusinessConfig(user.idNegocio);
    const requerido = MAPA_REEMBOLSO[body.metodoReembolso as string];
    if (!requerido || !config.metodosPago.includes(requerido as any)) {
      return NextResponse.json(
        { error: `El método de reembolso ${body.metodoReembolso} no está habilitado` },
        { status: 403 }
      );
    }
  }

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA", idUsuario: user.idPersona },
      orderBy: { horaApertura: "desc" },
    });

    const config = await getBusinessConfig(user.idNegocio);
    const venta = await prisma.venta.findUnique({
      where: { folioVenta: String(body.folioVenta ?? "") },
      select: { fechaHora: true },
    });
    const diasVenta = venta ? Math.floor((Date.now() - venta.fechaHora.getTime()) / DIA_MS) : 0;
    const esAdmin = user.rol === "ADMINISTRADORA";
    // Si viene la clave de la administradora se valida antes de tocar nada.
    const autorizadoPor = esAdmin ? null : await verificarAutorizacion(prisma, body.autorizacion);

    const resultado = await prisma.$transaction(async (tx) => {
      const r = await executeReturn(
        tx,
        {
          folioVenta: body.folioVenta,
          items: body.items,
          tipo,
          metodoReembolso: tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : body.metodoReembolso,
          motivo: body.motivo,
          motivoCategoria: body.motivoCategoria,
          autorizadoPor,
        },
        {
          idUsuario: user.idPersona,
          idCaja: sesion?.idCaja ?? null,
          idSucursal: sesion?.idSucursal ?? user.idSucursal ?? null,
          puntos: config.puntosConfig,
          ivaRate: config.ivaRate,
        }
      );
      // Políticas del negocio (Configuración): fuera de plazo o monto alto
      // requieren a la administradora. Si falta, se deshace todo.
      if (!esAdmin && !autorizadoPor) {
        if (diasVenta > config.diasDevolucion) {
          throw new RequiereAutorizacion(
            `La venta tiene ${diasVenta} días y el plazo para devoluciones es de ${config.diasDevolucion}: se requiere autorización`
          );
        }
        if (config.montoAutorizarDevolucion != null && r.totalNeto >= config.montoAutorizarDevolucion) {
          throw new RequiereAutorizacion(
            `Devoluciones desde $${config.montoAutorizarDevolucion.toFixed(2)} requieren autorización de la administradora`
          );
        }
      }
      return r;
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof RequiereAutorizacion) {
      return NextResponse.json({ error: error.message, requiereAutorizacion: true }, { status: 403 });
    }
    if (error instanceof AutorizacionError) {
      return NextResponse.json({ error: error.message, requiereAutorizacion: true }, { status: 403 });
    }
    if (error instanceof ReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Error interno al registrar la devolución" }, { status: 500 });
  }
}
