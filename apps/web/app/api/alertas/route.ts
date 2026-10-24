import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tenantDb } from "@/lib/tenant";
import { getBusinessConfig } from "@/lib/feature-flags";
import { construirAlertas, finDelDia, puedeVer, type ContextoAlertas, type DatosAlertas } from "@/lib/alertas";
import { perfilDeCompra } from "@/lib/clientes";

// ============================================================
// GET  /api/alertas            → alertas vigentes para quien consulta
// POST /api/alertas  { clave } → "Entendido": la oculta hasta mañana
// ============================================================

const ESTADOS_PEDIDO_ABIERTO = ["PENDIENTE", "EN_RUTA", "PARCIAL"];

export async function GET() {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;
  const prisma = tenantDb(user.idNegocio);
  const hoy = new Date();

  try {
    const config = await getBusinessConfig(user.idNegocio);
    const ctx: ContextoAlertas = {
      sesion: user,
      flags: config.featureFlags,
      usarCaducidad: config.usarCaducidad,
      diasApartado: config.diasApartado,
      hoy,
    };
    const ver = (t: Parameters<typeof puedeVer>[0]) => puedeVer(t, ctx);
    const limiteCaducidad = new Date(hoy.getTime() + 31 * 86_400_000);
    const sucursal = user.idSucursal ?? null;

    // Solo se consulta lo que esta persona puede ver.
    const [existencias, lotes, pedidos, cuentas, apartados, cajas, descartadas] = await Promise.all([
      ver("stock")
        ? sucursal
          ? prisma.existencia.findMany({
              where: { idSucursal: sucursal, producto: { activo: true, esServicio: false } },
              select: {
                codigoItem: true,
                stock: true,
                producto: { select: { descripcion: true, stockMinimo: true } },
              },
            })
          : prisma.producto
              .findMany({
                where: { activo: true, esServicio: false },
                select: { codigoItem: true, descripcion: true, stockActual: true, stockMinimo: true },
              })
              .then((ps) =>
                ps.map((p) => ({
                  codigoItem: p.codigoItem,
                  stock: p.stockActual,
                  producto: { descripcion: p.descripcion, stockMinimo: p.stockMinimo },
                }))
              )
        : [],
      ver("caducidad")
        ? prisma.lote.findMany({
            where: {
              cantidad: { gt: 0 },
              caducidad: { not: null, lte: limiteCaducidad },
              ...(sucursal ? { idSucursal: sucursal } : {}),
            },
            orderBy: { caducidad: "asc" },
            take: 200,
            include: { producto: { select: { descripcion: true } } },
          })
        : [],
      ver("pedido")
        ? prisma.pedidoProveedor.findMany({
            where: { estado: { in: ESTADOS_PEDIDO_ABIERTO }, fechaEntrega: { not: null, lte: new Date(hoy.getTime() + 2 * 86_400_000) } },
            include: { proveedor: { select: { nombre: true } } },
            take: 50,
          })
        : [],
      ver("pago")
        ? prisma.cuentaPorPagar.findMany({
            where: { estado: "PENDIENTE", fechaVencimiento: { lte: new Date(hoy.getTime() + 4 * 86_400_000) } },
            include: { proveedor: { select: { nombre: true } } },
            orderBy: { fechaVencimiento: "asc" },
            take: 50,
          })
        : [],
      prisma.apartado.findMany({
        where: {
          estado: "PENDIENTE",
          fechaCreado: { lte: new Date(hoy.getTime() - (config.diasApartado - 4) * 86_400_000) },
        },
        include: { cliente: { select: { nombre: true } } },
        take: 50,
      }),
      prisma.sesionCaja.findMany({
        where: {
          estado: { in: ["ABIERTA", "EN_CIERRE"] },
          horaApertura: { lte: new Date(hoy.getTime() - 12 * 3_600_000) },
          ...(user.rol === "ADMINISTRADORA" ? {} : { idUsuario: user.idPersona }),
        },
        include: { usuario: { select: { nombre: true } } },
        take: 20,
      }),
      prisma.alertaDescartada.findMany({
        where: { idPersona: user.idPersona, hasta: { gt: hoy } },
        select: { clave: true },
      }),
    ]);

    // Clientes frecuentes: compras de los últimos 6 meses para estimar cuándo vuelven.
    const comprasClientes = await prisma.venta.findMany({
      where: {
        idCliente: { not: null },
        estado: { not: "CANCELADA" },
        fechaHora: { gte: new Date(hoy.getTime() - 180 * 86_400_000) },
      },
      select: { idCliente: true, fechaHora: true, totalNeto: true, cliente: { select: { nombre: true } } },
      orderBy: { fechaHora: "desc" },
      take: 3000,
    });
    const porCliente = new Map<string, { nombre: string; ventas: Array<{ fechaHora: Date; total: number }> }>();
    for (const v of comprasClientes) {
      if (!v.idCliente) continue;
      const g = porCliente.get(v.idCliente) ?? { nombre: v.cliente?.nombre ?? "Cliente", ventas: [] };
      g.ventas.push({ fechaHora: v.fechaHora, total: Number(v.totalNeto) });
      porCliente.set(v.idCliente, g);
    }
    const clientesFrecuentes: NonNullable<DatosAlertas["clientes"]> = [];
    for (const [idCliente, g] of porCliente) {
      if (g.ventas.length < 3) continue;
      const p = perfilDeCompra(g.ventas, hoy);
      if (p.proximaVisita && p.frecuenciaDias) {
        clientesFrecuentes.push({ idCliente, nombre: g.nombre, proximaVisita: p.proximaVisita, frecuenciaDias: p.frecuenciaDias });
      }
    }

    const datos: DatosAlertas = {
      existencias: existencias.map((e) => ({
        codigoItem: e.codigoItem,
        descripcion: e.producto.descripcion,
        stock: Number(e.stock),
        minimo: Number(e.producto.stockMinimo),
      })),
      lotes: lotes.map((l) => ({
        idLote: l.idLote,
        numeroLote: l.numeroLote,
        descripcion: l.producto.descripcion,
        caducidad: l.caducidad as Date,
        cantidad: Number(l.cantidad),
      })),
      pedidos: pedidos.map((p) => ({
        idPedido: p.idPedido,
        proveedor: p.proveedor.nombre,
        fechaEntrega: p.fechaEntrega as Date,
        estado: p.estado,
      })),
      cuentas: cuentas.map((c) => ({
        idCuenta: c.idCuenta,
        idProveedor: c.idProveedor,
        proveedor: c.proveedor.nombre,
        saldo: Number(c.saldo),
        fechaVencimiento: c.fechaVencimiento,
      })),
      apartados: apartados.map((a) => ({
        folio: a.folio,
        cliente: a.cliente.nombre,
        fechaCreado: a.fechaCreado,
        saldo: Number(a.total) - Number(a.anticipo),
      })),
      cajas: cajas.map((c) => ({
        idCaja: c.idCaja,
        nombre: c.nombreCaja || c.folioCaja || "Caja",
        usuario: c.usuario.nombre,
        horaApertura: c.horaApertura,
        propia: c.idUsuario === user.idPersona,
      })),
      clientes: clientesFrecuentes,
    };

    const ocultas = new Set(descartadas.map((d) => d.clave));
    const alertas = construirAlertas(datos, ctx).filter((a) => !ocultas.has(a.clave));
    return NextResponse.json({
      alertas,
      total: alertas.length,
      criticas: alertas.filter((a) => a.nivel === "critica").length,
    });
  } catch (error) {
    console.error("[alertas]", error);
    return NextResponse.json({ error: "No se pudieron calcular las alertas" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const prisma = tenantDb(auth.user.idNegocio);
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const clave = typeof body?.clave === "string" ? body.clave.trim().slice(0, 200) : "";
  if (!clave) return NextResponse.json({ error: "Falta la alerta" }, { status: 400 });

  const hasta = finDelDia(new Date());
  await prisma.alertaDescartada.upsert({
    where: { idPersona_clave: { idPersona: auth.user.idPersona, clave } },
    create: { idPersona: auth.user.idPersona, clave, hasta },
    update: { hasta },
  });
  return NextResponse.json({ ok: true, hasta });
}
