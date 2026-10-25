// ============================================================
// Análisis del negocio (Fase F) — cálculos puros y probados.
//
// Cada función recibe datos ya consultados y devuelve números listos para
// graficar. Las explicaciones para el usuario viven junto a cada gráfica;
// aquí solo hay aritmética: tendencia con promedio móvil, comparación con el
// periodo anterior, horas pico, análisis ABC (Pareto), margen por categoría,
// días de inventario y antigüedad de lo que se debe a proveedores.
// ============================================================

const DIA = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** "2026-10-23" en hora LOCAL (el día del negocio, no el de UTC). */
export function claveDia(f: Date): string {
  const m = String(f.getMonth() + 1).padStart(2, "0");
  const d = String(f.getDate()).padStart(2, "0");
  return `${f.getFullYear()}-${m}-${d}`;
}

export interface VentaResumen {
  fecha: Date;
  total: number;
}

export interface PuntoSerie {
  dia: string;
  total: number;
  tickets: number;
  /** Promedio de los últimos 7 días (incluido este); suaviza los picos. */
  promedio7: number;
}

/** Ventas por día del periodo (los días sin ventas cuentan como 0). */
export function serieDiaria(ventas: VentaResumen[], desde: Date, dias: number): PuntoSerie[] {
  const inicio = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const base = new Map<string, { total: number; tickets: number }>();
  for (let i = 0; i < dias; i++) base.set(claveDia(new Date(inicio.getTime() + i * DIA + 2 * 3_600_000)), { total: 0, tickets: 0 });
  for (const v of ventas) {
    const k = claveDia(v.fecha);
    const p = base.get(k);
    if (p) {
      p.total += v.total;
      p.tickets += 1;
    }
  }
  const lista = [...base.entries()].map(([dia, p]) => ({ dia, total: r2(p.total), tickets: p.tickets, promedio7: 0 }));
  lista.forEach((p, i) => {
    const ventana = lista.slice(Math.max(0, i - 6), i + 1);
    p.promedio7 = r2(ventana.reduce((s, x) => s + x.total, 0) / ventana.length);
  });
  return lista;
}

/** Cambio porcentual contra el periodo anterior (null si antes no hubo nada). */
export function variacion(actual: number, anterior: number): number | null {
  if (!Number.isFinite(anterior) || anterior === 0) return null;
  return r1(((actual - anterior) / anterior) * 100);
}

export interface Indicadores {
  total: number;
  tickets: number;
  ticketPromedio: number;
}

export function indicadores(ventas: VentaResumen[]): Indicadores {
  const total = r2(ventas.reduce((s, v) => s + v.total, 0));
  return { total, tickets: ventas.length, ticketPromedio: ventas.length ? r2(total / ventas.length) : 0 };
}

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Ventas por día de la semana × hora. `celdas[d][h]` con d=0 lunes. */
export function mapaCalor(ventas: VentaResumen[]) {
  const celdas = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const v of ventas) {
    const d = (v.fecha.getDay() + 6) % 7;
    celdas[d][v.fecha.getHours()] += v.total;
  }
  const max = Math.max(0, ...celdas.flat());
  const picos = celdas
    .flatMap((fila, d) => fila.map((total, h) => ({ dia: DIAS_SEMANA[d], hora: h, total: r2(total) })))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
  // Rango de horas con actividad, para no dibujar la madrugada vacía.
  const horasConVenta = celdas.reduce<number[]>((acc, fila) => {
    fila.forEach((t, h) => t > 0 && acc.push(h));
    return acc;
  }, []);
  const desdeHora = horasConVenta.length ? Math.min(...horasConVenta) : 8;
  const hastaHora = horasConVenta.length ? Math.max(...horasConVenta) : 20;
  return { celdas: celdas.map((f) => f.map(r2)), max: r2(max), picos, desdeHora, hastaHora };
}

export interface ProductoVenta {
  codigo: string;
  descripcion: string;
  venta: number;
}

export type ClaseABC = "A" | "B" | "C";

/**
 * Análisis ABC (Pareto): ordena por venta y acumula. Clase A = los que juntos
 * hacen el primer 80% de la venta; B = hasta el 95%; C = el resto.
 */
export function clasificacionABC(productos: ProductoVenta[]) {
  const orden = productos.filter((p) => p.venta > 0).sort((a, b) => b.venta - a.venta);
  const total = orden.reduce((s, p) => s + p.venta, 0);
  let acumulado = 0;
  const filas = orden.map((p) => {
    const antes = total ? acumulado / total : 0;
    acumulado += p.venta;
    const clase: ClaseABC = antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C";
    return { ...p, venta: r2(p.venta), acumuladoPct: total ? r1((acumulado / total) * 100) : 0, clase };
  });
  const resumen = (c: ClaseABC) => {
    const de = filas.filter((f) => f.clase === c);
    return {
      productos: de.length,
      pctProductos: filas.length ? r1((de.length / filas.length) * 100) : 0,
      pctVenta: total ? r1((de.reduce((s, f) => s + f.venta, 0) / total) * 100) : 0,
    };
  };
  return { filas, total: r2(total), A: resumen("A"), B: resumen("B"), C: resumen("C") };
}

