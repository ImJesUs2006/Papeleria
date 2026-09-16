import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/feature-flags";
import { executeReturn, ReturnError } from "@/lib/returns";

const MAPA_REEMBOLSO: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TRANSFERENCIA: "TRANSFERENCIA",
  TARJETA_TERMINAL: "TARJETA_TERMINAL",
  TARJETA: "TARJETA_TERMINAL",
};

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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

    return NextResponse.json({
      data: devoluciones.map((d) => ({
        idDevolucion: d.idDevolucion,
        folioDevolucion: d.folioDevolucion,
        folioVenta: d.folioVenta,
        fechaHora: d.fechaHora,
        tipo: d.tipo,
        motivo: d.motivo,
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
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tipo = body.tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : "DEVOLUCION";

  // Valida el método de reembolso contra los habilitados por el negocio.
  if (tipo === "DEVOLUCION") {
    const config = await getBusinessConfig();
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
      where: { estado: "ABIERTA" },
      orderBy: { horaApertura: "desc" },
    });

    const resultado = await prisma.$transaction((tx) =>
      executeReturn(
        tx,
        {
          folioVenta: body.folioVenta,
          items: body.items,
          tipo,
          metodoReembolso: tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : body.metodoReembolso,
          motivo: body.motivo,
        },
        { idUsuario: user.idPersona, idCaja: sesion?.idCaja ?? null }
      )
    );

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof ReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Error interno al registrar la devolución" }, { status: 500 });
  }
}
