"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileCheck2, LifeBuoy, Loader2 } from "lucide-react";
import { notificar } from "@/store/notificaciones";
import { cn } from "@/lib/utils";

interface Estado {
  legal: { aceptada: boolean; aceptadaEn: string | null; aceptadaPor: string | null; esDueno: boolean } | null;
  soporte: { permitirSoporte: boolean; accesos: Array<{ fechaHora: string; accion: string }> } | null;
}

const fecha = (v: string) =>
  new Date(v).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Respaldo descargable, acceso de soporte y términos aceptados (Fase H). */
export function SeguridadDatos() {
  const [estado, setEstado] = useState<Estado>({ legal: null, soporte: null });
  const [descargando, setDescargando] = useState(false);

  const cargar = useCallback(() => {
    Promise.all([
      fetch("/api/legal", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/configuracion/soporte", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([legal, soporte]) => setEstado({ legal, soporte }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const esDueno = estado.legal?.esDueno === true;

  const descargar = async () => {
    setDescargando(true);
    try {
      const r = await fetch("/api/respaldo");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo generar el respaldo");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-negocio-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notificar.exito("Respaldo descargado", "Guárdalo en un lugar seguro: incluye datos de tus clientes");
    } catch (e: any) {
      notificar.error(e.message);
    } finally {
      setDescargando(false);
    }
  };

  const cambiarSoporte = async (permitir: boolean) => {
    const r = await fetch("/api/configuracion/soporte", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permitir }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return notificar.error(d.error || "No se pudo cambiar");
    notificar.exito(permitir ? "El soporte puede entrar a tu negocio" : "Acceso de soporte bloqueado");
    cargar();
  };

  const tarjeta = "rounded-2xl border border-surface-600 bg-surface-800 p-5";
  return (
    <div className="space-y-4" data-testid="seguridad-datos">
      <section className={tarjeta}>
        <div className="mb-2 flex items-center gap-2">
          <Download className="h-4 w-4 text-acento" />
          <h3 className="font-bold text-gray-100">Respaldo de tu información</h3>
        </div>
        <p className="mb-3 text-sm text-muted">
          Descarga en Excel tus productos, clientes, proveedores, ventas con su detalle y usuarios (sin contraseñas). Tu
          información es tuya: guárdala de vez en cuando aunque el sistema también haga respaldos del servidor.
        </p>
        <button
          type="button"
          onClick={descargar}
          disabled={!esDueno || descargando}
          data-testid="descargar-respaldo"
          className="inline-flex items-center gap-2 rounded-xl bg-neon-green px-4 py-2 text-sm font-bold text-btn-ink disabled:bg-surface-600 disabled:text-muted"
        >
          {descargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar respaldo
        </button>
        {!esDueno && estado.legal && <p className="mt-2 text-xs text-muted">Solo el dueño(a) del negocio puede descargarlo.</p>}
      </section>

      <section className={tarjeta}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-amber-300" />
            <h3 className="font-bold text-gray-100">Acceso del soporte técnico</h3>
          </div>
          {estado.soporte && (
            <button
              type="button"
              role="switch"
              aria-checked={estado.soporte.permitirSoporte}
              aria-label="Permitir acceso de soporte"
              data-testid="interruptor-soporte"
              disabled={!esDueno}
              onClick={() => cambiarSoporte(!estado.soporte!.permitirSoporte)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                estado.soporte.permitirSoporte ? "bg-neon-green" : "bg-surface-500"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
                  estado.soporte.permitirSoporte ? "left-[22px]" : "left-0.5"
                )}
              />
            </button>
          )}
        </div>
        <p className="text-sm text-muted">
          Si lo permites, cuando pidas ayuda el soporte de la plataforma puede entrar a tu negocio durante 1 hora para
          revisar el problema, con un aviso visible. No puede transferir la propiedad, reiniciar el sistema ni purgar la
          bitácora, y cada entrada queda registrada.
        </p>
        {estado.soporte && estado.soporte.accesos.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {estado.soporte.accesos.map((a, i) => (
              <li key={i}>
                {fecha(a.fechaHora)} · {a.accion}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={tarjeta}>
        <div className="mb-2 flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-acento" />
          <h3 className="font-bold text-gray-100">Términos y aviso de privacidad</h3>
        </div>
        <p className="text-sm text-muted">
          {!estado.legal
            ? "Cargando…"
            : estado.legal.aceptada
            ? `Aceptados${estado.legal.aceptadaPor ? ` por ${estado.legal.aceptadaPor}` : ""}${estado.legal.aceptadaEn ? ` el ${fecha(estado.legal.aceptadaEn)}` : ""}.`
            : "Aún no se aceptan los términos vigentes; el dueño(a) los verá al entrar."}{" "}
          <a href="/terminos" target="_blank" className="font-semibold text-acento underline">
            Términos
          </a>{" "}
          ·{" "}
          <a href="/privacidad" target="_blank" className="font-semibold text-acento underline">
            Aviso de privacidad
          </a>
        </p>
      </section>
    </div>
  );
}
