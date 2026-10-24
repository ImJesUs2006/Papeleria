import type { BusinessConfig } from "./business-types";
import { diasParaVencer, inicioDelDia } from "./cuentas-pagar";
import { tienePermiso, type SesionPermisos } from "./permisos";

// ============================================================
// Centro de alertas (Fase A).
//
// Las alertas NO se guardan: se calculan al momento a partir del estado
// del negocio (stock, lotes, pedidos, cuentas por pagar, apartados, cajas).
// Así nunca quedan alertas "viejas" de algo ya resuelto. Lo único que se
// guarda es cuándo un usuario pulsó "Entendido" (AlertaDescartada).
//
// `construirAlertas` es puro (pruebas); `reunirDatosAlertas` consulta la BD.
// ============================================================

export type NivelAlerta = "critica" | "aviso" | "info";
export type TipoAlerta = "stock" | "caducidad" | "pedido" | "pago" | "apartado" | "caja" | "cliente";

export interface Alerta {
  /** Identifica la situación (no cambia mientras siga igual). */
  clave: string;
  tipo: TipoAlerta;
  nivel: NivelAlerta;
  titulo: string;
  detalle: string;
  accion: { etiqueta: string; href: string };
}

export interface DatosAlertas {
  existencias: Array<{ codigoItem: string; descripcion: string; stock: number; minimo: number }>;
  lotes: Array<{ idLote: string; numeroLote: string; descripcion: string; caducidad: Date; cantidad: number }>;
  pedidos: Array<{ idPedido: string; proveedor: string; fechaEntrega: Date; estado: string }>;
  cuentas: Array<{ idCuenta: string; idProveedor: string; proveedor: string; saldo: number; fechaVencimiento: Date }>;
  apartados: Array<{ folio: string; cliente: string; fechaCreado: Date; saldo: number }>;
  cajas: Array<{ idCaja: string; nombre: string; usuario: string; horaApertura: Date; propia: boolean }>;
  /** Clientes frecuentes con su próxima visita estimada (lib/clientes). */
  clientes?: Array<{ idCliente: string; nombre: string; proximaVisita: Date; frecuenciaDias: number }>;
}

export interface ContextoAlertas {
  sesion: SesionPermisos;
  flags: Pick<BusinessConfig["featureFlags"], "inventario" | "proveedores">;
  usarCaducidad: boolean;
  diasApartado: number;
  hoy: Date;
}

const ORDEN: Record<NivelAlerta, number> = { critica: 0, aviso: 1, info: 2 };
const MAX_INDIVIDUALES = 5;
const DIAS_AVISO_CADUCIDAD = 30;
const HORAS_CAJA_ABIERTA = 12;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** Qué puede ver cada quien. */
export function puedeVer(tipo: TipoAlerta, ctx: ContextoAlertas): boolean {
  const admin = ctx.sesion.rol === "ADMINISTRADORA";
  const inventario = tienePermiso(ctx.sesion, "inventario");
  switch (tipo) {
    case "stock":
      return ctx.flags.inventario !== false && inventario;
    case "caducidad":
      return ctx.usarCaducidad && inventario;
    case "pedido":
      return ctx.flags.proveedores === true && inventario;
    case "pago":
      return ctx.flags.proveedores === true && admin;
    case "apartado":
    case "caja":
    case "cliente":
      return true;
  }
}

