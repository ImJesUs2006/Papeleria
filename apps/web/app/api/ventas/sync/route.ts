import { NextResponse } from "next/server";
import { prisma, Prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/feature-flags";
import { metodoPagoValido } from "@/lib/offline/conflict";

// ============================================================
// POST /api/ventas/sync
// ORQUESTADOR DE SINCRONIZACIÓN OFFLINE → ONLINE.
//
// Guarantees ofrecidas:
//   - Idempotencia estricta por idLocal (re-emisión no duplica).
//   - Lecturas SERIALIZABLES en conflicto (última unidad en carrera).
//   - Política stock offline del negocio: PERMITIR_NEGATIVO con
//     alerta, o RECHAZAR ventas insuficientes.
//   - Precio de ítems validado contra precio vigente (tolerancia 15%):
//     evita que una cajera forje totales bajos en modo offline.
//   - Auditoría total por batch vía BitacoraLog (ModuloSistema SYNC).
// ============================================================

const MAX_VENTAS_POR_BATCH = 500;

export async function POST(request: Request) {
  const auth = await requireAuth()();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const user = auth.user;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const dispositivoId =
    typeof body.dispositivoId === "string" ? body.dispositivoId.slice(0, 80) : "desconocido";
  const ventas: any[] = Array.isArray(body.ventas) ? body.ventas : [];

  if (ventas.length === 0) {
    return NextResponse.json({ resultados: [] });
  }
  if (ventas.length > MAX_VENTAS_POR_BATCH) {
    return NextResponse.json(
      { error: `Lote excede el máximo de ${MAX_VENTAS_POR_BATCH} ventas` },
      { status: 413 }
    );
  }

  // Orden determinista por reloj-cliente (dentro del mismo batch).
  const ordenadas = [...ventas].sort((a, b) =>
    String(a.fechaHoraCliente || "").localeCompare(String(b.fechaHoraCliente || ""))
  );

  try {
    const config = await getBusinessConfig();
    const politicaStockOffline = config.politicaStockOffline;

    const resultados = await prisma.$transaction(
      async (tx) => {
        const inventarioSimulado = new Map<string, number>();
        const out: Array<{
          idLocal: string | null;
          estado: "aplicada" | "duplicada" | "rechazada";
          folio: string | null;
          error?: string;
          alertas?: string[];
        }> = [];

        for (const v of ordenadas) {
          const idLocal = typeof v.idLocal === "string" ? v.idLocal : null;
          const resumenBase = { idLocal, estado: "duplicada" as const, folio: null as string | null };

          if (!idLocal) {
            out.push({ idLocal: null, estado: "rechazada", folio: null, error: "Falta idLocal (idempotencia)" });
            continue;
          }

          // 1. Validaciones estructurales.
          const items = Array.isArray(v.items) ? v.items : [];
          if (items.length === 0) {
            out.push({ ...resumenBase, estado: "rechazada", error: "Venta sin ítems" });
            continue;
          }
          if (!metodoPagoValido(v.metodoPago)) {
            out.push({ ...resumenBase, estado: "rechazada", error: "Método de pago inválido" });
            continue;
          }

          // 2. Idempotencia: la primera aparición gana.
          const yaExiste = await tx.venta.findUnique({ where: { idLocal } });
          if (yaExiste) {
            out.push({ idLocal, estado: "duplicada", folio: yaExiste.folioVenta });
            continue;
          }

          // 3. Usuario vigente (la que encara el turno).
          const cajero = await tx.usuario.findUnique({ where: { idPersona: v.idUsuario } });
          if (!cajero || !cajero.activa) {
            out.push({ ...resumenBase, estado: "rechazada", error: "Usuario inexistente o desactivado" });
            continue;
          }

          // 4. Precios contra catálogo vigente (anti-forja de totales).
          const codigos = items.map((i: any) => i.codigoItem);
          const productos = await tx.producto.findMany({
            where: { codigoItem: { in: codigos } },
          });
          const mapaProductos = new Map(productos.map((p) => [p.codigoItem, p]));

          const alertas: string[] = [];
          let subtotal = 0;
          const lineas: Array<{
            codigoItem: string;
            cantidad: number;
            precioMomento: number;
            subtotalLinea: number;
          }> = [];

          for (const item of items) {
            const codigo = item.codigoItem;
            const cantidad = Math.round(Number(item.cantidad));
            if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
              out.push({
                ...resumenBase,
                estado: "rechazada",
                error: `Cantidad inválida ${codigo}`,
              });
              break;
            }
            const producto = mapaProductos.get(codigo);
            if (!producto || !producto.activo) {
              out.push({
                ...resumenBase,
                estado: "rechazada",
                error: `Producto inexistente o desactivado: ${codigo}`,
              });
              break;
            }

            // Tolerancia de precio vs. catálogo.
            const precioServidor = Number(producto.precioUnitario);
            const precioCliente = Number(item.precioMomento);
            const devio =
              precioServidor > 0
                ? Math.abs(precioCliente - precioServidor) / precioServidor
                : Math.abs(precioCliente - precioServidor);
            if (devio > 0.15) {
              out.push({
                ...resumenBase,
                estado: "rechazada",
                error: `Precio fuera de tolerancia (15%) para ${codigo}: local ${precioCliente}, vigente ${precioServidor}`,
              });
              break;
            }

            // Stock simulado con el estado ya aplicado en este batch.
            const stockPrevio = inventarioSimulado.get(codigo) ?? producto.stockActual;
            const stockFinal = stockPrevio - cantidad;
            inventarioSimulado.set(codigo, stockFinal);
            if (stockFinal < 0 && politicaStockOffline === "RECHAZAR") {
              out.push({
                ...resumenBase,
                estado: "rechazada",
                error: `Existencia insuficiente (política RECHAZAR) para ${codigo}`,
              });
              break;
            }
            if (stockFinal < 0) {
              alertas.push(
                `Inventario negativo simulado para ${codigo}: ${stockPrevio} → ${stockFinal}`
              );
            }

            const precioMomento = precioServidor; // se liquida a precio vigente
            const subtotalLinea = Math.round(precioMomento * cantidad * 100) / 100;
            subtotal += subtotalLinea;
            lineas.push({
              codigoItem: codigo,
              cantidad,
              precioMomento,
              subtotalLinea,
            });
          }

          if (lineas.length === 0) continue; // ya se marcó rechazo dentro del loop

          // 5. Liquidación: IVA y totales SIEMPRE recalculados en servidor.
          const iva = Math.round(subtotal * Number(config.ivaRate) / 100 * 100) / 100;
          const totalNeto = Math.round((subtotal + iva) * 100) / 100;
          const folioVenta = generarFolioSync();

          // 6. Caja: si existe una ABIERTA (de este u otro dispositivo),
          //    el ingreso se asigna para cuadrar el arqueo.
          const cajaAbierta = await tx.sesionCaja.findFirst({
            where: { estado: "ABIERTA" },
            orderBy: { horaApertura: "desc" },
            select: { idCaja: true },
          });

          // 7. Persistencia de la venta.
          await tx.venta.create({
            data: {
              folioVenta,
              fechaHora: v.fechaHoraCliente ? new Date(v.fechaHoraCliente) : new Date(),
              subtotal: Math.round(subtotal * 100) / 100,
              iva,
              totalNeto,
              idUsuario: cajero.idPersona,
              idCaja: cajaAbierta?.idCaja ?? null,
              estado: "COMPLETADA",
              metodoPago: v.metodoPago,
              idLocal,
              origen: "OFFLINE",
              dispositivoId,
              fechaHoraCliente: v.fechaHoraCliente ? new Date(v.fechaHoraCliente) : null,
            },
          });

          for (const l of lineas) {
            await tx.lineaDetalleVenta.create({
              data: {
                folioVenta,
                codigoItem: l.codigoItem,
                cantidad: l.cantidad,
                precioMomento: l.precioMomento,
                descuentoLinea: 0,
                subtotalLinea: l.subtotalLinea,
              },
            });
            await tx.producto.update({
              where: { codigoItem: l.codigoItem },
              data: { stockActual: { decrement: l.cantidad } },
            });
          }

          // 8. Impacto financiero en caja (efectivo vs digital vs recargas).
          if (cajaAbierta) {
            const esRecarga = v.tipoVenta === "RECARGA";
            const campo = esRecarga
              ? "totalRecargas"
              : v.metodoPago === "EFECTIVO"
                ? "totalVentasEfectivo"
                : "totalVentasDigital";
            await tx.sesionCaja.update({
              where: { idCaja: cajaAbierta.idCaja },
              data: { [campo]: { increment: totalNeto } },
            });
          }

          // 9. Bitácora con alertas.
          await tx.bitacoraLog.create({
            data: {
              idUsuario: cajero.idPersona,
              accion: `Venta offline ${folioVenta} sincronizada (dispositivo ${dispositivoId})${
                alertas.length ? " CON ALERTAS" : ""
              }`,
              moduloSistema: "SYNC",
              jsonPayload: {
                idLocal,
                folioVenta,
                subtotal,
                iva,
                totalNeto,
                alertas,
                politicaStockOffline,
                fechaHoraCliente: v.fechaHoraCliente,
              },
            },
          });

          out.push({
            idLocal,
            estado: "aplicada",
            folio: folioVenta,
            alertas: alertas.length ? alertas : undefined,
          });
        }

        return out;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 }
    );

    // Bitácora de auditoría del batch (nivel agregado).
    const aplicadas = resultados.filter((r) => r.estado === "aplicada").length;
    const duplicadas = resultados.filter((r) => r.estado === "duplicada").length;
    const rechazadas = resultados.filter((r) => r.estado === "rechazada").length;
    await prisma.bitacoraLog.create({
      data: {
        idUsuario: user.idPersona,
        accion: `Sync batch desde ${dispositivoId}: ${aplicadas} aplicadas, ${duplicadas} duplicadas, ${rechazadas} rechazadas`,
        moduloSistema: "SYNC",
        jsonPayload: { device: dispositivoId, aplicadas, duplicadas, rechazadas },
      },
    });

    return NextResponse.json({ resultados });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P4001") {
      return NextResponse.json(
        { error: "Conflicto de serialización; reintenta el lote" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Error interno al sincronizar ventas" },
      { status: 500 }
    );
  }
}

let folioSeq = 0;
function generarFolioSync(): string {
  const d = new Date();
  const fecha = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  folioSeq = (folioSeq + 1) % 10000;
  return `S-${fecha}-${String(folioSeq).padStart(4, "0")}-${Math.random()
    .toString(36)
    .slice(2, 4)
    .toUpperCase()}`;
}