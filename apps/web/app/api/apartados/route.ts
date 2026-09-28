import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { crearApartado, ApartadoError } from "@/lib/apartados";

// ============================================================
// POST /api/apartados — crea un apartado (reserva stock + anticipo).
// GET  /api/apartados — lista apartados vigentes (PENDIENTE/ABONADO)
// ============================================================

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

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
      orderBy: { horaApertura: "desc" },
    });

    const resultado = await prisma.$transaction((tx) =>
      crearApartado(tx, body, {
        idUsuario: user.idPersona,
        idCaja: sesion?.idCaja ?? null,
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