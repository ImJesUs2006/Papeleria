import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { puedeCobrar } from "@/lib/permisos";
import { crearApartado, ApartadoError } from "@/lib/apartados";
import { getBusinessConfig } from "@/lib/feature-flags";
import { tenantDb } from "@/lib/tenant";

// ============================================================
// POST /api/apartados — crea un apartado (reserva stock + anticipo).
// GET  /api/apartados — lista apartados vigentes (PENDIENTE/ABONADO)
// ============================================================

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

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
      orderBy: { horaApertura: "desc" },
    });

    const config = await getBusinessConfig(user.idNegocio);
    const resultado = await prisma.$transaction((tx) =>
      crearApartado(tx, body, {
        idUsuario: user.idPersona,
        idCaja: sesion?.idCaja ?? null,
        ivaRate: config.ivaRate,
      })
    );

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    if (error instanceof ApartadoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[apartados:post]", error);
    return NextResponse.json(
      { error: "Error interno al crear el apartado" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  try {
    const apartados = await prisma.apartado.findMany({
      where: { estado: { in: ["PENDIENTE"] } },
      orderBy: { fechaCreado: "desc" },
      take: 100,
      include: {
        cliente: { select: { nombre: true, telefono: true } },
        lineas: {
          include: { producto: { select: { descripcion: true, esServicio: true } } },
        },
      },
    });

    return NextResponse.json({
      apartados: apartados.map((a) => ({
        idApartado: a.idApartado,
        folio: a.folio,
        cliente: a.cliente.nombre,
        telefono: a.cliente.telefono,
        fechaCreado: a.fechaCreado.toISOString(),
        anticipo: Number(a.anticipo),
        total: Number(a.total),
        saldoPendiente: Number(a.total) - Number(a.anticipo),
        estado: a.estado,
        notas: a.notas,
        lineas: a.lineas.map((l) => ({
          descripcion: l.producto.descripcion,
          cantidad: Number(l.cantidad),
          subtotalLinea: Number(l.subtotalLinea),
          esServicio: l.producto.esServicio,
        })),
      })),
    });
  } catch (error) {
    console.error("[apartados:get]", error);
    return NextResponse.json(
      { error: "Error al consultar apartados" },
      { status: 500 }
    );
  }
}