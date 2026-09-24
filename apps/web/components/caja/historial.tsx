"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  History,
  Printer,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
} from "lucide-react";
import { useConfigStore } from "@/store/config";
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
  horaApertura: string;
  horaCierre: string;
  cajero: string;
  fondoInicial: number;
  retirosEfectivo: number;
  retiros: Array<{ monto: number; motivo: string; fechaHora: string }>;
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
function TicketCorte({ sesion, negocio }: { sesion: SesionHistorial; negocio: string }) {
  const a = sesion.arqueo;
  return (
    <div className="print-label-area print-ticket-80 space-y-1.5 text-[11px] font-mono">
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
    </div>
  );
}

export function HistorialCaja() {
  const [sesiones, setSesiones] = useState<SesionHistorial[] | null>(null);
  const [error, setError] = useState("");
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);
  const [ticketParaImprimir, setTicketParaImprimir] = useState<SesionHistorial | null>(null);
  const negocio = useConfigStore((s) => s.config?.nombreNegocio ?? "Mi Negocio");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/caja/historial", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar el historial");
        setSesiones(data.historial);
      } catch (e: any) {
        setError(e.message);
      }
    })();
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
                    s.descuadre ? "bg-neon-red animate-pulse" : "bg-neon-green"
                  )}
                />
                <div>
                  <p className="text-sm font-bold text-gray-100">
                    {s.descuadre ? "Corte con descuadre" : "Corte cuadrada"}
                  </p>
                  <p className="text-xs text-muted flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(s.horaCierre).toLocaleString("es-MX")} ·{" "}
                    <User className="h-3 w-3" /> {s.cajero}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "text-sm font-black",
                    s.descuadre ? "text-neon-red" : "text-neon-green"
                  )}
                >
                  {s.descuadre
                    ? `${a.diferenciaTotal > 0 ? "Faltante" : "Sobrante"} $${Math.abs(
                        a.diferenciaTotal
                      ).toFixed(2)}`
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
              </div>
            </div>

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
          <CheckCircle2 className="h-3 w-3 text-neon-green" />
          Mostrando las últimas {sesiones.length} sesiones cerradas
        </p>
      )}

      {/* Área imprimible del ticket térmico (oculta en pantalla). */}
      {ticketParaImprimir && (
        <div className="hidden print-block">
          <TicketCorte sesion={ticketParaImprimir} negocio={negocio} />
        </div>
      )}
    </div>
  );
}