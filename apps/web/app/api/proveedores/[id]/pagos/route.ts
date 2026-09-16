import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";

const METODOS_ABONO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA_TERMINAL", "CHEQUE"];

// GET /api/proveedores/[id]/pagos → historial de abonos del proveedor.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;

  try {
    const pagos = await prisma.pagoProveedor.findMany({
      where: { idProveedor: id },
      orderBy: { fechaHora: "desc" },
      take: 100,
      include: { usuario: { select: { nombre: true } } },
    });

    return NextResponse.json({
      data: pagos.map((p) => ({
        idPago: p.idPago,
        fechaHora: p.fechaHora,
        monto: Number(p.monto),
        metodoPago: p.metodoPago,
        referencia: p.referencia,
        notas: p.notas,
        usuario: p.usuario.nombre,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: "Error al consultar abonos" }, { status: 500 });
  }
}

// POST /api/proveedores/[id]/pagos → registra un abono y reduce el saldo.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const monto = Number(body.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: "El monto del abono debe ser mayor a cero" }, { status: 400 });
  }

  const metodoPago = METODOS_ABONO.includes(body.metodoPago) ? body.metodoPago : "EFECTIVO";

  try {
    const proveedor = await prisma.proveedor.findUnique({ where: { idProveedor: id } });
    if (!proveedor) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    const saldo = Number(proveedor.saldoCredito ?? 0);
    if (saldo <= 0) {
      return NextResponse.json(
        { error: "El proveedor no tiene saldo pendiente por pagar" },
        { status: 409 }
      );
    }
    if (monto > saldo + 0.005) {
      return NextResponse.json(
        { error: `El abono no puede superar el saldo pendiente ($${saldo.toFixed(2)})` },
        { status: 400 }
      );
    }

    const abonoRedondeado = Math.round(monto * 100) / 100;

    const resultado = await prisma.$transaction(async (tx) => {
      const pago = await tx.pagoProveedor.create({
        data: {
          idProveedor: id,
          monto: abonoRedondeado,
          metodoPago,
          referencia: body.referencia || null,
          notas: body.notas || null,
          idUsuario: user.idPersona,
        },
      });

      const actualizado = await tx.proveedor.update({
        where: { idProveedor: id },
        data: { saldoCredito: { decrement: abonoRedondeado } },
      });

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `Abono a ${proveedor.nombre}: $${abonoRedondeado.toFixed(2)} (${metodoPago})`,
          moduloSistema: "CONFIGURACION",
          jsonPayload: {
            idPago: pago.idPago,
            idProveedor: id,
            monto: abonoRedondeado,
            metodoPago,
            saldoAnterior: saldo,
            saldoNuevo: Number(actualizado.saldoCredito ?? 0),
          },
        },
      });

      return { pago, saldoNuevo: Number(actualizado.saldoCredito ?? 0) };
    });

    return NextResponse.json(
      {
        idPago: resultado.pago.idPago,
        monto: abonoRedondeado,
        metodoPago,
        saldoNuevo: resultado.saldoNuevo,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: "Error al registrar el abono" }, { status: 500 });
  }
}
