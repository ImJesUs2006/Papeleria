import { NextResponse } from "next/server";
import { Prisma } from "@papeleria/database";
import { requireAuth } from "@/lib/auth";
import { puedeCobrar } from "@/lib/permisos";
import { getBusinessConfig } from "@/lib/feature-flags";
import { metodoPagoValido } from "@/lib/offline/conflict";
import { registrarMovimientosKardex } from "@/lib/kardex";
import { elegirPrecioUnitario, sufijoFolio, fechaFolio } from "@/lib/sales";
import { calcularImpuestos, tasasProducto } from "@/lib/impuestos";
import { tenantDb } from "@/lib/tenant";
import { claveProducto } from "@/lib/tenant-keys";

// Equivalencias entre el método que envía el POS y el catálogo del negocio.
const MAPA_METODO: Record<string, string> = {
  EFECTIVO: "EFECTIVO",
  TARJETA: "TARJETA_TERMINAL",
  TARJETA_TERMINAL: "TARJETA_TERMINAL",
  DIGITAL: "TRANSFERENCIA",
  TRANSFERENCIA: "TRANSFERENCIA",
};

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
  const prisma = tenantDb(auth.user.idNegocio);
  const user = auth.user;
  if (!puedeCobrar(user)) {
    return NextResponse.json({ error: "Tu usuario no tiene permiso de cobro" }, { status: 403 });
  }

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
    const config = await getBusinessConfig(user.idNegocio);
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
          if (!config.metodosPago.includes(MAPA_METODO[v.metodoPago] as any)) {
            out.push({
              ...resumenBase,
              estado: "rechazada",
              error: `El método de pago ${v.metodoPago} no está habilitado para este negocio`,
            });
            continue;
          }

          // 2. Idempotencia: la primera aparición gana.
          const yaExiste = await tx.venta.findUnique({ where: { idLocal } });
          if (yaExiste) {
            out.push({ idLocal, estado: "duplicada", folio: yaExiste.folioVenta });
            continue;
          }

          // 3. Autoría: el servidor NO confía en el idUsuario del cuerpo. Solo
          //    una administradora puede sincronizar ventas a nombre de otra
          //    persona (cambio de turno); en cualquier otro caso la venta se
          //    atribuye a la sesión autenticada y el dato declarado se audita.
          const alertas: string[] = [];
          const idDeclarado = typeof v.idUsuario === "string" ? v.idUsuario : user.idPersona;
          const puedeDelegar = user.rol === "ADMINISTRADORA";
          const idAutor =
            idDeclarado !== user.idPersona && !puedeDelegar ? user.idPersona : idDeclarado;
          if (idAutor !== idDeclarado) {
            alertas.push(
              `Autoría reasignada: el dispositivo declaró al usuario ${idDeclarado}; se atribuye a la sesión ${user.idPersona}`
            );
          }
          const cajero = await tx.usuario.findUnique({ where: { idPersona: idAutor } });
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

          let subtotal = 0;
          // Una venta se aplica COMPLETA o no se aplica: si un ítem falla se
          // descarta toda y se restaura el stock simulado de este lote.
          let rechazo: string | null = null;
          const stockAntes = new Map(inventarioSimulado);
          const lineas: Array<{
            codigoItem: string;
            cantidad: number;
            precioMomento: number;
            subtotalLinea: number;
            esServicio: boolean;
            tasaIva: number;
            tasaIeps: number;
            ivaLinea: number;
            iepsLinea: number;
          }> = [];

          for (const item of items) {
            const codigo = item.codigoItem;
            const cantidad = Math.round(Number(item.cantidad) * 1000) / 1000;
            if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 999) {
              rechazo = `Cantidad inválida ${codigo}`;
              break;
            }
            const producto = mapaProductos.get(codigo);
            if (!producto || !producto.activo) {
              rechazo = `Producto inexistente o desactivado: ${codigo}`;
              break;
            }
            const esServicio = producto.esServicio;
            if (!esServicio && !producto.permiteDecimales && !Number.isInteger(cantidad)) {
              rechazo = `Cantidad entera requerida para ${codigo}`;
              break;
            }

            // Tolerancia de precio vs. catálogo. Con venta a mayoreo el precio
            // de referencia es el de mayoreo del producto (si existe).
            const precioServidor = elegirPrecioUnitario(
              producto,
              v.esMayoreo === true
            );
            const precioCliente = Number(item.precioMomento);
            const devio =
              precioServidor > 0
                ? Math.abs(precioCliente - precioServidor) / precioServidor
                : Math.abs(precioCliente - precioServidor);
            if (devio > 0.15) {
              rechazo = `Precio fuera de tolerancia (15%) para ${codigo}: local ${precioCliente}, vigente ${precioServidor}`;
              break;
            }

            // Stock simulado con el estado ya aplicado en este batch.
            // Los servicios (esServicio) no participan del inventario.
            if (!esServicio) {
              const stockPrevio = inventarioSimulado.get(codigo) ?? Number(producto.stockActual);
              const stockFinal = stockPrevio - cantidad;
              inventarioSimulado.set(codigo, stockFinal);
              if (stockFinal < 0 && politicaStockOffline === "RECHAZAR") {
                rechazo = `Existencia insuficiente (política RECHAZAR) para ${codigo}`;
                break;
              }
              if (stockFinal < 0) {
                alertas.push(
                  `Inventario negativo simulado para ${codigo}: ${stockPrevio} → ${stockFinal}`
                );
              }
            }

            const precioMomento = precioServidor; // se liquida a precio vigente
            lineas.push({
              codigoItem: codigo,
              cantidad,
              precioMomento,
              subtotalLinea: Math.round(precioMomento * cantidad * 100) / 100,
              esServicio,
              ...tasasProducto(producto, config.ivaRate),
              ivaLinea: 0,
              iepsLinea: 0,
            });
          }

          if (rechazo) {
            inventarioSimulado.clear();
            for (const [k, val] of stockAntes) inventarioSimulado.set(k, val);
            out.push({ ...resumenBase, estado: "rechazada", error: rechazo });
            continue;
          }

          // Blindaje Financiero: transferencias exigen la referencia (4 dígitos).
          const esTransferencia = v.metodoPago === "DIGITAL" || v.metodoPago === "TRANSFERENCIA";
          const referenciaTransferencia = esTransferencia
            ? String(v.referenciaTransferencia ?? "").trim()
            : null;
          if (esTransferencia && !/^\d{4}$/.test(referenciaTransferencia ?? "")) {
            inventarioSimulado.clear();
            for (const [k, val] of stockAntes) inventarioSimulado.set(k, val);
            out.push({
              ...resumenBase,
              estado: "rechazada",
              error: "Pago por transferencia: se requieren los últimos 4 dígitos de la referencia",
            });
            continue;
          }

          // 5. Liquidación: IVA y totales SIEMPRE recalculados en servidor.
          //    Mismo motor fiscal que la venta en línea (IVA por producto, IEPS,
          //    precios con impuestos incluidos).
          const fiscal = calcularImpuestos(
            lineas.map((l) => ({ importe: l.subtotalLinea, tasaIva: l.tasaIva, tasaIeps: l.tasaIeps })),
            { preciosIncluyenIva: config.preciosIncluyenIva }
          );
          fiscal.lineas.forEach((f, i) => {
            lineas[i].subtotalLinea = f.base;
            lineas[i].ivaLinea = f.iva;
            lineas[i].iepsLinea = f.ieps;
          });
          subtotal = fiscal.subtotal;
          const iva = fiscal.iva;
          const ieps = fiscal.ieps;
          const totalNeto = fiscal.total;
          const folioVenta = generarFolioSync();

          // 6. Caja: si existe una ABIERTA (de este u otro dispositivo),
          //    el ingreso se asigna para cuadrar el arqueo.
          const cajaAbierta = await tx.sesionCaja.findFirst({
            where: { estado: "ABIERTA" },
            orderBy: { horaApertura: "desc" },
            select: { idCaja: true },
          });
          if (!cajaAbierta) {
            alertas.push("Sin caja abierta al sincronizar: el ingreso no quedó asignado a ningún arqueo");
          }

          // 7. Persistencia de la venta.
          await tx.venta.create({
            data: {
              folioVenta,
              fechaHora: v.fechaHoraCliente ? new Date(v.fechaHoraCliente) : new Date(),
              subtotal: Math.round(subtotal * 100) / 100,
              iva,
              ieps,
              totalNeto,
              idUsuario: cajero.idPersona,
              idCaja: cajaAbierta?.idCaja ?? null,
              estado: "COMPLETADA",
              metodoPago: v.metodoPago,
              referenciaTransferencia,
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
                tasaIva: l.tasaIva,
                ivaLinea: l.ivaLinea,
                iepsLinea: l.iepsLinea,
              },
            });
            if (!l.esServicio) {
              await tx.producto.update({
                where: claveProducto(l.codigoItem),
                data: { stockActual: { decrement: l.cantidad } },
              });
            }
          }

          // 7b. Kardex inmutable de la venta sincronizada (SALIDA por línea).
          //    Los servicios no generan movimientos de inventario.
          await registrarMovimientosKardex(
            tx,
            lineas
              .filter((l) => !l.esServicio)
              .map((l) => ({
                codigoItem: l.codigoItem,
                tipo: "SALIDA",
                cantidad: l.cantidad,
                motivo: `Venta offline ${folioVenta}`,
                idUsuario: cajero.idPersona,
              }))
          );

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
    // P2034: conflicto de escritura / fallo de serialización (reintentable).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
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

function generarFolioSync(): string {
  return `S-${fechaFolio()}-${sufijoFolio()}`;
}
