"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Info,
  Package,
  PackageOpen,
  RefreshCw,
  Truck,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import type { Alerta, NivelAlerta, TipoAlerta } from "@/lib/alertas";
import { useAlertas } from "@/store/alertas";
import { cn } from "@/lib/utils";

const CADA_MS = 5 * 60_000;

const ICONO_TIPO: Record<TipoAlerta, typeof Info> = {
  stock: Package,
  caducidad: CalendarClock,
  pedido: Truck,
  pago: Wallet,
  apartado: PackageOpen,
  caja: Vault,
};

const ESTILO_NIVEL: Record<NivelAlerta, { etiqueta: string; icono: typeof Info; cls: string; punto: string }> = {
  critica: { etiqueta: "Urgente", icono: AlertOctagon, cls: "border-rose-500/50 bg-rose-500/10 text-rose-300", punto: "bg-rose-500" },
  aviso: { etiqueta: "Atención", icono: AlertTriangle, cls: "border-amber-500/50 bg-amber-500/10 text-amber-300", punto: "bg-amber-400" },
  info: { etiqueta: "Para hoy", icono: Info, cls: "border-sky-500/50 bg-sky-500/10 text-sky-300", punto: "bg-sky-400" },
};

/** Tarjeta de una alerta (se usa en la campana y en el Dashboard). */
export function TarjetaAlerta({ alerta, onAccion }: { alerta: Alerta; onAccion?: () => void }) {
  const descartar = useAlertas((s) => s.descartar);
  const Icono = ICONO_TIPO[alerta.tipo];
  const estilo = ESTILO_NIVEL[alerta.nivel];
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -30 }}
      className="rounded-xl border border-surface-500 bg-surface-700 p-3"
      data-testid="alerta"
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", estilo.cls)}>
          <Icono className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-anywhere text-sm font-bold leading-snug text-gray-100">{alerta.titulo}</p>
          <p className="break-anywhere mt-0.5 text-xs leading-snug text-muted">{alerta.detalle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={alerta.accion.href}
              onClick={onAccion}
              className="rounded-lg border border-acento/50 px-2.5 py-1 text-xs font-bold text-acento hover:bg-acento/10"
            >
              {alerta.accion.etiqueta}
            </Link>
            <button
              type="button"
              onClick={() => descartar(alerta.clave)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:text-gray-100"
              title="Ocultar hasta mañana"
            >
              <Check className="h-3 w-3" /> Entendido
            </button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

/** Campana con contador y panel desplegable de alertas. */
export function CentroAlertas() {
  const { alertas, cargando, cargar } = useAlertas();
  const [abierto, setAbierto] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cargar();
    const id = setInterval(() => cargar({ silencioso: true }), CADA_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Cerrar con Escape o clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    const fuera = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("mousedown", fuera);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("mousedown", fuera);
    };
  }, [abierto]);

  const criticas = alertas.filter((a) => a.nivel === "critica").length;
  const grupos = (["critica", "aviso", "info"] as NivelAlerta[])
    .map((nivel) => ({ nivel, items: alertas.filter((a) => a.nivel === nivel) }))
    .filter((g) => g.items.length > 0);

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        onClick={() => {
          setAbierto((v) => !v);
          if (!abierto) cargar({ silencioso: true });
        }}
        aria-label={alertas.length ? `Alertas: ${alertas.length}` : "Alertas"}
        aria-expanded={abierto}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
          abierto ? "border-acento/60 bg-acento/10 text-acento" : "border-surface-500 text-muted hover:text-gray-100"
        )}
        data-testid="campana-alertas"
      >
        <Bell className="h-4 w-4" />
        {alertas.length > 0 && (
          <span
            className={cn(
              "absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-black text-white",
              criticas > 0 ? "bg-rose-600" : "bg-amber-500"
            )}
          >
            {alertas.length > 99 ? "99+" : alertas.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed left-[16.5rem] top-3 z-[70] flex max-h-[calc(100vh-1.5rem)] w-[min(26rem,calc(100vw-18rem))] flex-col rounded-2xl border border-surface-500 bg-surface-800 shadow-card"
            role="dialog"
            aria-label="Centro de alertas"
          >
            <div className="flex items-center justify-between gap-3 border-b border-surface-600 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-100">Alertas del negocio</p>
                <p className="text-[11px] text-muted">
                  {alertas.length === 0 ? "Todo en orden" : `${alertas.length} pendiente${alertas.length === 1 ? "" : "s"}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => cargar({ silencioso: true })}
                  aria-label="Actualizar alertas"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-gray-100"
                >
                  <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  aria-label="Cerrar"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-3">
              {grupos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Check className="h-8 w-8 text-emerald-400" />
                  <p className="text-sm font-bold text-gray-100">Sin pendientes</p>
                  <p className="max-w-[16rem] text-xs text-muted">
                    Aquí te avisaremos de stock bajo, caducidades, pedidos, pagos a proveedores y apartados por vencer.
                  </p>
                </div>
              ) : (
                grupos.map((g) => (
                  <section key={g.nivel} className="mb-3 last:mb-0">
                    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted">
                      <span className={cn("h-2 w-2 rounded-full", ESTILO_NIVEL[g.nivel].punto)} />
                      {ESTILO_NIVEL[g.nivel].etiqueta} · {g.items.length}
                    </h3>
                    <ul className="space-y-2">
                      <AnimatePresence initial={false}>
                        {g.items.map((a) => (
                          <TarjetaAlerta key={a.clave} alerta={a} onAccion={() => setAbierto(false)} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </section>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
