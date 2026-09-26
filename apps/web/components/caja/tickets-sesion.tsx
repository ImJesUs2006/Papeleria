"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ReceiptText,
  Printer,
  Loader2,
  AlertTriangle,
  Clock,
  User,
  CheckCircle2,
  CreditCard,
  Banknote,
  Repeat,
  ShoppingBag,
} from "lucide-react";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";

interface VentaResumen {
  folioVenta: string;
  fechaHora: string;
  metodoPago: string;
  totalNeto: number;
  estado: string;
}

interface SesionVentas {
  idCaja: string;
  folioCaja: string | null;
  horaApertura: string;
  cajero: string;
  abierta: boolean;
}

interface VentaDetalle {
  folioVenta: string;
  fechaHora: string;
  estado: string;
  metodoPago: string;
  subtotal: number;
  iva: number;
  totalNeto: number;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotalLinea: number;
  }>;
}

const ETIQUETA_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TARJETA_TERMINAL: "Tarjeta",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  CREDITO_TIENDA: "Crédito",
};

function FilaTicket({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-bold whitespace-nowrap">{valor}</span>
    </div>
  );
}

function IconoMetodo({ metodo }: { metodo: string }) {
  if (metodo === "EFECTIVO") return <Banknote className="h-3.5 w-3.5" />;
  return <CreditCard className="h-3.5 w-3.5" />;
}