export interface LineaCategoria {
  categoria: string | null;
  venta: number;
  /** null = se vendió sin costo registrado. */
  costo: number | null;
}

/** Venta, costo y margen por categoría (lo vendido sin costo no inventa margen). */
export function margenPorCategoria(lineas: LineaCategoria[]) {
  const agg = new Map<string, { venta: number; costo: number; ventaConCosto: number; sinCosto: number }>();
  for (const l of lineas) {
    const k = l.categoria || "Sin categoría";
    const a = agg.get(k) ?? { venta: 0, costo: 0, ventaConCosto: 0, sinCosto: 0 };
    a.venta += l.venta;
    if (l.costo == null) a.sinCosto += l.venta;
    else {
      a.costo += l.costo;
      a.ventaConCosto += l.venta;
    }
    agg.set(k, a);
  }
  return [...agg.entries()]
    .map(([categoria, a]) => ({
      categoria,
      venta: r2(a.venta),
      margen: r2(a.ventaConCosto - a.costo),
      margenPct: a.ventaConCosto > 0 ? r1(((a.ventaConCosto - a.costo) / a.ventaConCosto) * 100) : null,
      ventaSinCosto: r2(a.sinCosto),
    }))
    .sort((a, b) => b.venta - a.venta);
}

export interface ProductoExistencia {
  codigo: string;
  descripcion: string;
  stock: number;
  /** Unidades vendidas en el periodo analizado. */
  vendido: number;
}

export type EstadoCobertura = "AGOTADO" | "CRITICO" | "SANO" | "EXCESO" | "SIN_MOVIMIENTO";

/**
 * Días de inventario: cuántos días alcanza la existencia al ritmo de venta
 * del periodo. Crítico < 7 días; exceso > 90; sin movimiento = hay
 * existencia y no se vendió nada.
 */
export function coberturaInventario(productos: ProductoExistencia[], diasPeriodo: number) {
  const filas = productos.map((p) => {
    const diario = diasPeriodo > 0 ? p.vendido / diasPeriodo : 0;
    const dias = diario > 0 ? Math.floor(p.stock / diario) : null;
    const estado: EstadoCobertura =
      p.stock <= 0
        ? p.vendido > 0
          ? "AGOTADO"
          : "SIN_MOVIMIENTO"
        : diario === 0
          ? "SIN_MOVIMIENTO"
          : (dias ?? 0) < 7
            ? "CRITICO"
            : (dias ?? 0) > 90
              ? "EXCESO"
              : "SANO";
    return { ...p, diasCobertura: dias, estado };
  });
  const cuenta = (e: EstadoCobertura) => filas.filter((f) => f.estado === e).length;
  return {
    filas,
    resumen: {
      AGOTADO: cuenta("AGOTADO"),
      CRITICO: cuenta("CRITICO"),
      SANO: cuenta("SANO"),
      EXCESO: cuenta("EXCESO"),
      SIN_MOVIMIENTO: filas.filter((f) => f.estado === "SIN_MOVIMIENTO" && f.stock > 0).length,
    },
  };
}

export interface CuentaResumen {
  saldo: number;
  vence: Date;
}

/** Lo que se debe a proveedores por antigüedad del vencimiento. */
export function antiguedadCuentas(cuentas: CuentaResumen[], hoy = new Date()) {
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  const tramos = [
    { tramo: "Por vencer", min: -Infinity, max: 0 },
    { tramo: "1–30 días vencido", min: 1, max: 30 },
    { tramo: "31–60 días vencido", min: 31, max: 60 },
    { tramo: "Más de 60 días", min: 61, max: Infinity },
  ].map((t) => ({ ...t, monto: 0, cuentas: 0 }));
  for (const c of cuentas) {
    const vence = new Date(c.vence.getFullYear(), c.vence.getMonth(), c.vence.getDate()).getTime();
    const atraso = Math.floor((inicio - vence) / DIA);
    const t = tramos.find((x) => atraso >= x.min && atraso <= x.max) ?? tramos[0];
    t.monto += c.saldo;
    t.cuentas += 1;
  }
  return tramos.map(({ tramo, monto, cuentas: n }) => ({ tramo, monto: r2(monto), cuentas: n }));
}

/** Participación de cada método de pago en el total cobrado. */
export function mezclaPagos(pagos: Array<{ metodo: string; monto: number }>) {
  const agg = new Map<string, number>();
  for (const p of pagos) agg.set(p.metodo, (agg.get(p.metodo) ?? 0) + p.monto);
  const total = [...agg.values()].reduce((s, n) => s + n, 0);
  return [...agg.entries()]
    .map(([metodo, monto]) => ({ metodo, monto: r2(monto), pct: total ? r1((monto / total) * 100) : 0 }))
    .sort((a, b) => b.monto - a.monto);
}
