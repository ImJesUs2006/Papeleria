"use client";

import { motion } from "framer-motion";
import { Coins, Crown, Star } from "lucide-react";
import { equivalenciaPuntos } from "@/lib/fidelidad";
import { cn } from "@/lib/utils";

interface VirtualCardProps {
  nombre: string;
  nivel?: "MENUDEO" | "MAYOREO";
  puntos: number;
  /** Valor de 1 punto (pesos) para la equivalencia en efectivo (Fase 12). */
  valorPuntoPesos?: number;
  className?: string;
}

/**
 * Tarjeta de fidelidad virtual (Fase 12): CSS shine + animación Framer Motion.
 * Muestra el nombre del cliente, su nivel (Menudeo/Mayoreo) y el saldo de
 * puntos con su equivalencia en pesos.
 */
export function VirtualCard({
  nombre,
  nivel = "MENUDEO",
  puntos,
  valorPuntoPesos,
  className,
}: VirtualCardProps) {
  const esMayoreo = nivel === "MAYOREO";
  const equivalente = equivalenciaPuntos(puntos, valorPuntoPesos ?? 1);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 240, damping: 20 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 select-none",
        esMayoreo
          ? "border-amber-400/50 bg-gradient-to-br from-amber-900/60 via-surface-800 to-yellow-900/40"
          : "border-neon-purple/40 bg-gradient-to-br from-purple-900/50 via-surface-800 to-indigo-900/40",
        className
      )}
    >
      {/* Brillo que recorre la tarjeta (CSS shine con Framer Motion). */}
      <motion.div
        aria-hidden
        initial={{ x: "-160%" }}
        animate={{ x: "220%" }}
        transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity, repeatDelay: 2.2 }}
        className="pointer-events-none absolute -inset-y-10 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />

      <div className="relative">
        {/* Marca + sello corporativo */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-surface-700 border border-surface-500 flex items-center justify-center">
              <Coins className="h-4 w-4 text-neon-yellow" />
            </div>
            <div>
              <p className="text-[10px] text-muted uppercase tracking-widest leading-none">
                Puntos Monedero
              </p>
              <p className="text-[11px] font-black text-gray-100 leading-tight">
                FIDELIDAD
              </p>
            </div>
          </div>
          <span
            className={cn(
              "flex items-center gap-1 text-[10px] font-black uppercase tracking-wider rounded-lg px-2 py-1",
              esMayoreo
                ? "text-amber-300 bg-amber-400/10 border border-amber-400/40"
                : "text-neon-purple bg-neon-purple/10 border border-neon-purple/30"
            )}
          >
            {esMayoreo ? <Crown className="h-3 w-3" /> : <Star className="h-3 w-3" />}
            {nivel}
          </span>
        </div>

        {/* Titular */}
        <p className="text-[10px] text-muted uppercase tracking-widest mb-1">
          Cliente
        </p>
        <p className="text-lg font-black text-gray-100 truncate max-w-[18ch]">
          {nombre}
        </p>

        {/* Saldo de puntos */}
        <div className="mt-4 flex items-end justify-between gap-2">
          <div>
            <p className="text-base font-black text-neon-yellow text-glow-green leading-none">
              {puntos}
            </p>
            <p className="text-[10px] text-muted mt-1">saldo de puntos</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-gray-100 leading-none">
              ${equivalente.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted mt-1">
              equivalen al cobrar
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}