/** Ticket térmico de venta, reutilizable para reimpresión. */
function TicketVenta({
  venta,
  negocio,
  folioCaja,
  cajero,
  anchoTicket,
  mensajeTicket,
}: {
  venta: VentaDetalle;
  negocio: string;
  folioCaja: string | null;
  cajero: string;
  anchoTicket: string;
  mensajeTicket: string | null;
}) {
  return (
    <div
      className={cn(
        "print-label-area space-y-1.5 text-[11px] font-mono",
        anchoTicket === "58mm" ? "print-ticket-57" : "print-ticket-80"
      )}
    >
      <div className="text-center">
        <p className="text-sm font-black">{negocio}</p>
        <p className="text-[10px]">TICKET DE VENTA</p>
        <p className="text-[10px]">{folioCaja ?? "SIN CAJA"}</p>
      </div>
      <div className="border-t border-black pt-1.5 space-y-0.5">
        <FilaTicket label="Folio" valor={venta.folioVenta} />
        <FilaTicket label="Cajera" valor={cajero} />
        <FilaTicket
          label="Fecha"
          valor={new Date(venta.fechaHora).toLocaleString("es-MX")}
        />
      </div>
      <div className="border-t border-black pt-1.5 space-y-0.5">
        {venta.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="min-w-0 flex-1">
              {it.descripcion} {it.cantidad} × ${it.precioUnitario.toFixed(2)}
            </span>
            <span className="font-bold whitespace-nowrap">
              ${it.subtotalLinea.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-black pt-1.5 space-y-0.5">
        <FilaTicket label="Subtotal" valor={`$${venta.subtotal.toFixed(2)}`} />
        <FilaTicket label="IVA" valor={`$${venta.iva.toFixed(2)}`} />
        <div className="text-sm flex justify-between gap-3 pt-1 border-t border-black">
          <span className="font-black">TOTAL</span>
          <span className="font-black">${venta.totalNeto.toFixed(2)}</span>
        </div>
        <FilaTicket
          label="Pago"
          valor={ETIQUETA_PAGO[venta.metodoPago] ?? venta.metodoPago}
        />
      </div>
      <p className="text-center text-[9px] pt-1">¡Gracias por su compra!</p>
      {mensajeTicket && (
        <p className="text-center text-[10px] pt-1 font-bold border-t border-black">
          {mensajeTicket}
        </p>
      )}
    </div>
  );
}

export function TicketsSesion() {
  const [sesion, setSesion] = useState<SesionVentas | null>(null);
  const [ventas, setVentas] = useState<VentaResumen[] | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [obteniendo, setObteniendo] = useState<string | null>(null);
  const [ticket, setTicket] = useState<VentaDetalle | null>(null);

  const negocio = useConfigStore((s) => s.config?.nombreNegocio ?? "Mi Negocio");
  const configCaja = useConfigStore((s) => ({
    anchoTicket: s.config?.anchoTicket ?? "80mm",
    mensajeTicket: s.config?.mensajeTicket ?? null,
  }));

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/caja/ventas", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar tickets");
        setSesion(data.sesion);
        setVentas(data.ventas);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const reimprimir = async (folioVenta: string) => {
    setObteniendo(folioVenta);
    setError("");
    try {
      const res = await fetch(`/api/ventas/${encodeURIComponent(folioVenta)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo recuperar la venta");
      setTicket(data);
      setTimeout(() => {
        window.print();
        setTimeout(() => setTicket(null), 300);
      }, 120);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setObteniendo(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
          <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" /> {error}
        </div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando tickets...
        </div>
      ) : !sesion ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
          <ReceiptText className="h-10 w-10 opacity-40" />
          <p className="text-sm">Aún no hay ninguna sesión de caja</p>
        </div>
      ) : (
        <>
          <div className="bg-surface-800 border border-surface-600 rounded-xl px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <p className="text-sm font-black text-gray-100">
              {sesion.folioCaja ?? sesion.idCaja}
            </p>
            <p className="text-xs text-muted flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {new Date(sesion.horaApertura).toLocaleString("es-MX")}
            </p>
            <p className="text-xs text-muted flex items-center gap-1.5">
              <User className="h-3 w-3" /> {sesion.cajero}
            </p>
            <span
              className={cn(
                "text-[11px] font-bold px-2 py-0.5 rounded-md",
                sesion.abierta
                  ? "bg-acento/10 text-acento"
                  : "bg-neon-red/10 text-neon-red"
              )}
            >
              {sesion.abierta ? "Sesión abierta" : "Sesión cerrada"}
            </span>
          </div>

          {!ventas || ventas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted gap-2">
              <ShoppingBag className="h-10 w-10 opacity-40" />
              <p className="text-sm">Esta sesión no tiene ventas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ventas.map((v, i) => (
                <motion.div
                  key={v.folioVenta}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="bg-surface-800 border border-surface-600 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-lg bg-surface-700 flex items-center justify-center text-acento">
                      <ReceiptText className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-gray-100">
                        {v.folioVenta}
                      </p>
                      <p className="text-[11px] text-muted flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {new Date(v.fechaHora).toLocaleString("es-MX")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted flex items-center gap-1">
                      <IconoMetodo metodo={v.metodoPago} />
                      {ETIQUETA_PAGO[v.metodoPago] ?? v.metodoPago}
                    </span>
                    <span className="text-sm font-black text-gray-100">
                      ${v.totalNeto.toFixed(2)}
                    </span>
                    <button
                      onClick={() => reimprimir(v.folioVenta)}
                      disabled={obteniendo === v.folioVenta}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs font-bold text-gray-100 transition-colors"
                    >
                      {obteniendo === v.folioVenta ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Printer className="h-3.5 w-3.5" />
                      )}
                      Reimprimir
                    </button>
                  </div>
                </motion.div>
              ))}

              <p className="text-[11px] text-muted flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-acento" />
                {ventas.length} ticket(s) en la sesión ·{" "}
                <Repeat className="h-3 w-3" /> los tickets de sesiones cerradas
                están en el historial
              </p>
            </div>
          )}
        </>
      )}

      {ticket && (
        <div className="hidden print-block">
          <TicketVenta
            venta={ticket}
            negocio={negocio}
            folioCaja={sesion?.folioCaja ?? null}
            cajero={sesion?.cajero ?? ""}
            anchoTicket={configCaja.anchoTicket}
            mensajeTicket={configCaja.mensajeTicket}
          />
        </div>
      )}
    </div>
  );
}