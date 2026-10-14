import { repartir } from "./impuestos";

// ============================================================
// Descuentos y promociones (puro: lo usan servidor y carrito).
//
// Orden de aplicación por línea:
//   1. Promoción vigente (automática): se toma la que más descuenta.
//        PORCENTAJE  → % sobre el importe de la línea.
//        NXM         → "lleva N paga M" (solo cantidades enteras).
//   2. Descuento manual de la línea (porcentaje o monto).
//   3. Descuento al ticket: se prorratea entre las líneas por importe,
//      cuadrando al centavo.
// El resultado es el importe NETO de cada línea, que después entra al
// motor de impuestos (el descuento reduce la base gravable).
// ============================================================

export type TipoDescuento = "PORCENTAJE" | "MONTO";

export interface DescuentoManual {
  tipo: TipoDescuento;
  valor: number;
}

export interface PromocionVigente {
  idPromocion: string;
  nombre: string;
  tipo: "PORCENTAJE" | "NXM";
  /** Porcentaje (solo PORCENTAJE). */
  valor?: number | null;
  /** "Lleva N paga M" (solo NXM). */
  llevaN?: number | null;
  pagaM?: number | null;
  /** Alcance: un producto, una categoría o (ambos nulos) todo el catálogo. */
  codigoItem?: string | null;
  idCategoria?: string | null;
}

export interface LineaPrecioInput {
  codigoItem: string;
  idCategoria?: string | null;
  cantidad: number;
  /** Precio unitario de lista ya elegido (menudeo o mayoreo). */
  precio: number;
  descuento?: DescuentoManual | null;
}

export interface LineaPrecio {
  codigoItem: string;
  importeBruto: number;
  descuentoPromo: number;
  promocion: string | null;
  descuentoManual: number;
  descuentoTicket: number;
  /** Total descontado en la línea (promo + manual + parte del ticket). */
  descuentoTotal: number;
  importeNeto: number;
}

export interface ResumenPrecios {
  lineas: LineaPrecio[];
  totalBruto: number;
  totalPromociones: number;
  /** Descuentos manuales (líneas + ticket): los que requieren autorización. */
  totalManual: number;
  totalNeto: number;
  /** % manual sobre lo que quedaba después de promociones. */
  porcentajeManual: number;
}

const c = (n: number) => Math.round(n * 100);
const p = (cent: number) => cent / 100;

/** Validación de un descuento capturado (lanza Error con mensaje claro). */
export function normalizarDescuento(raw: unknown): DescuentoManual | null {
  if (raw == null) return null;
  const d = raw as { tipo?: unknown; valor?: unknown };
  const valor = Number(d.valor);
  if (d.tipo !== "PORCENTAJE" && d.tipo !== "MONTO") {
    throw new Error("Tipo de descuento inválido (PORCENTAJE | MONTO)");
  }
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("El descuento debe ser un número mayor o igual a 0");
  }
  if (d.tipo === "PORCENTAJE" && valor > 100) {
    throw new Error("Un descuento no puede pasar de 100%");
  }
  return valor === 0 ? null : { tipo: d.tipo, valor: Math.round(valor * 100) / 100 };
}

function aplica(promo: PromocionVigente, linea: LineaPrecioInput): boolean {
  if (promo.codigoItem) return promo.codigoItem === linea.codigoItem;
  if (promo.idCategoria) return promo.idCategoria === (linea.idCategoria ?? null);
  return true;
}

/** Descuento (centavos) que una promoción da a una línea. */
function descuentoPromo(promo: PromocionVigente, linea: LineaPrecioInput, brutoCent: number): number {
  if (promo.tipo === "PORCENTAJE") {
    const pct = Number(promo.valor);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return Math.min(brutoCent, Math.round((brutoCent * Math.min(pct, 100)) / 100));
  }
  const n = Number(promo.llevaN);
  const m = Number(promo.pagaM);
  if (!Number.isInteger(linea.cantidad) || !(n > m) || !(m >= 0)) return 0;
  const gratis = Math.floor(linea.cantidad / n) * (n - m);
  return Math.min(brutoCent, c(linea.precio * gratis));
}

function montoManual(d: DescuentoManual | null | undefined, baseCent: number): number {
  if (!d || baseCent <= 0) return 0;
  const cent = d.tipo === "PORCENTAJE" ? Math.round((baseCent * d.valor) / 100) : c(d.valor);
  return Math.max(0, Math.min(baseCent, cent));
}

export function aplicarDescuentos(
  lineas: LineaPrecioInput[],
  promociones: PromocionVigente[],
  descuentoTicket?: DescuentoManual | null
): ResumenPrecios {
  const parciales = lineas.map((l) => {
    const bruto = c(l.precio * l.cantidad);
    let mejor = 0;
    let promocion: string | null = null;
    for (const promo of promociones) {
      if (!aplica(promo, l)) continue;
      const d = descuentoPromo(promo, l, bruto);
      if (d > mejor) {
        mejor = d;
        promocion = promo.nombre;
      }
    }
    const manual = montoManual(l.descuento, bruto - mejor);
    return { l, bruto, promo: mejor, promocion, manual, resto: bruto - mejor - manual };
  });

  const restoTotal = parciales.reduce((a, x) => a + x.resto, 0);
  const ticket = montoManual(descuentoTicket, restoTotal);
  const partesTicket = repartir(ticket, parciales.map((x) => x.resto));

  const out: LineaPrecio[] = parciales.map((x, i) => {
    const neto = x.resto - partesTicket[i];
    return {
      codigoItem: x.l.codigoItem,
      importeBruto: p(x.bruto),
      descuentoPromo: p(x.promo),
      promocion: x.promocion,
      descuentoManual: p(x.manual),
      descuentoTicket: p(partesTicket[i]),
      descuentoTotal: p(x.bruto - neto),
      importeNeto: p(neto),
    };
  });

  const bruto = parciales.reduce((a, x) => a + x.bruto, 0);
  const promos = parciales.reduce((a, x) => a + x.promo, 0);
  const manual = parciales.reduce((a, x) => a + x.manual, 0) + ticket;
  const trasPromo = bruto - promos;
  return {
    lineas: out,
    totalBruto: p(bruto),
    totalPromociones: p(promos),
    totalManual: p(manual),
    totalNeto: p(bruto - promos - manual),
    porcentajeManual: trasPromo > 0 ? Math.round((manual / trasPromo) * 10000) / 100 : 0,
  };
}

/** ¿La promoción está vigente en `ahora`? */
export function promocionVigente(
  promo: { activa: boolean; fechaInicio: Date | string; fechaFin?: Date | string | null },
  ahora = new Date()
): boolean {
  if (!promo.activa) return false;
  if (new Date(promo.fechaInicio).getTime() > ahora.getTime()) return false;
  return !promo.fechaFin || new Date(promo.fechaFin).getTime() >= ahora.getTime();
}
