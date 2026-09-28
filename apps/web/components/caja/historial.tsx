"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  Printer,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Ban,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { useConfigStore } from "@/store/config";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

interface ArqueoHistorial {
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

interface SesionHistorial {
  idCaja: string;
  folioCaja: string;
  horaApertura: string;
  horaCierre: string;
  cajero: string;
  fondoInicial: number;
  retirosEfectivo: number;
  retiros: Array<{ monto: number; motivo: string; fechaHora: string }>;
  estado: "CERRADA" | "ANULADA";
  anulada: boolean;
  motivoAnulacion: string | null;
  descuadre: boolean;
  notasCierre: string | null;
  arqueo: ArqueoHistorial;
}

function FilaTicket({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-bold whitespace-nowrap">{valor}</span>
    </div>
  );
}

/** Ticket térmico reutilizable para reimpresión de cortes cerrados. */
function TicketCorte({
  sesion,
  negocio,
  anchoTicket,
  mensajeTicket,
}: {
  sesion: SesionHistorial;
  negocio: string;
  anchoTicket: string;
  mensajeTicket: string | null;
}) {
  const a = sesion.arqueo;
  return (
    <div
      className={cn(
        "print-label-area space-y-1.5 text-[11px] font-mono",
        anchoTicket === "58mm" ? "print-ticket-57" : "print-ticket-80"
      )}
    >
      <div className="text-center">
        <p className="text-sm font-black">{negocio}</p>
        <p className="text-[10px]">CORTE DE CAJA</p>
        <p className="text-[10px]">{sesion.idCaja}</p>
      </div>
      <div className="border-t border-black pt-1.5 space-y-0.5">
        <FilaTicket label="Cajera" valor={sesion.cajero} />
        <FilaTicket
          label="Apertura"
          valor={new Date(sesion.horaApertura).toLocaleString("es-MX")}
        />
        <FilaTicket
          label="Cierre"
          valor={new Date(sesion.horaCierre).toLocaleString("es-MX")}
        />
        <FilaTicket label="Fondo inicial" valor={`$${sesion.fondoInicial.toFixed(2)}`} />
        {sesion.retiros?.map((r, i) => (
          <FilaTicket
            key={i}
            label={`Retiro ${i + 1} (${new Date(r.fechaHora).toLocaleTimeString("es-MX")})`}
            valor={`-$${r.monto.toFixed(2)}`}
          />
        ))}
      </div>
      <div className="border-t border-black pt-1.5 space-y-0.5">
        <FilaTicket label="Efectivo esperado" valor={`$${a.esperadoEfectivo.toFixed(2)}`} />
        <FilaTicket label="Efectivo contado" valor={`$${a.declaradoEfectivo.toFixed(2)}`} />
        <FilaTicket label="Vouchers esperados" valor={`$${a.esperadoDigital.toFixed(2)}`} />
        <FilaTicket label="Vouchers contados" valor={`$${a.declaradoDigital.toFixed(2)}`} />
        <FilaTicket label="Recargas esperadas" valor={`$${a.esperadoRecargas.toFixed(2)}`} />
        <FilaTicket label="Recargas contadas" valor={`$${a.declaradoRecargas.toFixed(2)}`} />
        <div className="border-t border-black pt-1 mt-1 text-sm flex justify-between gap-3">
          <span className="font-black">Diferencia</span>
          <span className="font-black">${a.diferenciaTotal.toFixed(2)}</span>
        </div>
        <p className="text-center pt-1 font-black">
          {sesion.descuadre ? "DESCUADRE DETECTADO" : "CAJA CUADRADA"}
        </p>
      </div>
      <p className="text-center text-[9px] pt-1">
        Generado por Papelería SaaS · {new Date().toLocaleString("es-MX")}
      </p>
      {mensajeTicket && (
        <p className="text-center text-[10px] pt-1 font-bold border-t border-black">
          {mensajeTicket}
        </p>
      )}
    </div>
  );
}

export function HistorialCaja() {
  const [sesiones, setSesiones] = useState<SesionHistorial[] | null>(null);
  const [error, setError] = useState("");
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);
  const [ticketParaImprimir, setTicketParaImprimir] = useState<SesionHistorial | null>(null);
  const [anularObjetivo, setAnularObjetivo] = useState<SesionHistorial | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [anulacionHecha, setAnulacionHecha] = useState(false);
  const negocio = useConfigStore((s) => s.config?.nombreNegocio ?? "Mi Negocio");
  const rol = useAuthStore((s) => s.rol);
  const esAdmin = rol === "ADMINISTRADORA";
  const configCaja = useConfigStore((s) => ({
    anchoTicket: s.config?.anchoTicket ?? "80mm",
    mensajeTicket: s.config?.mensajeTicket ?? null,
  }));

