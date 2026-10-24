import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { getBusinessConfig } from "@/lib/feature-flags";
import { armarPaquete, validarFolioFiscal } from "@/lib/factura-manual";
import { PORTAL_FACTURACION_SAT } from "@/lib/sat-catalogos";
import { esObjetoJson } from "@/lib/validacion";

export const dynamic = "force-dynamic";

// ============================================================
// GET   /api/facturas/[id] → paquete para capturar en el portal del SAT
// PATCH /api/facturas/[id] → { folioFiscal } registra el timbrado (EMITIDA)
//                            { cancelar: true } la marca CANCELADA
// ============================================================

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { modulo: "facturacion" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  const factura = await prisma.factura.findUnique({
    where: { idFactura: id },
    include: {
      cliente: true,
      venta: {
        include: {
          lineasDetalle: { include: { producto: { select: { descripcion: true, esServicio: true } } } },
        },
      },
    },
  });
  if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

  const config = await getBusinessConfig(auth.user.idNegocio);
  const v = factura.venta;
  const paquete = armarPaquete({
    folio: factura.folio,
    emisor: (config.datosFiscales ?? {}) as any,
    receptor: {
      rfc: factura.cliente.rfc ?? "",
      razonSocial: factura.cliente.razonSocial ?? factura.cliente.nombre,
      regimenFiscal: factura.cliente.regimenFiscal ?? "",
      codigoPostalFiscal: factura.cliente.codigoPostalFiscal ?? "",
      usoCfdi: factura.usoCfdi,
      email: factura.cliente.email,
    },
    metodoPagoVenta: v.metodoPago,
    lineas: v.lineasDetalle.map((l) => ({
      descripcion: l.producto.descripcion,
      cantidad: Number(l.cantidad),
      subtotalLinea: Number(l.subtotalLinea),
      ivaLinea: l.ivaLinea != null ? Number(l.ivaLinea) : null,
      iepsLinea: l.iepsLinea != null ? Number(l.iepsLinea) : null,
      esServicio: l.producto.esServicio,
    })),
    totales: {
      subtotal: Number(factura.subtotal),
      iva: Number(factura.iva),
      ieps: Number((v as any).ieps ?? 0),
      total: Number(factura.totalNeto),
    },
  });

  return NextResponse.json({
    factura: {
      idFactura: factura.idFactura,
      folio: factura.folio,
      folioVenta: factura.folioVenta,
      estado: factura.estado,
      folioFiscal: factura.folioFiscal,
      fechaTimbrado: factura.fechaTimbrado,
    },
    paquete,
    portal: PORTAL_FACTURACION_SAT,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(["ADMINISTRADORA"], { modulo: "facturacion" })();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const prisma = tenantDb(auth.user.idNegocio);
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const factura = await prisma.factura.findUnique({ where: { idFactura: id } });
  if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  if (factura.estado === "CANCELADA") {
    return NextResponse.json({ error: "La factura está cancelada" }, { status: 409 });
  }

  if (body?.cancelar === true) {
    const cancelada = await prisma.factura.update({ where: { idFactura: id }, data: { estado: "CANCELADA" } });
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: auth.user.idPersona,
        accion: `FACTURA_CANCELADA:${factura.folio}`,
        moduloSistema: "PUNTO_VENTA",
        jsonPayload: { idFactura: id, folioFiscal: factura.folioFiscal },
      },
    });
    return NextResponse.json({ estado: cancelada.estado });
  }

  const uuid = validarFolioFiscal(body?.folioFiscal);
  if (!uuid.ok) return NextResponse.json({ error: uuid.error }, { status: 400 });
  const repetido = await prisma.factura.findFirst({
    where: { folioFiscal: uuid.valor, NOT: { idFactura: id } },
    select: { folio: true },
  });
  if (repetido) {
    return NextResponse.json({ error: `Ese folio fiscal ya está registrado en la factura ${repetido.folio}` }, { status: 409 });
  }

  const emitida = await prisma.factura.update({
    where: { idFactura: id },
    data: { estado: "EMITIDA", folioFiscal: uuid.valor, fechaTimbrado: new Date() },
  });
  await prisma.bitacoraLog.create({
    data: {
      idUsuario: auth.user.idPersona,
      accion: `FACTURA_TIMBRADA:${factura.folio}`,
      moduloSistema: "PUNTO_VENTA",
      jsonPayload: { idFactura: id, folioFiscal: uuid.valor },
    },
  });
  return NextResponse.json({ estado: emitida.estado, folioFiscal: emitida.folioFiscal });
}
