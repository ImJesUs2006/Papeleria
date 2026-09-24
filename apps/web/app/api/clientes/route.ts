import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { round2 } from "@/lib/sales";

// ============================================================
// GET /api/clientes?q=...&idCaja=...
//   Lista/busca clientes del Crédito de Tienda (CRM, Fase 3).
//   Cada cliente muestra su saldo deudor y puntos de fidelidad.
// POST /api/clientes
//   Alta rápida desde el POS: { nombre, telefono? }
// ============================================================

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const soloConDeuda = searchParams.get("soloConDeuda") === "true";

  const where: Record<string, unknown> = {};
  if (q.length > 0) {
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" as const } },
      { telefono: { contains: q } },
    ];
  }
  if (soloConDeuda) {
    where.saldoDeudor = { gt: 0 };
  }

  try {
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: q.length > 0 ? undefined : [{ saldoDeudor: "desc" }, { nombre: "asc" }],
      take: 50,
    });

    return NextResponse.json({
      clientes: clientes.map((c) => ({
        idCliente: c.idCliente,
        nombre: c.nombre,
        telefono: c.telefono,
        saldoDeudor: Number(c.saldoDeudor),
        puntosFidelidad: c.puntosFidelidad,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar clientes" }, { status: 500 });
  }
}

const CREATE_CLIENTE_SCHEMA = z
  .object({
    nombre: z.string().trim().min(2, "El nombre es obligatorio (mín 2 caracteres)").max(80),
    telefono: z
      .union([z.string().trim().max(20), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .strict();

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = CREATE_CLIENTE_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos de cliente inválidos" },
      { status: 400 }
    );
  }

  try {
    const cliente = await prisma.cliente.create({
      data: {
        nombre: parsed.data.nombre,
        telefono: parsed.data.telefono,
      },
    });

    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `Cliente registrado: ${cliente.nombre}`,
        moduloSistema: "CAJA",
        jsonPayload: { idCliente: cliente.idCliente },
      },
    });

    return NextResponse.json(
      {
        cliente: {
          idCliente: cliente.idCliente,
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          saldoDeudor: Number(cliente.saldoDeudor),
          puntosFidelidad: cliente.puntosFidelidad,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Error al registrar el cliente" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";