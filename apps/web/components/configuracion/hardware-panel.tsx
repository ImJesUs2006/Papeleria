"use client";

import { useEffect, useState } from "react";
import { Cpu, Printer, Scale, Vault } from "lucide-react";
import {
  abrirCajon,
  elegirPuerto,
  enviarAImpresora,
  guardarHardware,
  hayWebSerial,
  leerBascula,
  leerHardware,
  type HardwareEquipo,
} from "@/lib/hardware/serial";
import { ticketEscPos } from "@/lib/hardware/escpos";
import { useConfigStore } from "@/store/config";

// ============================================================
// Hardware de ESTE equipo (Paso 8): impresora térmica directa (ESC/POS),
// cajón de dinero y báscula. Se guarda en este navegador porque cada caja
// tiene sus propios aparatos.
// ============================================================

export function HardwarePanel() {
  const config = useConfigStore((s) => s.config);
  const [h, setH] = useState<HardwareEquipo | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soportado = typeof window !== "undefined" && hayWebSerial();

  useEffect(() => setH(leerHardware()), []);
  if (!h) return null;

  const actualizar = (cambio: Partial<HardwareEquipo>) => {
    const nuevo = { ...h, ...cambio };
    setH(nuevo);
    guardarHardware(nuevo);
  };
  const probar = async (fn: () => Promise<string>) => {
    setMensaje(null);
    setError(null);
    try {
      setMensaje(await fn());
    } catch (e: any) {
      setError(e?.message || "No se pudo comunicar con el dispositivo");
    }
  };

  return (
    <div className="space-y-4">
      {!soportado && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Este navegador no permite conectar dispositivos USB/serie. Usa Chrome o Edge (o la app de
          escritorio). Mientras tanto se imprime con el diálogo del navegador.
        </div>
      )}

      <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Printer className="h-4 w-4 text-acento" />
          <span className="text-sm font-bold text-gray-100">Impresora de tickets</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            checked={h.impresora === "NAVEGADOR"}
            onChange={() => actualizar({ impresora: "NAVEGADOR" })}
          />
          Diálogo de impresión del navegador
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            disabled={!soportado}
            checked={h.impresora === "ESCPOS"}
            onChange={() => actualizar({ impresora: "ESCPOS" })}
          />
          Térmica directa (ESC/POS por USB o serie): imprime sin diálogo y corta el papel
        </label>
        {h.impresora === "ESCPOS" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => probar(async () => `Impresora elegida (${await elegirPuerto("impresora")})`)}
              className="rounded-lg border border-surface-500 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-surface-600"
            >
              Elegir impresora
            </button>
            <button
              type="button"
              onClick={() =>
                probar(async () => {
                  await enviarAImpresora(
                    ticketEscPos(
                      {
                        negocio: config?.nombreNegocio ?? "Mi negocio",
                        folio: "PRUEBA",
                        fecha: new Date().toLocaleString("es-MX"),
                        items: [{ descripcion: "Artículo de prueba ñáéíóú", cantidad: 1, importe: 10 }],
                        subtotal: 10,
                        iva: 1.6,
                        total: 11.6,
                        metodoPago: "EFECTIVO",
                      },
                      config?.anchoTicket ?? "80mm"
                    )
                  );
                  return "Ticket de prueba enviado";
                })
              }
              className="rounded-lg bg-acento px-3 py-1.5 text-xs font-bold text-btn-ink"
            >
              Imprimir prueba
            </button>
            <label className="flex items-center gap-1 text-xs text-muted">
              Baudios
              <select
                value={h.baudiosImpresora}
                onChange={(e) => actualizar({ baudiosImpresora: Number(e.target.value) })}
                className="input-dark w-24"
              >
                {[9600, 19200, 38400, 115200].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Vault className="h-4 w-4 text-acento" />
          <span className="text-sm font-bold text-gray-100">Cajón de dinero</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            disabled={h.impresora !== "ESCPOS"}
            checked={h.abrirCajon}
            onChange={(e) => actualizar({ abrirCajon: e.target.checked })}
          />
          Abrir el cajón al cobrar en efectivo (conectado a la impresora térmica)
        </label>
        {h.impresora === "ESCPOS" && (
          <button
            type="button"
            onClick={() => probar(async () => (await abrirCajon(), "Pulso enviado al cajón"))}
            className="rounded-lg border border-surface-500 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-surface-600"
          >
            Probar cajón
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-surface-600 bg-surface-800 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-acento" />
          <span className="text-sm font-bold text-gray-100">Báscula</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            disabled={!soportado}
            checked={h.usarBascula}
            onChange={(e) => actualizar({ usarBascula: e.target.checked })}
          />
          Leer el peso de la báscula en los productos a granel
        </label>
        {h.usarBascula && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => probar(async () => `Báscula elegida (${await elegirPuerto("bascula")})`)}
              className="rounded-lg border border-surface-500 px-3 py-1.5 text-xs font-bold text-slate-300 hover:bg-surface-600"
            >
              Elegir báscula
            </button>
            <button
              type="button"
              onClick={() => probar(async () => `Peso leído: ${await leerBascula()} kg`)}
              className="rounded-lg bg-acento px-3 py-1.5 text-xs font-bold text-btn-ink"
            >
              Leer peso
            </button>
          </div>
        )}
      </div>

      {mensaje && <p className="text-sm text-emerald-300">{mensaje}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Cpu className="h-3.5 w-3.5" /> Estos ajustes solo aplican a este equipo y navegador.
      </p>
    </div>
  );
}
