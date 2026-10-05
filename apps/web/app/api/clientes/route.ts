import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { round2 } from "@/lib/sales";
import { calcularNivel } from "@/lib/fidelidad";
import { RFC_CLIENTE_SCHEMA, RAZON_SOCIAL_SCHEMA } from "@/lib/cliente-fiscal";

// ============================================================
// GET /api/clientes?q=...&limit=...&soloConDeuda=...
//   Lista/busca clientes del CRM con su monedero de puntos y su nivel.
// POST /api/clientes
//   Alta rápida desde el POS o desde el módulo /clientes
// ============================================================

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const soloConDeuda = searchParams.get("soloConDeuda") === "true";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
    200
  );

  const where: Record<string, unknown> = {};
  if (q.length > 0) {
    where.OR = [
      { nombre: { contains: q, mode: "insensitive" as const } },
      { telefono: { contains: q } },
      // Fase 12: se puede buscar por RFC o razón social (facturación).
      { rfc: { contains: q, mode: "insensitive" as const } },
      { razonSocial: { contains: q, mode: "insensitive" as const } },
    ];
  }
  if (soloConDeuda) {
    where.saldoDeudor = { gt: 0 };
  }

  try {
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: q.length > 0 ? undefined : [{ saldoDeudor: "desc" }, { nombre: "asc" }],
      take: limit,
    });

    // Fase 12: nivel Menudeo/Mayoreo según historial de compras (una sola
    // consulta agregada para el lote, indexada por Map: sin N+1 ni O(n²)).
    const ids = clientes.map((c) => c.idCliente);
    const grupo = ids.length
      ? await prisma.venta.groupBy({
          by: ["idCliente"],
          where: { idCliente: { in: ids }, estado: { not: "CANCELADA" } },
          _sum: { totalNeto: true },
        })
      : [];
    const historicoPorCliente = new Map<string, number>(
      grupo.map((g) => [String(g.idCliente), Number(g._sum.totalNeto ?? 0)])
    );

    return NextResponse.json({
      clientes: clientes.map((c) => {
        const montoHistorico = historicoPorCliente.get(c.idCliente) ?? 0;
        return {
          idCliente: c.idCliente,
          nombre: c.nombre,
          telefono: c.telefono,
          saldoDeudor: Number(c.saldoDeudor ?? 0),
          puntosFidelidad: Number(c.puntosFidelidad ?? 0),
          nivel: calcularNivel(montoHistorico),
          montoHistorico,
          // Fase 12: datos fiscales para la facturación (pueden venir vacíos).
          rfc: c.rfc ?? null,
          razonSocial: c.razonSocial ?? null,
        };
      }),
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
    // Fase 12: datos fiscales para poder facturar.
    rfc: RFC_CLIENTE_SCHEMA,
    razonSocial: RAZON_SOCIAL_SCHEMA,
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
        rfc: parsed.data.rfc ?? null,
        razonSocial: parsed.data.razonSocial ?? null,
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
          nivel: "MENUDEO",
          montoHistorico: 0,
          rfc: cliente.rfc ?? null,
          razonSocial: cliente.razonSocial ?? null,
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