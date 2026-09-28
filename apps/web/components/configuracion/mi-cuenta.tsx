"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, AlertTriangle, Check, Loader2, UserCircle, ShieldCheck } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

export function MiCuentaPanel() {
  const idPersona = useAuthStore((s) => s.idPersona);
  const nombre = useAuthStore((s) => s.nombre);
  const rol = useAuthStore((s) => s.rol);
  const canPurge = useAuthStore((s) => s.canPurge);

  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNuevo, setPasswordNuevo] = useState("");
  const [passwordConfirma, setPasswordConfirma] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const limpiar = () => {
    setPasswordActual("");
    setPasswordNuevo("");
    setPasswordConfirma("");
  };

  const guardar = async () => {
    if (!idPersona) return;
    setError(null);
    setOk(false);
    if (passwordNuevo !== passwordConfirma) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/usuarios/${idPersona}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordNuevo, currentPassword: passwordActual }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar la contraseña");
      limpiar();
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const valido =
    passwordActual.length >= 8 && passwordNuevo.length >= 8 && passwordConfirma.length >= 8;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-surface-800 border border-surface-600 rounded-2xl p-5 mb-5"
    >
      <div className="flex items-center gap-2 mb-4">
        <UserCircle className="h-5 w-5 text-neon-cyan" />
        <span className="font-bold text-gray-100">Mi cuenta</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="h-11 w-11 rounded-xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
          <UserCircle className="h-6 w-6 text-neon-cyan" />
        </div>
        <div>
          <span className="block text-gray-100 font-bold">{nombre}</span>
          <span className="text-[11px] text-muted uppercase tracking-wider">
            {rol}
          </span>
        </div>
        {canPurge && (
          <span className="ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md bg-neon-magenta/10 border border-neon-magenta/40 text-neon-magenta font-bold">
            <ShieldCheck className="h-3.5 w-3.5" /> Raíz · puede purgar bitácora
          </span>
        )}
      </div>

      <div className="border-t border-surface-600 pt-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-neon-cyan" />
          <span className="text-xs font-bold text-muted uppercase tracking-wider">
            Cambiar mi contraseña
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-muted mb-1 block">Contraseña actual</span>
            <input
              type="password"
              value={passwordActual}
              onChange={(e) => setPasswordActual(e.target.value)}
              className="input-dark"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted mb-1 block">Nueva contraseña (mín. 8)</span>
            <input
              type="password"
              value={passwordNuevo}
              onChange={(e) => setPasswordNuevo(e.target.value)}
              className="input-dark"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted mb-1 block">Confirmar nueva contraseña</span>
            <input
              type="password"
              value={passwordConfirma}
              onChange={(e) => setPasswordConfirma(e.target.value)}
              className="input-dark"
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
            <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
            {error}
          </div>
        )}
        {ok && (
          <div className="flex items-center gap-2 bg-neon-green/10 border border-neon-green/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
            <Check className="h-4 w-4 text-neon-green" /> Contraseña actualizada
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando || !valido}
          className={cn(
            "flex items-center gap-2 py-2.5 px-5 rounded-xl font-bold text-sm transition-all",
            guardando || !valido
              ? "bg-surface-600 text-muted cursor-not-allowed"
              : "bg-neon-cyan text-btn-ink shadow-neon-cyan"
          )}
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Actualizar contraseña
        </button>
      </div>
    </motion.div>
  );
}