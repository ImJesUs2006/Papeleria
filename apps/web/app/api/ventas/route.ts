import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { puedeCobrar } from "@/lib/permisos";
import { executeSale, SaleError } from "@/lib/sales";
import { getBusinessConfig } from "@/lib/feature-flags";
import { tenantDb } from "@/lib/tenant";

const MAPA_METODO: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TARJETA: "TARJETA_TERMINAL",
  TARJETA_TERMINAL: "TARJETA_TERMINAL",
  DIGITAL: "TRANSFERENCIA",
  TRANSFERENCIA: "TRANSFERENCIA",
  PUNTOS_MONEDERO: "PUNTOS_MONEDERO",
};

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
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Feature flag: métodos de pago habilitados por el negocio (Marca Blanca).
  const config = await getBusinessConfig(user.idNegocio);
  const requerido = MAPA_METODO[body.metodoPago as string];
  if (!requerido || !config.metodosPago.includes(requerido as any)) {
    return NextResponse.json(
      { error: `El método de pago ${body.metodoPago} no está habilitado para este negocio` },
      { status: 403 }
    );
  }

  // Fase 12 · interruptor de mayoreo: solo se acepta booleano real.
  const esMayoreo = body.esMayoreo === true;

  try {
    // Caja abierta (si existe) para asignar el ingreso financiero.
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
      orderBy: { horaApertura: "desc" },
    });

    const resultado = await prisma.$transaction((tx) =>
      executeSale(tx, { ...body, esMayoreo }, {
        idUsuario: user.idPersona,
        idCaja: sesion?.idCaja ?? null,
        ivaRate: config.ivaRate,
        preciosIncluyenIva: config.preciosIncluyenIva,
        puntos: config.puntosConfig,
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
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Error interno al registrar la venta" },
      { status: 500 }
    );
  }
}