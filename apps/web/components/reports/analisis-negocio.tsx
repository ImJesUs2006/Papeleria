"use client";

import { useEffect, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  HandCoins,
  HelpCircle,
  Layers,
  Loader2,
  PackageSearch,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useColoresTema } from "@/hooks/use-colores-tema";
import { DIAS_SEMANA } from "@/lib/analitica";
import { cn } from "@/lib/utils";

// ============================================================
// Análisis del negocio: gráficas con su explicación en lenguaje simple
// ("¿Qué significa?") y una sugerencia de qué hacer. Los números vienen de
// /api/reportes/analisis (lib/analitica).
// ============================================================

interface Analisis {
  dias: number;
  indicadores: {
    actual: { total: number; tickets: number; ticketPromedio: number };
    anterior: { total: number; tickets: number; ticketPromedio: number };
    cambio: { total: number | null; tickets: number | null; ticketPromedio: number | null };
  };
  serie: Array<{ dia: string; total: number; tickets: number; promedio7: number }>;
  mapa: { celdas: number[][]; max: number; picos: Array<{ dia: string; hora: number; total: number }>; desdeHora: number; hastaHora: number };
  abc: {
    filas: Array<{ codigo: string; descripcion: string; venta: number; acumuladoPct: number; clase: "A" | "B" | "C" }>;
    total: number;
    totalProductos: number;
    A: { productos: number; pctProductos: number; pctVenta: number };
  };
  categorias: Array<{ categoria: string; venta: number; margen: number; margenPct: number | null; ventaSinCosto: number }>;
  cobertura: {
    resumen: Record<"AGOTADO" | "CRITICO" | "SANO" | "EXCESO" | "SIN_MOVIMIENTO", number>;
    criticos: Array<{ codigo: string; descripcion: string; stock: number; diasCobertura: number | null; estado: string }>;
    sinMovimiento: Array<{ codigo: string; descripcion: string; stock: number }>;
    exceso: Array<{ codigo: string; descripcion: string; stock: number; diasCobertura: number | null }>;
  };
  cuentas: Array<{ tramo: string; monto: number; cuentas: number }>;
  pagos: Array<{ metodo: string; monto: number; pct: number }>;
}

