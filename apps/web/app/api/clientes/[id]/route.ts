import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { calcularNivel, equivalenciaPuntos } from "@/lib/fidelidad";
import { tenantDb } from "@/lib/tenant";
import { CLIENTE_PATCH_SCHEMA, enmascarar, faltantesFiscales, perfilDeCompra } from "@/lib/clientes";
import { validar, esObjetoJson } from "@/lib/validacion";

// ============================================================
// GET    /api/clientes/[id] → ficha + historial de compras + monedero
// PATCH  /api/clientes/[id] → edita datos de contacto y fiscales (administradora)
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
  const prisma = tenantDb(auth.user.idNegocio);

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
    const completo = auth.user.rol === "ADMINISTRADORA";

    // Perfil: cada cuánto compra (todas sus compras, solo fecha y total).
    const historial = await prisma.venta.findMany({
      where: { idCliente: id, estado: { not: "CANCELADA" } },
      select: { fechaHora: true, totalNeto: true },
      orderBy: { fechaHora: "asc" },
      take: 500,
    });
    const perfil = perfilDeCompra(historial.map((v) => ({ fechaHora: v.fechaHora, total: Number(v.totalNeto) })));

    // Lo que más compra (para "agregar sus favoritos" en el POS).
    const lineas = await prisma.lineaDetalleVenta.groupBy({
      by: ["codigoItem"],
      where: { venta: { idCliente: id, estado: { not: "CANCELADA" } } },
      _sum: { cantidad: true, subtotalLinea: true },
      _count: { _all: true },
      orderBy: { _sum: { cantidad: "desc" } },
      take: 8,
    });
    const productos = lineas.length
      ? await prisma.producto.findMany({
          where: { codigoItem: { in: lineas.map((l) => l.codigoItem) } },
          select: { codigoItem: true, descripcion: true, precioUnitario: true, imagenUrl: true },
        })
      : [];
    const favoritos = lineas.map((l) => {
      const p = productos.find((x) => x.codigoItem === l.codigoItem);
      return {
        codigoItem: l.codigoItem,
        descripcion: p?.descripcion ?? l.codigoItem,
        precioUnitario: p ? Number(p.precioUnitario) : null,
        imagenUrl: p?.imagenUrl ?? null,
        cantidad: Number(l._sum.cantidad ?? 0),
        veces: l._count._all,
      };
    });

    return NextResponse.json({
      cliente: {
        idCliente: cliente.idCliente,
        nombre: cliente.nombre,
        telefono: completo ? cliente.telefono : enmascarar.telefono(cliente.telefono),
        email: completo ? cliente.email : enmascarar.email(cliente.email),
        saldoDeudor: Number(cliente.saldoDeudor ?? 0),
        puntosFidelidad: puntos,
        // Datos fiscales del receptor (CFDI 4.0).
        rfc: completo ? cliente.rfc ?? null : enmascarar.rfc(cliente.rfc),
        razonSocial: cliente.razonSocial ?? null,
        regimenFiscal: cliente.regimenFiscal ?? null,
        codigoPostalFiscal: completo ? cliente.codigoPostalFiscal ?? null : cliente.codigoPostalFiscal ? "•••••" : null,
        usoCfdi: cliente.usoCfdi ?? null,
        notas: cliente.notas ?? null,
        faltantesFiscales: faltantesFiscales(cliente),
        datosCompletos: completo,
        nivel: calcularNivel(montoHistorico),
        montoHistorico,
        equivalenciaPesos: equivalenciaPuntos(puntos),
        totalVentas: Number(agregado._count._all ?? 0),
        createdAt: cliente.createdAt,
      },
      perfil,
      favoritos,
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Contacto y datos fiscales: solo la administradora (la cajera los ve enmascarados).
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
    if (!esObjetoJson(body)) throw new TypeError("Se esperaba un objeto JSON");
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = validar(CLIENTE_PATCH_SCHEMA, body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, campos: parsed.campos }, { status: 400 });
  }
  // Solo los campos enviados; un opcional vacío se borra (null).
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.datos)) {
    if ((body as Record<string, unknown>)[k] !== undefined) data[k] = v ?? null;
  }
  const actual = await prisma.cliente.findUnique({ where: { idCliente: id }, select: { rfc: true, regimenFiscal: true } });
  if (!actual) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  const { regimenCompatible } = await import("@/lib/sat-catalogos");
  const rfc = (data.rfc as string | null | undefined) ?? (data.rfc === null ? null : actual.rfc);
  const regimen = (data.regimenFiscal as string | null | undefined) ?? (data.regimenFiscal === null ? null : actual.regimenFiscal);
  if (rfc && regimen && !regimenCompatible(regimen, rfc)) {
    return NextResponse.json(
      { error: "El régimen fiscal no corresponde al tipo de RFC (persona física o moral)", campos: { regimenFiscal: "No corresponde al RFC" } },
      { status: 400 }
    );
  }

  try {
    const cliente = await prisma.cliente.update({
      where: { idCliente: id },
      data,
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
  // Borrar clientes es de administración (la pantalla solo se lo ofrece a ella).
  const auth = await requireAuth(["ADMINISTRADORA"])();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);

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