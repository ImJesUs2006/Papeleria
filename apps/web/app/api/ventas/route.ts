import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { puedeCobrar } from "@/lib/permisos";
import { executeSale, SaleError } from "@/lib/sales";
import { promocionesVigentes } from "@/lib/promociones";
import { AutorizacionError, verificarAutorizacion } from "@/lib/autorizacion";
import { getBusinessConfig } from "@/lib/feature-flags";
import { tenantDb } from "@/lib/tenant";
import { esObjetoJson } from "@/lib/validacion";

const MAPA_METODO: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TARJETA: "TARJETA_TERMINAL",
  TARJETA_TERMINAL: "TARJETA_TERMINAL",
  DIGITAL: "TRANSFERENCIA",
  TRANSFERENCIA: "TRANSFERENCIA",
  PUNTOS_MONEDERO: "PUNTOS_MONEDERO",
};

/** Métodos que usará la venta (uno, o los de un pago mixto). */
function metodosDe(body: any): string[] {
  return Array.isArray(body?.pagos) && body.pagos.length > 0
    ? body.pagos.map((p: any) => String(p?.metodo ?? ""))
    : [String(body?.metodoPago ?? "")];
}

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;
  if (!puedeCobrar(user)) {
    return NextResponse.json({ error: "Tu usuario no tiene permiso de cobro" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Feature flag: métodos de pago habilitados por el negocio (Marca Blanca).
  const config = await getBusinessConfig(user.idNegocio);
  for (const metodo of metodosDe(body)) {
    const requerido = MAPA_METODO[metodo];
    if (!requerido || !config.metodosPago.includes(requerido as any)) {
      return NextResponse.json(
        { error: `El método de pago ${metodo} no está habilitado para este negocio` },
        { status: 403 }
      );
    }
  }

  // Fase 12 · interruptor de mayoreo: solo se acepta booleano real.
  const esMayoreo = body.esMayoreo === true;

  try {
    // Multi-caja: el ingreso va a la caja abierta de QUIEN cobra.
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA", idUsuario: user.idPersona },
      orderBy: { horaApertura: "desc" },
    });

    // Descuento por encima del tope: la administradora autoriza en mostrador.
    let autorizadoPor: string | null = null;
    try {
      autorizadoPor = await verificarAutorizacion(prisma, body.autorizacion);
    } catch (e) {
      if (e instanceof AutorizacionError) {
        return NextResponse.json(
          { error: e.message, codigo: "AUTORIZACION_INVALIDA" },
          { status: 403 }
        );
      }
      throw e;
    }
    const promociones = await promocionesVigentes(prisma);

    const resultado = await prisma.$transaction((tx) =>
      executeSale(tx, { ...body, esMayoreo }, {
        idUsuario: user.idPersona,
        idCaja: sesion?.idCaja ?? null,
        idSucursal: sesion?.idSucursal ?? user.idSucursal ?? null,
        ivaRate: config.ivaRate,
        preciosIncluyenIva: config.preciosIncluyenIva,
        cobraImpuestos: config.cobraImpuestos,
        rol: user.rol,
        exigirRecibido: true,
        descuentoMaxCajera: config.descuentoMaxCajera,
        autorizadoPor,
        promociones,
        puntos: { ...config.puntosConfig, acumula: config.metodosPago.includes("PUNTOS_MONEDERO") },
      })
    );

    return NextResponse.json(
      {
        ...resultado,
        // Fase 12: el cliente (POS) arma el ticket con los datos reales.
        items: resultado.items,
        subtotal: resultado.subtotal,
        iva: resultado.iva,
        metodoPago: resultado.metodoPago,
        nombreCliente: resultado.nombreCliente,
        fechaHora: resultado.fechaHora,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof SaleError) {
      return NextResponse.json(
        { error: error.message, ...(error.codigo ? { codigo: error.codigo } : {}) },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { error: "Error interno al registrar la venta" },
      { status: 500 }
    );
  }
}
// GET /api/ventas?q= → ventas recientes (para elegir el ticket en
// Devoluciones sin teclear el folio). Sin q: las de los últimos 3 días.
export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);

  const ventas = await prisma.venta.findMany({
    where: {
      estado: { not: "CANCELADA" },
      ...(q
        ? {
            OR: [
              { folioVenta: { contains: q, mode: "insensitive" } },
              { cliente: { nombre: { contains: q, mode: "insensitive" } } },
            ],
          }
        : { fechaHora: { gte: new Date(Date.now() - 3 * 86_400_000) } }),
    },
    orderBy: { fechaHora: "desc" },
    take: 25,
    include: {
      cliente: { select: { nombre: true } },
      usuario: { select: { nombre: true } },
      _count: { select: { lineasDetalle: true } },
    },
  });

  return NextResponse.json({
    data: ventas.map((v) => ({
      folioVenta: v.folioVenta,
      fechaHora: v.fechaHora,
      totalNeto: Number(v.totalNeto),
      estado: v.estado,
      cliente: v.cliente?.nombre ?? null,
      cajero: v.usuario.nombre,
      articulos: v._count.lineasDetalle,
    })),
  });
}