const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dineroCorto = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(n)}`;
const fechaCorta = (dia: string) => {
  const [, m, d] = dia.split("-");
  return `${Number(d)}/${Number(m)}`;
};
const METODOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  PUNTOS_MONEDERO: "Puntos",
};

function Tarjeta({
  titulo,
  icono: Icono,
  explicacion,
  accion,
  className,
  children,
}: {
  titulo: string;
  icono: typeof TrendingUp;
  explicacion: string;
  accion?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border border-surface-600 bg-surface-800 p-5", className)} data-testid="tarjeta-analisis">
      <div className="mb-3 flex items-center gap-2">
        <Icono className="h-5 w-5 text-acento" />
        <h3 className="font-bold text-gray-100">{titulo}</h3>
      </div>
      {children}
      <details className="group mt-3 rounded-xl bg-surface-700/50 px-3 py-2 text-xs text-muted">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-gray-200">
          <HelpCircle className="h-3.5 w-3.5" /> ¿Qué significa?
        </summary>
        <p className="mt-1.5 leading-relaxed">{explicacion}</p>
      </details>
      {accion && <p className="mt-2 text-xs font-semibold text-emerald-300">👉 {accion}</p>}
    </section>
  );
}

function Cambio({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-[11px] text-muted">sin periodo anterior</span>;
  const sube = valor >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-bold", sube ? "text-emerald-300" : "text-rose-300")}>
      {sube ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(valor)}% vs periodo anterior
    </span>
  );
}

export function AnalisisNegocio() {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const colores = useColoresTema();
  const tooltip = {
    contentStyle: { background: colores.tooltipFondo, border: `1px solid ${colores.tooltipBorde}`, borderRadius: 12, color: colores.texto },
    labelStyle: { color: colores.texto, fontWeight: 700 },
  };

  useEffect(() => {
    let vivo = true;
    setDatos(null);
    setError(null);
    fetch(`/api/reportes/analisis?dias=${dias}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "No se pudo calcular el análisis");
        if (vivo) setDatos(d);
      })
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [dias]);

  const i = datos?.indicadores;
  const sinVentas = datos && datos.indicadores.actual.tickets === 0;
  const horas = datos ? Array.from({ length: datos.mapa.hastaHora - datos.mapa.desdeHora + 1 }, (_, k) => datos.mapa.desdeHora + k) : [];
  const deuda = datos?.cuentas.reduce((s, c) => s + c.monto, 0) ?? 0;
  const vencida = datos?.cuentas.slice(1).reduce((s, c) => s + c.monto, 0) ?? 0;
  const cobertura = datos?.cobertura.resumen;

  return (
    <div className="mb-10 space-y-4" data-testid="analisis-negocio">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-gray-100">Análisis del negocio</h3>
          <p className="text-sm text-muted">Cómo va tu negocio, explicado. Toca «¿Qué significa?» en cada gráfica.</p>
        </div>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Periodo">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={dias === d}
              onClick={() => setDias(d)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-xs font-bold",
                dias === d ? "border-acento bg-acento/10 text-acento" : "border-surface-500 text-muted hover:text-gray-100"
              )}
            >
              Últimos {d} días
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
      {!datos && !error && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
        </p>
      )}

      {datos && i && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ["Ventas", dinero(i.actual.total), i.cambio.total],
              ["Tickets", String(i.actual.tickets), i.cambio.tickets],
              ["Ticket promedio", dinero(i.actual.ticketPromedio), i.cambio.ticketPromedio],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded-2xl border border-surface-600 bg-surface-800 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-gray-100">{v}</p>
                <Cambio valor={c as number | null} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Tarjeta
              titulo="Tendencia de ventas"
              icono={TrendingUp}
              explicacion="El área es lo que vendiste cada día. La línea es el promedio de los últimos 7 días: suaviza los días buenos y malos, así ves si el negocio realmente va al alza o a la baja."
              accion={
                i.cambio.total == null
                  ? null
                  : i.cambio.total < -10
                    ? "Vendiste bastante menos que el periodo anterior: revisa precios, existencias de lo más vendido o promociones."
                    : i.cambio.total > 10
                      ? "Vas al alza: asegura existencias de tus productos clase A para no perder ventas."
                      : "Ventas estables respecto al periodo anterior."
              }
              className="xl:col-span-2"
            >
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={datos.serie} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradTendencia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--marca-color)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--marca-color)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} />
                    <XAxis dataKey="dia" tickFormatter={fechaCorta} tick={{ fill: colores.textoSuave, fontSize: 10 }} minTickGap={16} />
                    <YAxis tickFormatter={dineroCorto} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                    <Tooltip
                      {...tooltip}
                      labelFormatter={(d: any) => fechaCorta(String(d))}
                      formatter={(v: any, n: any) => [dinero(Number(v)), n === "promedio7" ? "Promedio 7 días" : "Vendido"]}
                    />
                    <Area type="monotone" dataKey="total" stroke="var(--marca-color)" fill="url(#gradTendencia)" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="promedio7" stroke={colores.serie[1]} strokeWidth={2.5} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Tarjeta>

            <Tarjeta
              titulo="Días y horas pico"
              icono={Clock}
              explicacion="Cada cuadro es un día de la semana a una hora. Entre más intenso el color, más vendiste en ese momento. Sirve para decidir cuándo reforzar personal o surtir antes de la hora fuerte."
              accion={
                datos.mapa.picos.length
                  ? `Tu momento más fuerte: ${datos.mapa.picos.map((p) => `${p.dia} ${p.hora}:00`).join(", ")}.`
                  : null
              }
            >
              {sinVentas ? (
                <p className="py-6 text-center text-sm text-muted">Sin ventas en el periodo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-separate border-spacing-0.5 text-[10px]">
                    <thead>
                      <tr>
                        <th />
                        {horas.map((h) => (
                          <th key={h} className="font-normal text-muted">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {datos.mapa.celdas.map((fila, d) => (
                        <tr key={d}>
                          <th className="pr-1 text-right font-normal text-muted">{DIAS_SEMANA[d]}</th>
                          {horas.map((h) => {
                            const t = fila[h];
                            const intensidad = datos.mapa.max ? t / datos.mapa.max : 0;
                            return (
                              <td
                                key={h}
                                title={`${DIAS_SEMANA[d]} ${h}:00 · ${dinero(t)}`}
                                className="h-5 min-w-[14px] rounded"
                                style={{
                                  background: t > 0 ? "var(--marca-color)" : "transparent",
                                  opacity: t > 0 ? 0.15 + intensidad * 0.85 : 1,
                                  outline: t > 0 ? undefined : `1px solid ${colores.rejilla}`,
                                }}
                              />
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="¿Cómo te pagan?"
              icono={Wallet}
              explicacion="La proporción de lo cobrado por cada forma de pago. Si mucho entra por tarjeta o transferencia, considera las comisiones de la terminal y que ese dinero no está en la caja."
            >
              {datos.pagos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Sin cobros en el periodo.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-40 w-40 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={datos.pagos} dataKey="monto" nameKey="metodo" innerRadius={40} outerRadius={65} paddingAngle={3}>
                          {datos.pagos.map((_, k) => (
                            <Cell key={k} fill={colores.serie[k % 3]} />
                          ))}
                        </Pie>
                        <Tooltip {...tooltip} formatter={(v: any, n: any) => [dinero(Number(v)), METODOS[n] ?? n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {datos.pagos.map((p, k) => (
                      <li key={p.metodo} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: colores.serie[k % 3] }} />
                        <span className="text-gray-200">{METODOS[p.metodo] ?? p.metodo}</span>
                        <span className="font-bold tabular-nums text-gray-100">{p.pct}%</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="Productos que sostienen tu venta (ABC)"
              icono={Layers}
              explicacion="Ordenamos los productos de más a menos vendido y vamos sumando. Los de clase A son los pocos que juntos hacen el 80% de tu venta (regla de Pareto): son los que nunca deben faltar. La línea muestra el porcentaje acumulado."
              accion={
                datos.abc.A.productos
                  ? `${datos.abc.A.productos} producto(s) (${datos.abc.A.pctProductos}% del catálogo vendido) hacen el ${datos.abc.A.pctVenta}% de tus ventas: vigila su existencia.`
                  : null
              }
              className="xl:col-span-2"
            >
              {datos.abc.filas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Sin ventas en el periodo.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={datos.abc.filas} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} />
                      <XAxis dataKey="codigo" tick={{ fill: colores.textoSuave, fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={45} />
                      <YAxis yAxisId="v" tickFormatter={dineroCorto} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                      <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                      <Tooltip
                        {...tooltip}
                        labelFormatter={(c: any) => datos.abc.filas.find((f) => f.codigo === c)?.descripcion ?? c}
                        formatter={(v: any, n: any) => (n === "acumuladoPct" ? [`${v}%`, "Acumulado"] : [dinero(Number(v)), "Venta"])}
                      />
                      <Bar yAxisId="v" dataKey="venta" radius={[4, 4, 0, 0]}>
                        {datos.abc.filas.map((f) => (
                          <Cell key={f.codigo} fill={f.clase === "A" ? "var(--marca-color)" : f.clase === "B" ? colores.serie[1] : colores.textoSuave} />
                        ))}
                      </Bar>
                      <Line yAxisId="p" type="monotone" dataKey="acumuladoPct" stroke={colores.serie[2]} strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="Margen por categoría"
              icono={HandCoins}
              explicacion="Cuánto te queda de cada peso vendido después de pagar lo que te costó la mercancía, por categoría. Una categoría con mucha venta y poco margen trabaja mucho y deja poco."
              accion={(() => {
                const conMargen = datos.categorias.filter((c) => c.margenPct != null);
                const peor = [...conMargen].sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0))[0];
                return peor && (peor.margenPct ?? 100) < 20 ? `«${peor.categoria}» deja solo ${peor.margenPct}%: revisa sus precios o costos.` : null;
              })()}
            >
              {datos.categorias.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Sin ventas en el periodo.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datos.categorias.filter((c) => c.margenPct != null)} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                      <YAxis type="category" dataKey="categoria" width={90} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                      <Tooltip {...tooltip} formatter={(v: any) => [`${v}%`, "Margen"]} />
                      <Bar dataKey="margenPct" fill="var(--marca-color)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {datos.categorias.some((c) => c.ventaSinCosto > 0) && (
                <p className="mt-1 text-[11px] text-amber-300">
                  Parte de la venta no tiene costo registrado y no entra al cálculo: captura el costo de esos productos.
                </p>
              )}
            </Tarjeta>

            <Tarjeta
              titulo="¿Cuánto te dura la mercancía?"
              icono={PackageSearch}
              explicacion={`Dividimos la existencia entre lo que vendes al día (promedio de los últimos ${datos.dias} días). Crítico: se acaba en menos de 7 días. Exceso: alcanza para más de 90 días (dinero detenido en el estante). Sin movimiento: hay existencia y no se vendió nada.`}
              accion={
                cobertura && cobertura.CRITICO + cobertura.AGOTADO > 0
                  ? `Pide pronto: ${cobertura.CRITICO + cobertura.AGOTADO} producto(s) se acaban en menos de una semana o ya se acabaron.`
                  : cobertura && cobertura.SIN_MOVIMIENTO > 0
                    ? `Tienes ${cobertura.SIN_MOVIMIENTO} producto(s) sin venderse: considera una promoción.`
                    : null
              }
            >
              {cobertura && (
                <div className="mb-3 grid grid-cols-5 gap-1.5 text-center">
                  {(
                    [
                      ["AGOTADO", "Agotados", "text-rose-300"],
                      ["CRITICO", "Críticos", "text-amber-300"],
                      ["SANO", "Sanos", "text-emerald-300"],
                      ["EXCESO", "Exceso", "text-sky-300"],
                      ["SIN_MOVIMIENTO", "Sin venta", "text-muted"],
                    ] as const
                  ).map(([k, etiqueta, tono]) => (
                    <div key={k} className="rounded-xl bg-surface-700/60 px-1 py-2">
                      <p className={cn("text-lg font-black tabular-nums", tono)}>{cobertura[k]}</p>
                      <p className="text-[10px] text-muted">{etiqueta}</p>
                    </div>
                  ))}
                </div>
              )}
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {datos.cobertura.criticos.map((p) => (
                  <li key={p.codigo} className="flex justify-between gap-2">
                    <span className="truncate text-gray-200">{p.descripcion}</span>
                    <span className="shrink-0 font-bold text-amber-300">
                      {p.estado === "AGOTADO" ? "agotado" : `${p.diasCobertura} días`}
                    </span>
                  </li>
                ))}
                {datos.cobertura.sinMovimiento.map((p) => (
                  <li key={p.codigo} className="flex justify-between gap-2">
                    <span className="truncate text-gray-200">{p.descripcion}</span>
                    <span className="shrink-0 text-muted">{p.stock} sin venderse</span>
                  </li>
                ))}
              </ul>
            </Tarjeta>

            <Tarjeta
              titulo="Lo que debes a proveedores"
              icono={CalendarClock}
              explicacion="Las compras a crédito pendientes, agrupadas por cuánto tiempo llevan vencidas. Pagar a tiempo cuida tu crédito con el proveedor."
              accion={vencida > 0 ? `Tienes ${dinero(vencida)} vencidos: revisa Proveedores → Abonos.` : deuda > 0 ? "Todo al corriente." : null}
            >
              {deuda === 0 ? (
                <p className="py-6 text-center text-sm text-muted">No debes nada a proveedores.</p>
              ) : (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={datos.cuentas} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colores.rejilla} />
                      <XAxis dataKey="tramo" tick={{ fill: colores.textoSuave, fontSize: 9 }} />
                      <YAxis tickFormatter={dineroCorto} tick={{ fill: colores.textoSuave, fontSize: 10 }} />
                      <Tooltip {...tooltip} formatter={(v: any) => [dinero(Number(v)), "Saldo"]} />
                      <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                        {datos.cuentas.map((c, k) => (
                          <Cell key={c.tramo} fill={k === 0 ? colores.serie[1] : k === 1 ? "#f59e0b" : "#f43f5e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Tarjeta>
          </div>
        </>
      )}
    </div>
  );
}
