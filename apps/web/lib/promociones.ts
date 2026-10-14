import type { PrismaClient } from "@papeleria/database";
import type { PromocionVigente } from "./descuentos";

// ============================================================
// Promociones: validación de captura y lectura de las vigentes.
// `db` es siempre el cliente con alcance de negocio (lib/tenant).
// ============================================================

export class PromocionError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface PromocionInput {
  nombre: string;
  tipo: "PORCENTAJE" | "NXM";
  valor: number | null;
  llevaN: number | null;
  pagaM: number | null;
  codigoItem: string | null;
  idCategoria: string | null;
  fechaInicio: Date;
  fechaFin: Date | null;
  activa: boolean;
}

/**
 * Fecha capturada. Un día suelto ("2026-10-20") cuenta COMPLETO en la hora
 * local del servidor: el inicio desde las 00:00 y el fin hasta las 23:59:59.
 * (Antes se leía como medianoche UTC y la promoción terminaba un día antes.)
 */
function fecha(v: unknown, campo: string, finDelDia = false): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const texto = String(v);
  const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  const d = soloDia
    ? finDelDia
      ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]), 23, 59, 59, 999)
      : new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]), 0, 0, 0, 0)
    : new Date(texto);
  if (Number.isNaN(d.getTime())) throw new PromocionError(`${campo} inválida`);
  return d;
}

/** Normaliza y valida la captura de una promoción. */
export function validarPromocion(raw: any): PromocionInput {
  const nombre = String(raw?.nombre ?? "").trim();
  if (nombre.length < 2 || nombre.length > 80) {
    throw new PromocionError("El nombre debe tener entre 2 y 80 caracteres");
  }
  const tipo = raw?.tipo === "NXM" ? "NXM" : raw?.tipo === "PORCENTAJE" ? "PORCENTAJE" : null;
  if (!tipo) throw new PromocionError("Tipo de promoción inválido (PORCENTAJE | NXM)");

  let valor: number | null = null;
  let llevaN: number | null = null;
  let pagaM: number | null = null;
  if (tipo === "PORCENTAJE") {
    valor = Number(raw?.valor);
    if (!Number.isFinite(valor) || valor <= 0 || valor > 100) {
      throw new PromocionError("El porcentaje debe ser mayor a 0 y hasta 100");
    }
    valor = Math.round(valor * 100) / 100;
  } else {
    llevaN = Number(raw?.llevaN);
    pagaM = Number(raw?.pagaM);
    if (!Number.isInteger(llevaN) || !Number.isInteger(pagaM) || llevaN < 2 || pagaM < 1 || pagaM >= llevaN || llevaN > 100) {
      throw new PromocionError('"Lleva N paga M" requiere enteros con N mayor que M (ej. 3x2)');
    }
  }

  const codigoItem = String(raw?.codigoItem ?? "").trim() || null;
  const idCategoria = String(raw?.idCategoria ?? "").trim() || null;
  if (codigoItem && idCategoria) {
    throw new PromocionError("Elige un producto O una categoría (o ninguno para todo el catálogo)");
  }

  // La hora de inicio la pone la aplicación (no el reloj de la base), para
  // que una promoción creada "ahora" aplique de inmediato.
  const fechaInicio = fecha(raw?.fechaInicio, "Fecha de inicio") ?? new Date(Date.now() - 1000);
  const fechaFin = fecha(raw?.fechaFin, "Fecha de fin", true);
  if (fechaFin && fechaFin.getTime() < fechaInicio.getTime()) {
    throw new PromocionError("La fecha de fin no puede ser anterior a la de inicio");
  }

  return {
    nombre,
    tipo,
    valor,
    llevaN,
    pagaM,
    codigoItem,
    idCategoria,
    fechaInicio,
    fechaFin,
    activa: raw?.activa !== false,
  };
}

/** Promociones vigentes del negocio en `ahora`. */
export async function promocionesVigentes(
  db: Pick<PrismaClient, "promocion">,
  ahora = new Date()
): Promise<PromocionVigente[]> {
  const filas = await db.promocion.findMany({
    where: {
      activa: true,
      fechaInicio: { lte: ahora },
      OR: [{ fechaFin: null }, { fechaFin: { gte: ahora } }],
    },
  });
  return filas.map((p) => ({
    idPromocion: p.idPromocion,
    nombre: p.nombre,
    tipo: p.tipo === "NXM" ? "NXM" : "PORCENTAJE",
    valor: p.valor != null ? Number(p.valor) : null,
    llevaN: p.llevaN,
    pagaM: p.pagaM,
    codigoItem: p.codigoItem,
    idCategoria: p.idCategoria,
  }));
}
