import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { calcularNivel, equivalenciaPuntos } from "@/lib/fidelidad";
import { RFC_CLIENTE_SCHEMA, RAZON_SOCIAL_SCHEMA } from "@/lib/cliente-fiscal";

// ============================================================
// GET    /api/clientes/[id] → ficha + historial de compras + monedero
// PATCH  /api/clientes/[id] → edita nombre/teléfono
// DELETE /api/clientes/[id] → elimina (con guardas de integridad)
// ============================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { idCliente: id },
      include: {
        ventas: {
          orderBy: { fechaHora: "desc" },
          take: 50,
          select: {
            folioVenta: true,
            fechaHora: true,
            totalNeto: true,
            metodoPago: true,
            estado: true,
            _count: { select: { devoluciones: true } },
          },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Histórico completo (no solo las 50 más recientes) para el nivel.
    const agregado = await prisma.venta.aggregate({
      where: { idCliente: id, estado: { not: "CANCELADA" } },
      _sum: { totalNeto: true },
      _count: { _all: true },
    });

    const montoHistorico = Number(agregado._sum.totalNeto ?? 0);
    const puntos = Number(cliente.puntosFidelidad ?? 0);

    return NextResponse.json({
      cliente: {
        idCliente: cliente.idCliente,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        saldoDeudor: Number(cliente.saldoDeudor ?? 0),
        puntosFidelidad: puntos,
        // Fase 12: datos fiscales (necesarios para facturar).
        rfc: cliente.rfc ?? null,
        razonSocial: cliente.razonSocial ?? null,
        nivel: calcularNivel(montoHistorico),
        montoHistorico,
        equivalenciaPesos: equivalenciaPuntos(puntos),
        totalVentas: Number(agregado._count._all ?? 0),
        createdAt: cliente.createdAt,
      },
      ventas: cliente.ventas.map((v) => ({
        folioVenta: v.folioVenta,
        fechaHora: v.fechaHora,
        totalNeto: Number(v.totalNeto ?? 0),
        metodoPago: v.metodoPago,
        estado: v.estado,
        devoluciones: Number(v._count?.devoluciones ?? 0),
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Error al consultar el cliente" },
      { status: 500 }
    );
  }
}

const PATCH_SCHEMA = z
  .object({
    nombre: z.string().trim().min(2, "El nombre es obligatorio (mín 2 caracteres)").max(80),
    telefono: z
      .union([z.string().trim().max(20), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
    // Fase 12: el padrón guarda los datos fiscales para la facturación.
    rfc: RFC_CLIENTE_SCHEMA,
    razonSocial: RAZON_SOCIAL_SCHEMA,
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PATCH_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos de cliente inválidos" },
      { status: 400 }
    );
  }

  try {
    const cliente = await prisma.cliente.update({
      where: { idCliente: id },
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono ?? null,
        rfc: parsed.data.rfc ?? null,
        razonSocial: parsed.data.razonSocial ?? null,
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Cliente actualizado: ${cliente.nombre}`,
        moduloSistema: "CAJA",
        jsonPayload: { idCliente: cliente.idCliente },
      },
    });

    return NextResponse.json({
      cliente: {
        idCliente: cliente.idCliente,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        saldoDeudor: Number(cliente.saldoDeudor ?? 0),
        puntosFidelidad: Number(cliente.puntosFidelidad ?? 0),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Error al actualizar el cliente" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { idCliente: id },
      select: {
        nombre: true,
        saldoDeudor: true,
        _count: { select: { ventas: true, apartados: true } },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    // Guardas de integridad: no se borra a alguien con historial financiero.
    if (Number(cliente.saldoDeudor ?? 0) > 0) {
      return NextResponse.json(
        { error: "El cliente tiene saldo a cobrar; regulariza su saldo antes de eliminarlo" },
        { status: 409 }
      );
    }
    if (cliente._count.ventas > 0 || cliente._count.apartados > 0) {
      return NextResponse.json(
        { error: "El cliente tiene historial de compras o apartados; no se puede eliminar" },
        { status: 409 }
      );
    }

    await prisma.cliente.delete({ where: { idCliente: id } });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Cliente eliminado: ${cliente.nombre}`,
        moduloSistema: "CAJA",
        jsonPayload: { idCliente: id },
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Error al eliminar el cliente" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";