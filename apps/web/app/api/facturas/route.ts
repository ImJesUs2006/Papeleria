import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { CLAVES_USO_CFDI } from "@/lib/validate-config";
import { tieneDatosFiscales } from "@/lib/cliente-fiscal";
import { tenantDb } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// ============================================================
// FASE 12 · Facturación estricta
// Reglas de negocio:
//  1. Solo se factura a clientes REGISTRADOS (con idCliente).
//  2. Se factura sobre un TICKET (venta) que exista y esté pagada.
//  3. Un ticket no se puede facturar dos veces (folioVenta es @unique).
//  4. Si el ticket ya tenía cliente, debe ser el MISMO cliente.
//  5. Si el ticket era "mostrador" (sin cliente), se asigna al cliente
//     elegido y se deja rastro en bitácora.
//  6. Los importes se COPIAN de la venta (el servidor es la autoridad):
//     nunca se acepta un total del cliente.
// ============================================================

const FACTURA_INPUT_SCHEMA = z
  .object({
    idCliente: z.string().trim().min(1, "Selecciona el cliente de la factura"),
    folioVenta: z.string().trim().min(1, "Selecciona el ticket a facturar"),
    usoCfdi: z
      .string()
      .trim()
      .regex(
        new RegExp(`^(${CLAVES_USO_CFDI.join("|")})$`, "i"),
        "Uso de CFDI inválido (usa una clave del catálogo SAT: S01, G03, …)"
      )
      .default("S01"),
  })
  .strict();

const money = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** Siguiente folio correlativo del negocio: F-000001, F-000002… */
async function siguienteFolio(tx: any): Promise<string> {
  const ultima = await tx.factura.findFirst({
    orderBy: { folio: "desc" },
    select: { folio: true },
  });
  const correlativo = ultima ? parseInt(String(ultima.folio).replace(/\D/g, ""), 10) : 0;
  const siguiente = (Number.isFinite(correlativo) ? correlativo : 0) + 1;
  return `F-${String(siguiente).padStart(6, "0")}`;
}

