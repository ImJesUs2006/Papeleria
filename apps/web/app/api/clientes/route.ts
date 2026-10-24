import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { calcularNivel } from "@/lib/fidelidad";
import { tenantDb } from "@/lib/tenant";
import { CLIENTE_SCHEMA, enmascarar, faltantesFiscales } from "@/lib/clientes";
import { validar } from "@/lib/validacion";

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
  const prisma = tenantDb(auth.user.idNegocio);

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

    // Datos sensibles: la cajera los ve enmascarados; la administradora completos.
    const completo = auth.user.rol === "ADMINISTRADORA";
    return NextResponse.json({
      clientes: clientes.map((c) => {
        const montoHistorico = historicoPorCliente.get(c.idCliente) ?? 0;
        return {
          idCliente: c.idCliente,
          nombre: c.nombre,
          telefono: completo ? c.telefono : enmascarar.telefono(c.telefono),
          email: completo ? c.email : enmascarar.email(c.email),
          facturable: faltantesFiscales(c).length === 0,
          saldoDeudor: Number(c.saldoDeudor ?? 0),
          puntosFidelidad: Number(c.puntosFidelidad ?? 0),
          nivel: calcularNivel(montoHistorico),
          montoHistorico,
          // Fase 12: datos fiscales para la facturación (pueden venir vacíos).
          rfc: completo ? c.rfc ?? null : enmascarar.rfc(c.rfc),
          razonSocial: c.razonSocial ?? null,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar clientes" }, { status: 500 });
  }
}


export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = validar(CLIENTE_SCHEMA, body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, campos: parsed.campos }, { status: 400 });
  }
  const datos = parsed.datos;

  try {
    const cliente = await prisma.cliente.create({
      data: {
        nombre: datos.nombre,
        telefono: datos.telefono ?? null,
        email: datos.email ?? null,
        rfc: datos.rfc ?? null,
        razonSocial: datos.razonSocial ?? null,
        regimenFiscal: datos.regimenFiscal ?? null,
        codigoPostalFiscal: datos.codigoPostalFiscal ?? null,
        usoCfdi: datos.usoCfdi ?? null,
        notas: datos.notas ?? null,
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