  const cargar = async () => {
    try {
      const res = await fetch("/api/caja/historial", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar el historial");
      setSesiones(data.historial);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const reimprimir = (s: SesionHistorial) => {
    setImprimiendo(s.idCaja);
    setTicketParaImprimir(s);
    // La impresión se dispara tras pintar el área imprimible.
    setTimeout(() => {
      window.print();
      setImprimiendo(null);
      setTimeout(() => setTicketParaImprimir(null), 300);
    }, 120);
  };

  const ejecutarAnulacion = async () => {
    if (!anularObjetivo || motivoAnulacion.trim().length < 4) return;
    setAnulando(true);
    setError("");
    try {
      const res = await fetch("/api/caja/anular", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idCaja: anularObjetivo.idCaja, motivo: motivoAnulacion.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo anular la sesión");
      setAnulacionHecha(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnulando(false);
    }
  };

  const cerrarAnulacion = async () => {
    setAnularObjetivo(null);
    setMotivoAnulacion("");
    setAnulacionHecha(false);
    await cargar();
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
          <AlertTriangle className="h-4 w-4 text-neon-red" /> {error}
        </div>
      )}

      {!sesiones && !error && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando historial...
        </div>
      )}

      {sesiones && sesiones.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
          <History className="h-10 w-10 opacity-40" />
          <p className="text-sm">Aún no hay cortes de caja cerrados</p>
        </div>
      )}

      {sesiones?.map((s, i) => {
        const a = s.arqueo;
        return (
          <motion.div
            key={s.idCaja}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={cn(
              "bg-surface-800 border rounded-2xl p-5",
              s.descuadre ? "border-neon-red/40" : "border-surface-600"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    s.anulada ? "bg-neon-red" : s.descuadre ? "bg-neon-red animate-pulse" : "bg-acento"
                  )}
                />
                <div>
                  <p className="text-sm font-bold text-gray-100 flex items-center gap-2">
                    {s.anulada && (
                      <span className="inline-flex items-center gap-1 bg-neon-red/10 border border-neon-red/40 text-neon-red text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                        <Ban className="h-3 w-3" /> Anulada
                      </span>
                    )}
                    {s.anulada ? "Sesión anulada (ingresos descartados)" : s.descuadre ? "Corte con descuadre" : "Corte cuadrada"}
                  </p>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {s.folioCaja} · {new Date(s.horaCierre).toLocaleString("es-MX")} ·{" "}
                    <User className="h-3 w-3" /> {s.cajero}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-sm font-black",
                    s.anulada ? "text-neon-red" : s.descuadre ? "text-neon-red" : "text-acento"
                  )}
                >
                  {s.anulada
                    ? "—"
                    : s.descuadre
                      ? `${a.diferenciaTotal > 0 ? "Faltante" : "Sobrante"} $${Math.abs(a.diferenciaTotal).toFixed(2)}`
                      : "Cuadrada"}
                </span>
                <button
                  onClick={() => reimprimir(s)}
                  disabled={imprimiendo === s.idCaja}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs font-bold text-gray-100 transition-colors"
                >
                  {imprimiendo === s.idCaja ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Printer className="h-3.5 w-3.5" />
                  )}
                  Reimprimir
                </button>
                {esAdmin && !s.anulada && (
                  <button
                    onClick={() => {
                      setAnularObjetivo(s);
                      setAnulacionHecha(false);
                      setMotivoAnulacion("");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neon-red/10 border border-neon-red/40 hover:bg-neon-red/20 text-neon-red text-xs font-bold transition-colors"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Anular
                  </button>
                )}
              </div>
            </div>

            {s.anulada && s.motivoAnulacion && (
              <p className="mt-3 text-[11px] text-neon-red flex items-center gap-1.5 bg-neon-red/5 border border-neon-red/20 rounded-lg px-3 py-2">
                <ShieldCheck className="h-3 w-3 shrink-0" />
                Motivo de anulación: {s.motivoAnulacion}
              </p>
            )}

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-surface-700 border border-surface-600 rounded-lg p-3">
                <p className="text-muted mb-1">Efectivo</p>
                <p
                  className={cn(
                    "font-bold",
                    a.faltanteEfectivo !== 0 ? "text-neon-red" : "text-gray-100"
                  )}
                >
                  ${a.declaradoEfectivo.toFixed(2)}
                </p>
                <p className="text-muted">esperado ${a.esperadoEfectivo.toFixed(2)}</p>
              </div>
              <div className="bg-surface-700 border border-surface-600 rounded-lg p-3">
                <p className="text-muted mb-1">Digital / Vouchers</p>
                <p
                  className={cn(
                    "font-bold",
                    a.faltanteDigital !== 0 ? "text-neon-red" : "text-gray-100"
                  )}
                >
                  ${a.declaradoDigital.toFixed(2)}
                </p>
                <p className="text-muted">esperado ${a.esperadoDigital.toFixed(2)}</p>
              </div>
              <div className="bg-surface-700 border border-surface-600 rounded-lg p-3">
                <p className="text-muted mb-1">Recargas</p>
                <p
                  className={cn(
                    "font-bold",
                    a.faltanteRecargas !== 0 ? "text-neon-red" : "text-gray-100"
                  )}
                >
                  ${a.declaradoRecargas.toFixed(2)}
                </p>
                <p className="text-muted">esperado ${a.esperadoRecargas.toFixed(2)}</p>
              </div>
            </div>

            {s.retiros && s.retiros.length > 0 && (
              <div className="mt-3 text-xs">
                <p className="text-muted mb-1 font-medium">Retiros de la sesión</p>
                <div className="space-y-1">
                  {s.retiros.map((r, i) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-surface-700 border border-surface-600 rounded-lg px-3 py-2"
                    >
                      <span className="text-gray-100 truncate">{r.motivo}</span>
                      <span className="text-neon-red font-bold shrink-0">
                        -${r.monto.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.descuadre && (
              <p className="mt-3 text-[11px] text-neon-red flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" />
                {s.notasCierre || "Descuadre registrado en el cierre"}
              </p>
            )}
          </motion.div>
        );
      })}

      {sesiones && (
        <p className="text-[11px] text-muted flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-acento" />
          Mostrando las últimas {sesiones.length} sesiones cerradas / anuladas
        </p>
      )}

      {/* Modal: anular sesión de caja (solo administradora) */}
      <AnimatePresence>
        {anularObjetivo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => !anulando && !anulacionHecha && setAnularObjetivo(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-800 border border-neon-red/40 rounded-3xl p-6 max-w-md w-full"
            >
              {anulacionHecha ? (
                <div className="text-center py-2">
                  <CheckCircle2 className="h-10 w-10 text-neon-green mx-auto mb-3" />
                  <h3 className="font-black text-gray-100 mb-1">Sesión anulada</h3>
                  <p className="text-sm text-muted mb-5">
                    The session was permanently cancelled and excluded from reports.
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={cerrarAnulacion}
                      className="px-5 py-2.5 rounded-xl bg-neon-green text-btn-ink font-bold text-sm shadow-neon"
                    >
                      Hecho
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <Ban className="h-5 w-5 text-neon-red" />
                    <h3 className="font-black text-gray-100">Anular sesión de caja</h3>
                  </div>
                  <p className="text-sm text-muted mb-4">
                    La sesión <strong className="text-gray-100">{anularObjetivo.folioCaja}</strong> dejará
                    de contar en ingresos y reportes, pero su registro y ventas se{" "}
                    <strong className="text-gray-100">conservan</strong> para auditoría. Escribe el motivo.
                  </p>
                  <label className="block mb-1">
                    <span className="text-xs text-muted mb-1 block">Motivo de la anulación</span>
                    <textarea
                      value={motivoAnulacion}
                      onChange={(e) => setMotivoAnulacion(e.target.value)}
                      placeholder="Ej: sesión duplicada, error de arqueo, fraude detectado"
                      rows={3}
                      disabled={anulando}
                      className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-red focus:outline-none transition-all resize-none"
                    />
                  </label>
                  {motivoAnulacion.trim().length > 0 && motivoAnulacion.trim().length < 4 && (
                    <p className="text-[11px] text-neon-red mb-1">El motivo debe tener al menos 4 caracteres</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      type="button"
                      onClick={cerrarAnulacion}
                      disabled={anulando}
                      className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={ejecutarAnulacion}
                      disabled={anulando || motivoAnulacion.trim().length < 4}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
                        !anulando && motivoAnulacion.trim().length >= 4
                          ? "bg-neon-red text-btn-ink shadow-neon-red"
                          : "bg-surface-600 text-muted cursor-not-allowed"
                      )}
                    >
                      {anulando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Anular sesión
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Área imprimible del ticket térmico (oculta en pantalla). */}
      {ticketParaImprimir && (
        <div className="hidden print-block">
          <TicketCorte
            sesion={ticketParaImprimir}
            negocio={negocio}
            anchoTicket={configCaja.anchoTicket}
            mensajeTicket={configCaja.mensajeTicket}
          />
        </div>
      )}
    </div>
  );
}