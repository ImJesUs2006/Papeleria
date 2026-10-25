"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { calcularImpuestos } from "@/lib/impuestos";
import { confirmar } from "@/store/dialogo";
import { notificar } from "@/store/notificaciones";
import { cn } from "@/lib/utils";

// ============================================================
// Impuestos del negocio, en tres preguntas:
//   1. ¿Cobras impuestos?      (no = todo a tasa 0, sin importar el producto)
//   2. ¿Qué tasa de IVA?       (16 %, 8 % frontera, 0 % u otra)
//   3. ¿Tus precios ya traen IVA?  con un ejemplo en vivo de lo que paga el cliente.
// ============================================================

const TASAS = [
  { valor: 16, etiqueta: "16 %", nota: "General" },
  { valor: 8, etiqueta: "8 %", nota: "Zona fronteriza" },
  { valor: 0, etiqueta: "0 %", nota: "Tasa cero" },
];

interface Props {
  cobraImpuestos: boolean;
  ivaRate: number;
  preciosIncluyenIva: boolean;
  onChange: (cambio: Partial<{ cobraImpuestos: boolean; ivaRate: number; preciosIncluyenIva: boolean }>) => void;
}

export function ImpuestosPanel({ cobraImpuestos, ivaRate, preciosIncluyenIva, onChange }: Props) {
  const [conTasaPropia, setConTasaPropia] = useState<number | null>(null);
  const otra = !TASAS.some((t) => t.valor === Number(ivaRate));

  useEffect(() => {
    fetch("/api/productos/impuestos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConTasaPropia(d?.conTasaPropia ?? null))
      .catch(() => {});
  }, []);

  // Ejemplo con un producto de $100 a la tasa elegida.
  const ejemplo = calcularImpuestos([{ importe: 100, tasaIva: cobraImpuestos ? Number(ivaRate) || 0 : 0, tasaIeps: 0 }], {
    preciosIncluyenIva,
  });

  const usarTasaNegocio = async () => {
    if (
      !(await confirmar({
        titulo: "¿Todos los productos con la tasa del negocio?",
        mensaje: `${conTasaPropia} producto(s) tienen una tasa propia (por ejemplo 0 % o exento). Pasarán a usar la que elegiste aquí.`,
        aceptar: "Aplicar a todos",
      }))
    )
      return;
    const r = await fetch("/api/productos/impuestos", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return notificar.error("No se pudo aplicar", d.error);
    setConTasaPropia(0);
    notificar.exito(`${d.actualizados} producto(s) usan ahora la tasa del negocio`);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-surface-600 bg-surface-700/30 p-4" data-testid="impuestos-panel">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-acento" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted">Impuestos</span>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-gray-100">¿Cobras impuestos (IVA)?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { v: true, t: "Sí, cobro IVA", d: "Estás inscrito en el SAT y tu régimen causa IVA." },
            { v: false, t: "No cobro impuestos", d: "No estás inscrito o tu régimen no causa IVA: nada lleva impuestos." },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              aria-pressed={cobraImpuestos === o.v}
              data-testid={o.v ? "cobra-iva-si" : "cobra-iva-no"}
              onClick={() => onChange({ cobraImpuestos: o.v })}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                cobraImpuestos === o.v ? "border-acento bg-acento/10" : "border-surface-500 bg-surface-700 hover:border-acento/50"
              )}
            >
              <span className="block text-sm font-bold text-gray-100">{o.t}</span>
              <span className="block text-xs text-muted">{o.d}</span>
            </button>
          ))}
        </div>
      </div>

      {cobraImpuestos && (
        <>
          <div>
            <p className="mb-2 text-sm font-bold text-gray-100">Tasa de IVA</p>
            <div className="flex flex-wrap gap-2">
              {TASAS.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  aria-pressed={!otra && Number(ivaRate) === t.valor}
                  onClick={() => onChange({ ivaRate: t.valor })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    !otra && Number(ivaRate) === t.valor ? "border-acento bg-acento/10" : "border-surface-500 bg-surface-700 hover:border-acento/50"
                  )}
                >
                  <span className="block text-sm font-black text-gray-100">{t.etiqueta}</span>
                  <span className="block text-[11px] text-muted">{t.nota}</span>
                </button>
              ))}
              <label className={cn("rounded-xl border px-3 py-2", otra ? "border-acento bg-acento/10" : "border-surface-500 bg-surface-700")}>
                <span className="block text-[11px] text-muted">Otra (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={otra ? ivaRate : ""}
                  placeholder="—"
                  onChange={(e) => onChange({ ivaRate: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                  className="w-16 bg-transparent text-sm font-black text-gray-100 outline-none"
                  aria-label="Otra tasa de IVA"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-gray-100">Los precios que capturas en Inventario…</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { v: true, t: "Ya incluyen el IVA", d: "Lo usual en mostrador: el cliente paga el precio de la etiqueta." },
                { v: false, t: "Son sin IVA", d: "El IVA se suma al cobrar (más común en mayoreo o entre empresas)." },
              ].map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  aria-pressed={preciosIncluyenIva === o.v}
                  data-testid={o.v ? "precios-con-iva" : "precios-sin-iva"}
                  onClick={() => onChange({ preciosIncluyenIva: o.v })}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    preciosIncluyenIva === o.v ? "border-acento bg-acento/10" : "border-surface-500 bg-surface-700 hover:border-acento/50"
                  )}
                >
                  <span className="block text-sm font-bold text-gray-100">{o.t}</span>
                  <span className="block text-xs text-muted">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="rounded-xl border border-surface-500 bg-surface-800 p-3 text-sm" data-testid="ejemplo-impuestos">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Así se cobra un producto de $100</p>
        <p className="mt-1 text-gray-100">
          El cliente paga <span className="font-black text-neon-green">${ejemplo.total.toFixed(2)}</span>
          {!cobraImpuestos || ejemplo.iva === 0
            ? " — sin impuestos en el ticket."
            : preciosIncluyenIva
              ? ` — el ticket desglosa $${ejemplo.subtotal.toFixed(2)} + IVA $${ejemplo.iva.toFixed(2)} (ya incluido).`
              : ` — $100.00 + IVA $${ejemplo.iva.toFixed(2)}.`}
        </p>
      </div>

      {cobraImpuestos && conTasaPropia != null && conTasaPropia > 0 && (
        <p className="text-xs text-muted">
          {conTasaPropia} producto(s) tienen su propia tasa (0 %, exento o IEPS) y no siguen esta configuración.{" "}
          <button type="button" onClick={usarTasaNegocio} className="font-semibold text-acento underline">
            Que todos usen la tasa del negocio
          </button>
        </p>
      )}
      {!cobraImpuestos && (
        <p className="text-xs text-muted">
          Mientras esté apagado, ningún producto cobra IVA ni IEPS, aunque tenga una tasa propia en Inventario.
        </p>
      )}
    </section>
  );
}
