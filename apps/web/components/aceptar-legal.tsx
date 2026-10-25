"use client";

import { useEffect, useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useAuthStore } from "@/store/auth";
import { notificar } from "@/store/notificaciones";

/**
 * El dueño(a) acepta términos y aviso de privacidad en nombre del negocio
 * (la primera vez y cada que cambia la versión). Al resto no se le pide.
 */
export function AceptarLegal() {
  const rol = useAuthStore((s) => s.rol);
  const [pendiente, setPendiente] = useState(false);
  const [leido, setLeido] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (rol !== "ADMINISTRADORA") return;
    fetch("/api/legal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPendiente(Boolean(d?.esDueno && !d.aceptada)))
      .catch(() => {});
  }, [rol]);

  const aceptar = async () => {
    setGuardando(true);
    const r = await fetch("/api/legal", { method: "POST" });
    setGuardando(false);
    if (!r.ok) return notificar.error("No se pudo registrar la aceptación");
    setPendiente(false);
    notificar.exito("¡Gracias! Quedó registrada la aceptación");
  };

  return (
    <Modal open={pendiente} onClose={() => {}} className="max-w-lg">
      <div data-testid="aceptar-legal" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-acento/15 text-acento">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <h3 className="font-black text-gray-100">Antes de continuar</h3>
        </div>
        <p className="text-sm text-muted">
          Como dueño(a) del negocio, revisa y acepta en su nombre los{" "}
          <a href="/terminos" target="_blank" className="font-semibold text-acento underline">
            términos y condiciones
          </a>{" "}
          y el{" "}
          <a href="/privacidad" target="_blank" className="font-semibold text-acento underline">
            aviso de privacidad
          </a>
          . Explican qué datos se guardan, para qué, cómo se respaldan y cómo ejercer los derechos de tu equipo y tus
          clientes.
        </p>
        <label className="flex items-start gap-2 text-sm text-gray-100">
          <input type="checkbox" checked={leido} onChange={(e) => setLeido(e.target.checked)} className="mt-1" data-testid="leido-legal" />
          He leído y acepto los términos y el aviso de privacidad en nombre de mi negocio.
        </label>
        <button
          type="button"
          onClick={aceptar}
          disabled={!leido || guardando}
          data-testid="aceptar-legal-boton"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon-green py-2.5 font-bold text-btn-ink disabled:bg-surface-600 disabled:text-muted"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          Aceptar y continuar
        </button>
      </div>
    </Modal>
  );
}
