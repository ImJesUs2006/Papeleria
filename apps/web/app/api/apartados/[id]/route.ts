import { NextResponse } from "next/server";
import { prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { puedeCobrar } from "@/lib/permisos";
import { getBusinessConfig } from "@/lib/feature-flags";
import { ApartadoError } from "@/lib/apartados";
import { cancelarApartado, liquidarApartado } from "@/lib/apartados-cierre";

// ============================================================
// PATCH /api/apartados/[id]
//   { accion: "liquidar", metodoPago, referenciaTransferencia? }
//       → cobra el saldo y materializa la venta.
//   { accion: "cancelar", reembolsarAnticipo?, motivo? }
//       → libera el stock reservado (solo administradora).
// ============================================================

const MAPA_METODO: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TARJETA: "TARJETA_TERMINAL",
  TARJETA_TERMINAL: "TARJETA_TERMINAL",
  DIGITAL: "TRANSFERENCIA",
  TRANSFERENCIA: "TRANSFERENCIA",
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()();
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

  try {
    const sesion = await prisma.sesionCaja.findFirst({
      where: { estado: "ABIERTA" },
      orderBy: { horaApertura: "desc" },
      select: { idCaja: true },
    });
    const ctx = { idUsuario: user.idPersona, idCaja: sesion?.idCaja ?? null };

    if (body?.accion === "liquidar") {
      if (!puedeCobrar(user)) {
        return NextResponse.json({ error: "Tu usuario no tiene permiso de cobro" }, { status: 403 });
      }
      const config = await getBusinessConfig();
      const requerido = MAPA_METODO[body.metodoPago as string];
      if (!requerido || !config.metodosPago.includes(requerido as any)) {
        return NextResponse.json(
          { error: `El método de pago ${body.metodoPago} no está habilitado para este negocio` },
          { status: 403 }
        );
      }
      const resultado = await prisma.$transaction((tx) =>
        liquidarApartado(
          tx,
          id,
          {
            metodoPago: body.metodoPago,
            referenciaTransferencia: body.referenciaTransferencia ?? null,
          },
          { ...ctx, pesosCompraPorPunto: config.puntosConfig.pesosCompraPorPunto }
        )
      );
      return NextResponse.json(resultado);
    }

    if (body?.accion === "cancelar") {
      if (user.rol !== "ADMINISTRADORA") {
        return NextResponse.json(
          { error: "Solo la administradora puede cancelar un apartado" },
          { status: 403 }
        );
      }
      const resultado = await prisma.$transaction((tx) =>
        cancelarApartado(
          tx,
          id,
          { reembolsarAnticipo: body.reembolsarAnticipo === true, motivo: body.motivo ?? null },
          ctx
        )
      );
      return NextResponse.json(resultado);
    }

    return NextResponse.json({ error: "Acción no válida (liquidar | cancelar)" }, { status: 400 });
  } catch (error) {
    if (error instanceof ApartadoError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[apartados:patch]", error);
    return NextResponse.json({ error: "Error interno al actualizar el apartado" }, { status: 500 });
  }
}
