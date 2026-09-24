import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { round2 } from "@/lib/sales";

// ============================================================
// POST /api/clientes/[id]/abonos
// Abono de cliente (CRM, Fase 3): el dinero del abono ENTRA a la caja
// (totalVentasEfectivo) y SIMULTÁNEAMENTE reduce la deuda del cliente.
// Reglas de seguridad:
//   - Requiere una caja ABIERTA (el dinero físico está en el cajón).
//   - El abono no puede exceder el saldo deudor vigente.
//   - Ambas mutaciones ocurren en la misma transacción.
// ============================================================

const ABONO_SCHEMA = z
  .object({
    monto: z
      .number()
      .finite("Monto inválido")
      .positive("El abono debe ser mayor a cero")
      .max(999_999_999, "Monto fuera de rango"),
    idCaja: z.string().uuid("Caja inválida").optional().nullable(),
    notas: z.string().trim().max(120).optional().nullable(),
  })
  .strict();

export async function POST(
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

  const parsed = ABONO_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Abono inválido" },
      { status: 400 }
    );
  }
  const monto = round2(parsed.data.monto);
  if (monto <= 0) {
    return NextResponse.json({ error: "El abono debe ser mayor a cero" }, { status: 400 });
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Caja abierta (explícita o la más reciente) o ninguna.
      let caja = null;
      if (parsed.data.idCaja) {
        caja = await tx.sesionCaja.findUnique({
          where: { idCaja: parsed.data.idCaja },
          select: { idCaja: true, estado: true },
        });
        if (!caja || caja.estado !== "ABIERTA") {
          throw new Error("_NO_CAJA_ABIERTA");
        }
      } else {
        caja = await tx.sesionCaja.findFirst({
          where: { estado: "ABIERTA" },
          orderBy: { horaApertura: "desc" },
          select: { idCaja: true, estado: true },
        });
      }
      if (!caja) {
        throw new Error("_NO_CAJA_ABIERTA");
      }

      const cliente = await tx.cliente.findUnique({
        where: { idCliente: id },
        select: { idCliente: true, nombre: true, saldoDeudor: true },
      });
      if (!cliente) {
        throw new Error("_NO_CLIENTE");
      }

      const deuda = round2(Number(cliente.saldoDeudor));
      if (monto - deuda > 0.009) {
        throw new Error("_ABONO_EXCEDE");
      }

      // 1. El dinero entra a la caja.
      await tx.sesionCaja.update({
        where: { idCaja: caja.idCaja },
        data: { totalVentasEfectivo: { increment: monto } },
      });

      // 2. La deuda baja (nunca por debajo de cero).
      const nuevaDeuda = round2(Math.max(deuda - monto, 0));
      await tx.cliente.update({
        where: { idCliente: id },
        data: { saldoDeudor: nuevaDeuda },
      });

      await tx.bitacoraLog.create({
        data: {
          idUsuario: auth.user.idPersona,
          accion: `Abono de cliente ${cliente.nombre}: $${monto.toFixed(2)}`,
          moduloSistema: "CAJA",
          jsonPayload: {
            idCliente: id,
            idCaja: caja.idCaja,
            monto,
            deudaAnterior: deuda,
            nuevaDeuda,
            notas: parsed.data.notas ?? null,
          },
        },
      });

      return { idCaja: caja.idCaja, nuevaDeuda, deudaAnterior: deuda };
    });

    return NextResponse.json({
      abono: {
        idCliente: id,
        monto,
        deudaAnterior: round2(resultado.deudaAnterior),
        saldoDeudor: round2(resultado.nuevaDeuda),
      },
    });
  } catch (error: any) {
    if (error?.message === "_NO_CAJA_ABIERTA") {
      return NextResponse.json(
        { error: "No hay una caja abierta para recibir el abono" },
        { status: 409 }
      );
    }
    if (error?.message === "_NO_CLIENTE") {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    if (error?.message === "_ABONO_EXCEDE") {
      return NextResponse.json(
        { error: "El abono no puede exceder el saldo deudor del cliente" },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Error al registrar el abono" }, { status: 500 });
  }
}