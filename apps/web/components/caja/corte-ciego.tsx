"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  X,
  Banknote,
  Receipt,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  EyeOff,
  Eye,
  Coins,
  Calculator,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/store/config";
import { imprimirTicket, type AnchoTicketImpresion } from "@/lib/print-ticket";
import {
  DENOMINACIONES_MXN,
  explicarDiferencia,
  totalConteo,
  type ConteoDenominaciones,
} from "@/lib/denominaciones";

// ============================================================
// CORTE DE CAJA
// 1) Inicia: ABIERTA → EN_CIERRE (el servidor bloquea ventas).
// 2) Conteo: billetes y monedas (el total se suma solo), vouchers y
//    recargas. En corte ciego NUNCA se muestran los esperados; con
//    "corte con referencia" (Configuración) se ven mientras se cuenta.
// 3) Conclusión: el servidor calcula y audita el descuadre.
// Si se recarga la app a mitad, el corte EN_CIERRE se reanuda solo.
// ============================================================

interface Props {
  onCerrada: () => void;
  onCancelar: () => void;
}

type Fase = "iniciando" | "conteo" | "concluyendo" | "resultado" | "error";

interface Referencia {
  esperadoEfectivo: number;
  esperadoDigital: number;
  esperadoRecargas: number;
}

interface ArqueoResultado {
  esperadoEfectivo: number;
  esperadoDigital: number;
  esperadoRecargas: number;
  declaradoEfectivo: number;
  declaradoDigital: number;
  declaradoRecargas: number;
  faltanteEfectivo: number;
  faltanteDigital: number;
  faltanteRecargas: number;
  totalEsperado: number;
  totalDeclarado: number;
  diferenciaTotal: number;
  descuadre: boolean;
}

const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