export async function GET(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  try {
    const { searchParams } = new URL(request.url);
    const idCliente = searchParams.get("idCliente");
    const limite = Math.min(
      200,
      Math.max(1, Number(searchParams.get("limit")) || 50)
    );

    const facturas = await prisma.factura.findMany({
      where: idCliente ? { idCliente } : undefined,
      orderBy: { fechaEmision: "desc" },
      take: limite,
      include: {
        cliente: { select: { nombre: true, rfc: true, razonSocial: true } },
        usuario: { select: { nombre: true } },
      },
    });

    return NextResponse.json({
      data: facturas.map((f) => ({
        idFactura: f.idFactura,
        folio: f.folio,
        fechaEmision: f.fechaEmision.toISOString(),
        folioVenta: f.folioVenta,
        idCliente: f.idCliente,
        nombreCliente: f.cliente?.razonSocial || f.cliente?.nombre || "",
        rfcCliente: f.cliente?.rfc ?? null,
        usuario: f.usuario?.nombre ?? "",
        subtotal: money(f.subtotal),
        iva: money(f.iva),
        totalNeto: money(f.totalNeto),
        metodoPago: f.metodoPago,
        usoCfdi: f.usoCfdi,
        formaPago: f.formaPago,
        estado: f.estado,
      })),
    });
  } catch (error) {
    console.error("[facturacion] GET error:", error);
    return NextResponse.json(
      { error: "No se pudo cargar el listado de facturas" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = FACTURA_INPUT_SCHEMA.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos de facturación inválidos" },
      { status: 400 }
    );
  }
  const { idCliente, folioVenta, usoCfdi } = parsed.data;
  const usoCfdiMayus = usoCfdi.toUpperCase();

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // Regla 1: el cliente debe estar registrado.
      const cliente = await tx.cliente.findUnique({
        where: { idCliente },
        select: { idCliente: true, nombre: true, rfc: true, razonSocial: true },
      });
      if (!cliente) {
        throw new FacturaError(
          "Solo se puede facturar a un cliente registrado",
          400
        );
      }
      // Para CFDI el receptor necesita RFC o razón social; si falta, se
      // avisa antes de emitir (misma regla que el padrón de clientes).
      if (!tieneDatosFiscales(cliente)) {
        throw new FacturaError(
          "El cliente no tiene RFC ni razón social: actualiza su ficha antes de facturar",
          400
        );
      }

      // Regla 2: el ticket debe existir y estar completado (ni cancelada ni
      // reembolsada: una venta revertida no se factura).
      const venta = await tx.venta.findUnique({
        where: { folioVenta },
        include: { factura: { select: { folio: true } } },
      });
      if (!venta) {
        throw new FacturaError(
          `El ticket ${folioVenta} no existe`,
          404
        );
      }
      if (venta.estado !== "COMPLETADA") {
        throw new FacturaError(
          `El ticket ${folioVenta} no se puede facturar (estado: ${venta.estado})`,
          400
        );
      }

      // Regla 3: un ticket no se factura dos veces.
      if (venta.factura) {
        throw new FacturaError(
          `El ticket ${folioVenta} ya fue facturado con el folio ${venta.factura.folio}`,
          409
        );
      }

      // Regla 4: si el ticket ya tenía cliente, debe coincidir.
      if (venta.idCliente && venta.idCliente !== idCliente) {
        throw new FacturaError(
          "El ticket ya pertenece a otro cliente",
          409
        );
      }

      // Regla 6: los importes salen de la venta, no del cliente.
      const subtotal = money(venta.subtotal);
      const iva = money(venta.iva);
      const totalNeto = money(venta.totalNeto);

      const folio = await siguienteFolio(tx);
      const factura = await tx.factura.create({
        data: {
          folio,
          fechaEmision: new Date(),
          idCliente,
          folioVenta,
          subtotal: new Prisma.Decimal(subtotal),
          iva: new Prisma.Decimal(iva),
          totalNeto: new Prisma.Decimal(totalNeto),
          metodoPago: venta.metodoPago,
          usoCfdi: usoCfdiMayus,
          formaPago: "PUE",
          estado: "EMITIDA",
          idUsuario: user.idPersona,
        },
      });

      // Regla 5: si el ticket era de mostrador, se asigna al cliente.
      if (!venta.idCliente) {
        await tx.venta.update({
          where: { folioVenta },
          data: { idCliente },
        });
      }

      await tx.bitacoraLog.create({
        data: {
          idUsuario: user.idPersona,
          accion: `FACTURA_EMITIDA:${folio}`,
          moduloSistema: "PUNTO_VENTA",
          jsonPayload: {
            folio,
            folioVenta,
            idCliente,
            usoCfdi: usoCfdiMayus,
            totalNeto,
          },
        },
      });

      return { factura, ticketReasignado: !venta.idCliente };
    });

    return NextResponse.json(
      {
        data: {
          idFactura: resultado.factura.idFactura,
          folio: resultado.factura.folio,
          folioVenta: resultado.factura.folioVenta,
          idCliente: resultado.factura.idCliente,
          usoCfdi: resultado.factura.usoCfdi,
          formaPago: resultado.factura.formaPago,
          estado: resultado.factura.estado,
          subtotal: money(resultado.factura.subtotal),
          iva: money(resultado.factura.iva),
          totalNeto: money(resultado.factura.totalNeto),
          ticketReasignado: resultado.ticketReasignado,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof FacturaError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // Carrera por folioVenta (@unique): 409, no 500.
    if (
      typeof Prisma.PrismaClientKnownRequestError === "function" &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ese ticket ya fue facturado" },
        { status: 409 }
      );
    }
    console.error("[facturacion] POST error:", error);
    return NextResponse.json(
      { error: "No se pudo emitir la factura" },
      { status: 500 }
    );
  }
}

class FacturaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}