export function construirAlertas(d: DatosAlertas, ctx: ContextoAlertas): Alerta[] {
  const out: Alerta[] = [];
  const hoy = ctx.hoy;

  // ---------- Stock ----------
  if (puedeVer("stock", ctx)) {
    const agotados = d.existencias.filter((e) => e.stock <= 0);
    const bajos = d.existencias.filter((e) => e.stock > 0 && e.stock <= e.minimo);
    for (const e of agotados.slice(0, MAX_INDIVIDUALES)) {
      out.push({
        clave: `stock-agotado:${e.codigoItem}`,
        tipo: "stock",
        nivel: "critica",
        titulo: `Agotado: ${e.descripcion}`,
        detalle: `No hay existencia (mínimo ${e.minimo}). Las ventas de este producto se detendrán.`,
        accion: { etiqueta: "Ver en inventario", href: `/inventario?buscar=${encodeURIComponent(e.codigoItem)}` },
      });
    }
    if (agotados.length > MAX_INDIVIDUALES) {
      out.push({
        clave: `stock-agotado:resumen:${agotados.length}`,
        tipo: "stock",
        nivel: "critica",
        titulo: `${plural(agotados.length - MAX_INDIVIDUALES, "producto agotado más", "productos agotados más")}`,
        detalle: "Revisa el inventario y genera un pedido a tus proveedores.",
        accion: { etiqueta: "Ver inventario", href: "/inventario" },
      });
    }
    if (bajos.length > 0) {
      const nombres = bajos.slice(0, 3).map((b) => b.descripcion).join(", ");
      out.push({
        clave: `stock-bajo:${bajos.length}`,
        tipo: "stock",
        nivel: "aviso",
        titulo: `${plural(bajos.length, "producto", "productos")} con stock bajo`,
        detalle: `${nombres}${bajos.length > 3 ? " y otros" : ""} están en su mínimo o debajo.`,
        accion: { etiqueta: ctx.flags.proveedores ? "Hacer pedido" : "Ver inventario", href: ctx.flags.proveedores ? "/pedidos" : "/inventario" },
      });
    }
  }

  // ---------- Caducidad ----------
  if (puedeVer("caducidad", ctx)) {
    const vencidos = d.lotes.filter((l) => diasParaVencer(l.caducidad, hoy) < 0);
    const proximos = d.lotes.filter((l) => {
      const dias = diasParaVencer(l.caducidad, hoy);
      return dias >= 0 && dias <= DIAS_AVISO_CADUCIDAD;
    });
    for (const l of vencidos.slice(0, MAX_INDIVIDUALES)) {
      out.push({
        clave: `lote-vencido:${l.idLote}`,
        tipo: "caducidad",
        nivel: "critica",
        titulo: `Caducado: ${l.descripcion}`,
        detalle: `Lote ${l.numeroLote} venció el ${fecha(l.caducidad)} y quedan ${l.cantidad}. No se vende; dalo de baja como merma.`,
        accion: { etiqueta: "Dar de baja", href: "/lotes" },
      });
    }
    if (proximos.length > 0) {
      const primero = proximos[0];
      out.push({
        clave: `lote-por-caducar:${proximos.length}:${primero.idLote}`,
        tipo: "caducidad",
        nivel: "aviso",
        titulo: `${plural(proximos.length, "lote caduca", "lotes caducan")} en los próximos ${DIAS_AVISO_CADUCIDAD} días`,
        detalle: `El primero: ${primero.descripcion} (lote ${primero.numeroLote}) el ${fecha(primero.caducidad)}. Conviene venderlos primero o promocionarlos.`,
        accion: { etiqueta: "Ver lotes", href: "/lotes" },
      });
    }
  }

  // ---------- Pedidos a proveedor ----------
  if (puedeVer("pedido", ctx)) {
    for (const p of d.pedidos) {
      const dias = diasParaVencer(p.fechaEntrega, hoy);
      if (dias < 0) {
        out.push({
          clave: `pedido-atrasado:${p.idPedido}`,
          tipo: "pedido",
          nivel: "aviso",
          titulo: `Pedido atrasado de ${p.proveedor}`,
          detalle: `Debía llegar el ${fecha(p.fechaEntrega)} (${plural(-dias, "día", "días")} de retraso). Confirma con el proveedor.`,
          accion: { etiqueta: "Ver pedido", href: "/pedidos" },
        });
      } else if (dias <= 1) {
        out.push({
          clave: `pedido-llega:${p.idPedido}:${dias}`,
          tipo: "pedido",
          nivel: "info",
          titulo: `${dias === 0 ? "Hoy" : "Mañana"} llega el pedido de ${p.proveedor}`,
          detalle: "Ten lista la recepción para registrar lo que llegue.",
          accion: { etiqueta: "Recibir", href: "/pedidos" },
        });
      }
    }
  }

  // ---------- Pagos a proveedores (una alerta por proveedor) ----------
  if (puedeVer("pago", ctx)) {
    const porProveedor = new Map<string, { proveedor: string; vencidas: typeof d.cuentas; proximas: typeof d.cuentas }>();
    for (const c of d.cuentas) {
      const dias = diasParaVencer(c.fechaVencimiento, hoy);
      if (dias > 3) continue;
      const g = porProveedor.get(c.idProveedor) ?? { proveedor: c.proveedor, vencidas: [], proximas: [] };
      (dias < 0 ? g.vencidas : g.proximas).push(c);
      porProveedor.set(c.idProveedor, g);
    }
    const suma = (cs: typeof d.cuentas) => cs.reduce((s, c) => s + c.saldo, 0);
    const primera = (cs: typeof d.cuentas) =>
      cs.reduce((a, c) => (c.fechaVencimiento < a.fechaVencimiento ? c : a), cs[0]);
    for (const [idProveedor, g] of porProveedor) {
      if (g.vencidas.length > 0) {
        const mas = primera(g.vencidas);
        out.push({
          clave: `pago-vencido:${idProveedor}:${g.vencidas.map((c) => c.idCuenta).sort().join(",")}`,
          tipo: "pago",
          nivel: "critica",
          titulo: `Pago vencido a ${g.proveedor}`,
          detalle:
            g.vencidas.length === 1
              ? `Debes ${dinero(suma(g.vencidas))} desde el ${fecha(mas.fechaVencimiento)}.`
              : `Debes ${dinero(suma(g.vencidas))} de ${g.vencidas.length} compras; la más antigua venció el ${fecha(mas.fechaVencimiento)}.`,
          accion: { etiqueta: "Registrar abono", href: "/proveedores" },
        });
      }
      if (g.proximas.length > 0) {
        const mas = primera(g.proximas);
        const dias = diasParaVencer(mas.fechaVencimiento, hoy);
        out.push({
          clave: `pago-proximo:${idProveedor}:${g.proximas.map((c) => c.idCuenta).sort().join(",")}:${dias}`,
          tipo: "pago",
          nivel: "aviso",
          titulo: `Pago a ${g.proveedor} ${dias === 0 ? "vence hoy" : `vence en ${plural(dias, "día", "días")}`}`,
          detalle:
            g.proximas.length === 1
              ? `Saldo de esa compra: ${dinero(suma(g.proximas))} (vence el ${fecha(mas.fechaVencimiento)}).`
              : `${g.proximas.length} compras suman ${dinero(suma(g.proximas))}; la primera vence el ${fecha(mas.fechaVencimiento)}.`,
          accion: { etiqueta: "Ver estado de cuenta", href: "/proveedores" },
        });
      }
    }
  }

  // ---------- Apartados ----------
  if (puedeVer("apartado", ctx)) {
    for (const a of d.apartados) {
      const vence = new Date(inicioDelDia(a.fechaCreado));
      vence.setDate(vence.getDate() + ctx.diasApartado);
      const dias = diasParaVencer(vence, hoy);
      if (dias < 0) {
        out.push({
          clave: `apartado-vencido:${a.folio}`,
          tipo: "apartado",
          nivel: "aviso",
          titulo: `Apartado vencido: ${a.cliente}`,
          detalle: `El apartado ${a.folio} venció el ${fecha(vence)} y debe ${dinero(a.saldo)}. Contacta al cliente o cancélalo para liberar la mercancía.`,
          accion: { etiqueta: "Ver apartados", href: "/apartados" },
        });
      } else if (dias <= 3) {
        out.push({
          clave: `apartado-por-vencer:${a.folio}:${dias}`,
          tipo: "apartado",
          nivel: "info",
          titulo: `Apartado de ${a.cliente} vence ${dias === 0 ? "hoy" : `en ${plural(dias, "día", "días")}`}`,
          detalle: `Folio ${a.folio}, resta ${dinero(a.saldo)}.`,
          accion: { etiqueta: "Ver apartados", href: "/apartados" },
        });
      }
    }
  }

  // ---------- Cajas abiertas mucho tiempo ----------
  if (puedeVer("caja", ctx)) {
    const admin = ctx.sesion.rol === "ADMINISTRADORA";
    for (const c of d.cajas) {
      if (!admin && !c.propia) continue;
      const horas = (hoy.getTime() - c.horaApertura.getTime()) / 3_600_000;
      if (horas < HORAS_CAJA_ABIERTA) continue;
      out.push({
        clave: `caja-abierta:${c.idCaja}`,
        tipo: "caja",
        nivel: "aviso",
        titulo: c.propia ? "Tu caja lleva abierta más de 12 horas" : `Caja de ${c.usuario} abierta más de 12 horas`,
        detalle: `${c.nombre} se abrió el ${c.horaApertura.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}. Haz el corte para cuadrar el día.`,
        accion: { etiqueta: "Ir a caja", href: "/caja" },
      });
    }
  }

  // ---------- Clientes a los que les toca surtirse ----------
  if (puedeVer("cliente", ctx) && d.clientes?.length) {
    const tocan = d.clientes.filter((c) => {
      const dias = diasParaVencer(c.proximaVisita, hoy);
      return dias >= -1 && dias <= 1;
    });
    for (const c of tocan.slice(0, MAX_INDIVIDUALES)) {
      out.push({
        clave: `cliente-surtido:${c.idCliente}:${inicioDelDia(c.proximaVisita).getTime()}`,
        tipo: "cliente",
        nivel: "info",
        titulo: `A ${c.nombre} le toca surtirse`,
        detalle: `Suele comprar cada ~${c.frecuenciaDias} días. Buen momento para tener listo lo que más se lleva.`,
        accion: { etiqueta: "Ver sus favoritos", href: `/clientes?id=${encodeURIComponent(c.idCliente)}` },
      });
    }
  }

  return out.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}

/** "Entendido" oculta la alerta hasta el final del día. */
export function finDelDia(d: Date): Date {
  const f = inicioDelDia(d);
  f.setHours(23, 59, 59, 999);
  return f;
}