export function CorteCiego({ onCerrada, onCancelar }: Props) {
  const configCaja = useConfigStore((s) => ({
    anchoTicket: s.config?.anchoTicket ?? "80mm",
    mensajeTicket: s.config?.mensajeTicket ?? null,
    recargas: s.config?.featureFlags?.recargas ?? false,
    imprimirAuto: s.config?.imprimirCorteAuto === true,
  }));
  const imprimir = () => imprimirTicket(areaImpresion.current, configCaja.anchoTicket as AnchoTicketImpresion);
  const areaImpresion = useRef<HTMLDivElement>(null);
  const [fase, setFase] = useState<Fase>("iniciando");
  const [token, setToken] = useState<string | null>(null);
  const [horaInicio, setHoraInicio] = useState<string | null>(null);
  const [referencia, setReferencia] = useState<Referencia | null>(null);
  const [modoEfectivo, setModoEfectivo] = useState<"piezas" | "total">("piezas");
  const [piezas, setPiezas] = useState<Record<string, string>>({});
  const [efectivoTotal, setEfectivoTotal] = useState("");
  const [vouchers, setVouchers] = useState("");
  const [recargas, setRecargas] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ArqueoResultado | null>(null);

  const conteo = useMemo<ConteoDenominaciones>(() => {
    const c: ConteoDenominaciones = {};
    for (const [k, v] of Object.entries(piezas)) {
      const n = Number(v);
      if (v.trim() !== "" && Number.isInteger(n) && n > 0) c[k] = n;
    }
    return c;
  }, [piezas]);
  const piezasInvalidas = Object.values(piezas).some(
    (v) => v.trim() !== "" && !(Number.isInteger(Number(v)) && Number(v) >= 0)
  );
  const efectivo = modoEfectivo === "piezas" ? totalConteo(conteo) : num(efectivoTotal);
  const montosValidos =
    !piezasInvalidas &&
    [modoEfectivo === "total" ? efectivoTotal : "0", vouchers, recargas].every(
      (v) => v.trim() === "" || (Number.isFinite(Number(v)) && Number(v) >= 0)
    );
  const algoCapturado =
    efectivo > 0 || vouchers.trim() !== "" || recargas.trim() !== "" || Object.keys(piezas).length > 0 || efectivoTotal !== "";

  const aplicarEstado = (data: any) => {
    setToken(data.cierreToken);
    setHoraInicio(data.horaInicio);
    setReferencia(data.referencia ?? null);
    setFase("conteo");
  };

  useEffect(() => {
    // Reanuda un corte a medias (recarga o cierre de la app a mitad).
    (async () => {
      try {
        const res = await fetch("/api/caja/cerrar/iniciar", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.activo) aplicarEstado(data);
        }
      } catch {
        /* sin red: se mantiene la fase */
      }
    })();
  }, []);

  const iniciarCorte = async () => {
    setError(null);
    try {
      const res = await fetch("/api/caja/cerrar/iniciar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          const estado = await fetch("/api/caja/cerrar/iniciar", { cache: "no-store" }).then((r) => r.json());
          if (estado.activo) return aplicarEstado(estado);
        }
        throw new Error(data.error || "No se pudo iniciar el corte");
      }
      aplicarEstado(data);
    } catch (e: any) {
      setError(e.message);
      setFase("error");
    }
  };

  const concluir = async () => {
    if (!montosValidos) {
      setError("Revisa los montos: solo números positivos y piezas enteras");
      return;
    }
    setFase("concluyendo");
    setError(null);
    try {
      const res = await fetch("/api/caja/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cierreToken: token,
          efectivoContado: efectivo,
          ...(modoEfectivo === "piezas" ? { conteoDenominaciones: conteo } : {}),
          vouchersContado: num(vouchers),
          recargasContado: num(recargas),
          notas: notas.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cerrar");
      setResultado(data.arqueo);
      setFase("resultado");
      // Por defecto el resultado solo se muestra; se imprime si el negocio lo pidió.
      if (configCaja.imprimirAuto) {
        requestAnimationFrame(() => {
          setTimeout(imprimir, 80);
        });
      }
    } catch (err: any) {
      setError(err.message);
      setFase("error");
    }
  };

  const ancho = fase === "conteo" || fase === "concluyendo" ? "max-w-5xl" : "max-w-lg";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <motion.div
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 16 }}
        className={cn("flex max-h-[94vh] w-full flex-col rounded-3xl border border-surface-600 bg-surface-800", ancho)}
      >
        <div className="flex items-center justify-between gap-3 border-b border-surface-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/10">
              <Lock className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <h3 className="font-black text-gray-100">Corte de caja</h3>
              <p className="text-xs text-muted">
                {referencia ? "Con referencia: ves lo esperado mientras cuentas" : "Corte ciego: lo esperado se revela al terminar"}
              </p>
            </div>
          </div>
          {fase !== "concluyendo" && fase !== "resultado" && (
            <button
              onClick={onCancelar}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-700 text-muted transition-colors hover:bg-surface-600 hover:text-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto p-6">
          {/* FASE INICIAR */}
          {fase === "iniciando" && (
            <div className="space-y-5">
              <ol className="space-y-2 text-sm text-gray-200">
                {[
                  "Al iniciar, la caja deja de vender hasta terminar el corte.",
                  "Cuenta los billetes y monedas: escribe cuántos hay de cada uno y el total se suma solo.",
                  "Suma los vouchers de la terminal y las transferencias del día.",
                  "Al confirmar verás si la caja cuadra y se imprime el ticket del corte.",
                ].map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-600 text-xs font-black">
                      {i + 1}
                    </span>
                    {t}
                  </li>
                ))}
              </ol>
              <p className="text-xs leading-relaxed text-muted">
                Si cierras la aplicación a mitad del conteo, el corte queda en progreso y al volver continúas donde
                te quedaste.
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={iniciarCorte}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-3.5 font-bold text-white hover:bg-rose-500"
              >
                <Lock className="h-4 w-4" /> Iniciar corte
              </motion.button>
            </div>
          )}

          {/* FASE CONTEO */}
          {(fase === "conteo" || fase === "concluyendo") && (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="space-y-5">
                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-black text-gray-100">
                      <Banknote className="h-4 w-4 text-acento" /> Efectivo
                    </h4>
                    <div className="flex rounded-lg border border-surface-600 p-0.5 text-xs">
                      {(["piezas", "total"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setModoEfectivo(m)}
                          className={cn(
                            "rounded-md px-2.5 py-1 font-bold",
                            modoEfectivo === m ? "bg-surface-600 text-gray-100" : "text-muted"
                          )}
                        >
                          {m === "piezas" ? "Billetes y monedas" : "Total directo"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {modoEfectivo === "piezas" ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                      {DENOMINACIONES_MXN.map((d) => {
                        const v = piezas[d.clave] ?? "";
                        const n = Number(v);
                        const invalido = v.trim() !== "" && !(Number.isInteger(n) && n >= 0);
                        return (
                          <label key={d.clave} className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex w-16 shrink-0 items-center gap-1 text-xs font-bold",
                                d.tipo === "billete" ? "text-gray-100" : "text-muted"
                              )}
                              title={d.tipo === "billete" ? "Billete" : "Moneda"}
                            >
                              {d.tipo === "billete" ? <Banknote className="h-3 w-3" /> : <Coins className="h-3 w-3" />}
                              {d.etiqueta}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={v}
                              onChange={(e) => setPiezas({ ...piezas, [d.clave]: e.target.value })}
                              placeholder="0"
                              aria-label={`${d.tipo === "billete" ? "Billetes" : "Monedas"} de ${d.etiqueta}`}
                              className={cn(
                                "w-full rounded-lg border bg-surface-700 px-2 py-1.5 text-right text-sm font-bold tabular-nums text-gray-100 focus:outline-none",
                                invalido ? "border-rose-500" : "border-surface-500 focus:border-acento"
                              )}
                            />
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={efectivoTotal}
                      onChange={(e) => setEfectivoTotal(e.target.value)}
                      placeholder="Ej. 1250.50"
                      aria-label="Efectivo contado"
                      className="w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-3 text-lg font-bold text-gray-100 focus:border-acento focus:outline-none"
                    />
                  )}
                  <div className="mt-2 flex items-baseline justify-between rounded-xl bg-acento/10 px-4 py-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-acento">Efectivo contado</span>
                    <span className="text-2xl font-black tabular-nums text-acento" data-testid="efectivo-contado">
                      {dinero(efectivo)}
                    </span>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <CampoMonto
                    icon={<Receipt className="h-4 w-4 text-sky-400" />}
                    label="Vouchers de terminal y transferencias"
                    value={vouchers}
                    onChange={setVouchers}
                    placeholder="Ej. 340.00"
                  />
                  {configCaja.recargas && (
                    <CampoMonto
                      icon={<Smartphone className="h-4 w-4 text-indigo-400" />}
                      label="Recargas vendidas"
                      value={recargas}
                      onChange={setRecargas}
                      placeholder="Ej. 100.00"
                    />
                  )}
                </section>

                <input
                  value={notas}
                  maxLength={300}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas del corte (opcional)"
                  className="w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-2.5 text-sm text-gray-100 transition-all focus:border-acento focus:outline-none"
                />
              </div>

              {/* Columna derecha: referencia o explicación del corte ciego */}
              <aside className="space-y-4">
                {referencia ? (
                  <div className="rounded-2xl border border-surface-600 p-4">
                    <p className="mb-3 flex items-center gap-2 text-sm font-black text-gray-100">
                      <Eye className="h-4 w-4 text-sky-300" /> Lo que espera el sistema
                    </p>
                    {[
                      { r: "Efectivo", esperado: referencia.esperadoEfectivo, contado: efectivo },
                      { r: "Vouchers", esperado: referencia.esperadoDigital, contado: num(vouchers) },
                      ...(configCaja.recargas
                        ? [{ r: "Recargas", esperado: referencia.esperadoRecargas, contado: num(recargas) }]
                        : []),
                    ].map((x) => {
                      const d = explicarDiferencia(x.esperado - x.contado, x.r);
                      return (
                        <div key={x.r} className="mb-2 rounded-xl bg-surface-700/60 px-3 py-2">
                          <div className="flex justify-between text-xs text-muted">
                            <span>{x.r} esperado</span>
                            <span className="font-bold tabular-nums text-gray-100">{dinero(x.esperado)}</span>
                          </div>
                          <p
                            className={cn(
                              "mt-0.5 text-xs font-bold",
                              d.tono === "ok" ? "text-emerald-300" : d.tono === "falta" ? "text-rose-300" : "text-amber-300"
                            )}
                          >
                            {d.texto}
                          </p>
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-muted">El efectivo esperado ya incluye el fondo inicial y descuenta retiros y reembolsos.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-gray-200">
                    <p className="mb-1 flex items-center gap-2 font-bold">
                      <EyeOff className="h-4 w-4 text-warning" /> Corte ciego
                    </p>
                    <p className="text-xs leading-relaxed text-muted">
                      No ves lo esperado para que cuentes sin influencias. Cuenta el <b>fondo inicial incluido</b>: el
                      sistema ya lo considera. Al confirmar te decimos si sobra o falta y en qué rubro.
                    </p>
                  </div>
                )}

                <div className="rounded-2xl border border-surface-600 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-black text-gray-100">
                    <Calculator className="h-4 w-4 text-acento" /> Tu conteo
                  </p>
                  <Fila etiqueta="Efectivo" valor={dinero(efectivo)} />
                  <Fila etiqueta="Vouchers" valor={dinero(num(vouchers))} />
                  {configCaja.recargas && <Fila etiqueta="Recargas" valor={dinero(num(recargas))} />}
                  <div className="mt-2 flex justify-between border-t border-surface-600 pt-2 text-sm font-black text-gray-100">
                    <span>Total</span>
                    <span className="tabular-nums">{dinero(efectivo + num(vouchers) + num(recargas))}</span>
                  </div>
                </div>

                {horaInicio && (
                  <p className="text-xs text-muted">
                    Corte iniciado a las {new Date(horaInicio).toLocaleTimeString("es-MX")}. Las ventas están en pausa.
                  </p>
                )}
                {error && <p className="text-xs font-bold text-rose-300">{error}</p>}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={concluir}
                  disabled={!algoCapturado || !montosValidos || fase === "concluyendo"}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-bold transition-all",
                    algoCapturado && montosValidos ? "bg-acento text-btn-ink shadow-card" : "cursor-not-allowed bg-surface-600 text-muted"
                  )}
                >
                  {fase === "concluyendo" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
                    </>
                  ) : (
                    "Confirmar conteo y cerrar caja"
                  )}
                </motion.button>
              </aside>
            </div>
          )}

          {/* FASE RESULTADO */}
          {fase === "resultado" && resultado && (
            <div
              ref={areaImpresion}
              className={cn("print-label-area space-y-4", configCaja.anchoTicket === "58mm" ? "print-ticket-57" : "print-ticket-80")}
            >
              <div
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-4",
                  resultado.descuadre ? "border-rose-500/40 bg-rose-500/10" : "border-acento/40 bg-acento/10"
                )}
              >
                {resultado.descuadre ? (
                  <AlertTriangle className="h-8 w-8 shrink-0 text-rose-400" />
                ) : (
                  <CheckCircle2 className="h-8 w-8 shrink-0 text-acento" />
                )}
                <div>
                  <p className="font-black text-gray-100">{resultado.descuadre ? "La caja no cuadra" : "Caja cuadrada"}</p>
                  <p className="text-xs text-muted">
                    {resultado.diferenciaTotal > 0
                      ? `Faltan ${dinero(resultado.diferenciaTotal)} en total`
                      : resultado.diferenciaTotal < 0
                        ? `Sobran ${dinero(Math.abs(resultado.diferenciaTotal))} en total`
                        : "Sin diferencia"}
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5">
                {[
                  explicarDiferencia(resultado.faltanteEfectivo, "Efectivo"),
                  explicarDiferencia(resultado.faltanteDigital, "Vouchers"),
                  explicarDiferencia(resultado.faltanteRecargas, "Recargas"),
                ].map((d) => (
                  <li
                    key={d.texto}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-bold",
                      d.tono === "ok" ? "bg-emerald-500/10 text-emerald-300" : d.tono === "falta" ? "bg-rose-500/10 text-rose-300" : "bg-amber-500/10 text-amber-300"
                    )}
                  >
                    {d.texto}
                  </li>
                ))}
              </ul>

              <div className="print-resumen space-y-1.5 text-sm">
                <Fila etiqueta="Efectivo esperado" valor={dinero(resultado.esperadoEfectivo)} />
                <Fila etiqueta="Efectivo contado" valor={dinero(resultado.declaradoEfectivo)} />
                <Fila etiqueta="Vouchers esperados" valor={dinero(resultado.esperadoDigital)} />
                <Fila etiqueta="Vouchers contados" valor={dinero(resultado.declaradoDigital)} />
                <Fila etiqueta="Recargas esperadas" valor={dinero(resultado.esperadoRecargas)} />
                <Fila etiqueta="Recargas contadas" valor={dinero(resultado.declaradoRecargas)} />
              </div>

              <div className="print-hint flex gap-2">
                <button
                  type="button"
                  onClick={imprimir}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-surface-500 px-4 py-3.5 text-sm font-bold text-gray-200 hover:bg-surface-700"
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onCerrada}
                  className="flex-1 rounded-2xl bg-acento py-3.5 font-bold text-btn-ink shadow-card"
                >
                  Terminar
                </motion.button>
              </div>
              <p className="print-hint text-center text-[10px] text-muted">
                (El reporte detallado queda en Reportes → Cierre de Caja)
              </p>
              {configCaja.mensajeTicket && (
                <p className="print-label-area text-center font-mono text-[10px]">{configCaja.mensajeTicket}</p>
              )}
            </div>
          )}

          {/* FASE ERROR */}
          {fase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                <p className="text-sm text-gray-100">{error}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFase(token ? "conteo" : "iniciando")}
                  className="rounded-xl border border-surface-500 py-3 text-muted transition-colors hover:text-gray-100"
                >
                  Reintentar
                </button>
                <button onClick={onCancelar} className="rounded-xl bg-surface-600 py-3 font-bold text-gray-200 transition-colors">
                  Salir
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CampoMonto({
  icon,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs text-muted">
        {icon} {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-3 text-lg font-bold text-gray-100 transition-all focus:border-acento focus:outline-none"
      />
    </label>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{etiqueta}</span>
      <span className="font-semibold tabular-nums text-gray-100">{valor}</span>
    </div>
  );
}
