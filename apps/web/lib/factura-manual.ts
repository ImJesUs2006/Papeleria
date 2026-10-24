import { REGIMENES_FISCALES, USOS_CFDI } from "./sat-catalogos";

// ============================================================
// Facturación manual (Fase B): el sistema PREPARA todo lo que pide el
// portal gratuito del SAT y la administradora lo captura allá con su
// e.firma/contraseña. Después registra aquí el folio fiscal (UUID) que el
// SAT asigna al timbrar. Sin PAC: no se envía nada al SAT desde aquí.
// ============================================================

/** c_FormaPago del SAT según cómo se cobró la venta. */
export const FORMA_PAGO_SAT: Record<string, { clave: string; nombre: string }> = {
  EFECTIVO: { clave: "01", nombre: "Efectivo" },
  TRANSFERENCIA: { clave: "03", nombre: "Transferencia electrónica de fondos" },
  DIGITAL: { clave: "03", nombre: "Transferencia electrónica de fondos" },
  TARJETA_TERMINAL: { clave: "04", nombre: "Tarjeta de crédito (28 si fue de débito)" },
  TARJETA: { clave: "04", nombre: "Tarjeta de crédito (28 si fue de débito)" },
  PUNTOS_MONEDERO: { clave: "05", nombre: "Monedero electrónico" },
  MIXTO: { clave: "99", nombre: "Por definir (pago con varias formas: elige la principal)" },
};

/** Clave genérica que acepta el SAT cuando el producto no tiene su clave propia. */
export const CLAVE_PROD_SERV_GENERICA = "01010101";

export interface DatosEmisor {
  rfc?: string | null;
  razonSocial?: string | null;
  regimenFiscal?: string | null;
  cp?: string | null;
  codigoPostal?: string | null;
}

/** "601 - General de Ley…" o "601" → "601". */
export function claveDe(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const t = valor.trim().split(/[\s-]+/)[0];
  return t ? t.toUpperCase() : null;
}

/** Qué le falta al EMISOR (tus datos en Configuración) para facturar. */
export function faltantesEmisor(d: DatosEmisor | null | undefined): string[] {
  const faltan: string[] = [];
  if (!d?.rfc) faltan.push("RFC");
  if (!d?.razonSocial) faltan.push("Razón social");
  if (!claveDe(d?.regimenFiscal)) faltan.push("Régimen fiscal");
  if (!(d?.cp || d?.codigoPostal)) faltan.push("Código postal (lugar de expedición)");
  return faltan;
}

/** Folio fiscal (UUID) como lo entrega el SAT: 8-4-4-4-12 hexadecimal. */
export function validarFolioFiscal(v: unknown): { ok: true; valor: string } | { ok: false; error: string } {
  const s = String(v ?? "").trim().toUpperCase();
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(s)) {
    return { ok: false, error: "Folio fiscal inválido: son 36 caracteres como 1A2B3C4D-1234-ABCD-1234-1A2B3C4D5E6F" };
  }
  return { ok: true, valor: s };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

export interface LineaVentaFactura {
  descripcion: string;
  cantidad: number;
  /** Base sin impuestos de la línea. */
  subtotalLinea: number;
  ivaLinea: number | null;
  iepsLinea: number | null;
  esServicio: boolean;
  claveProdServ?: string | null;
}

/** Todo lo que se captura en el portal del SAT, ya calculado. */
export function armarPaquete(p: {
  folio: string;
  emisor: DatosEmisor;
  receptor: {
    rfc: string;
    razonSocial: string;
    regimenFiscal: string;
    codigoPostalFiscal: string;
    usoCfdi: string;
    email?: string | null;
  };
  metodoPagoVenta: string;
  lineas: LineaVentaFactura[];
  totales: { subtotal: number; iva: number; ieps: number; total: number };
}) {
  const regEmisor = claveDe(p.emisor.regimenFiscal);
  return {
    folioInterno: p.folio,
    emisor: {
      rfc: p.emisor.rfc ?? "",
      razonSocial: p.emisor.razonSocial ?? "",
      regimenFiscal: `${regEmisor ?? ""} · ${REGIMENES_FISCALES.find((r) => r.clave === regEmisor)?.nombre ?? ""}`,
      lugarExpedicion: p.emisor.cp || p.emisor.codigoPostal || "",
    },
    receptor: {
      rfc: p.receptor.rfc,
      razonSocial: p.receptor.razonSocial,
      regimenFiscal: `${p.receptor.regimenFiscal} · ${REGIMENES_FISCALES.find((r) => r.clave === p.receptor.regimenFiscal)?.nombre ?? ""}`,
      codigoPostal: p.receptor.codigoPostalFiscal,
      usoCfdi: `${p.receptor.usoCfdi} · ${USOS_CFDI.find((u) => u.clave === p.receptor.usoCfdi)?.nombre ?? ""}`,
      email: p.receptor.email ?? null,
    },
    comprobante: {
      tipo: "I · Ingreso",
      metodoPago: "PUE · Pago en una sola exhibición",
      formaPago: (() => {
        const f = FORMA_PAGO_SAT[p.metodoPagoVenta] ?? FORMA_PAGO_SAT.EFECTIVO;
        return `${f.clave} · ${f.nombre}`;
      })(),
      moneda: "MXN",
      exportacion: "01 · No aplica",
    },
    conceptos: p.lineas.map((l) => {
      const cantidad = Number(l.cantidad) || 0;
      const base = r2(l.subtotalLinea);
      return {
        claveProdServ: l.claveProdServ || CLAVE_PROD_SERV_GENERICA,
        claveUnidad: l.esServicio ? "E48 · Unidad de servicio" : "H87 · Pieza",
        descripcion: l.descripcion,
        cantidad,
        valorUnitario: cantidad > 0 ? r6(base / cantidad) : 0,
        importe: base,
        objetoImpuesto: "02 · Sí objeto de impuesto",
        iva: l.ivaLinea != null ? r2(l.ivaLinea) : null,
        ieps: l.iepsLinea != null && l.iepsLinea > 0 ? r2(l.iepsLinea) : null,
      };
    }),
    totales: { ...p.totales },
  };
}

export type PaqueteFactura = ReturnType<typeof armarPaquete>;
