"use client";

import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { notificar } from "@/store/notificaciones";

// ============================================================
// Generador de variantes: ejes (Talla, Color…) y sus valores. Cada
// combinación se crea como un producto propio a partir del modelo.
// Se usa en Lotes y series → Variantes y en la ficha del producto.
// ============================================================

interface Eje {
  nombre: string;
  valores: string;
}

const MAX_EJES = 3;

export function GeneradorVariantes({
  codigoModelo,
  onCreadas,
}: {
  codigoModelo: string | null;
  onCreadas?: (codigos: string[]) => void;
}) {
  const [ejes, setEjes] = useState<Eje[]>([
    { nombre: "Talla", valores: "CH, M, G" },
    { nombre: "Color", valores: "" },
  ]);
  const [ocupado, setOcupado] = useState(false);

  const validos = ejes.filter((e) => e.nombre.trim() && e.valores.trim());
  const combinaciones = validos.reduce(
    (n, e) => n * new Set(e.valores.split(",").map((v) => v.trim()).filter(Boolean)).size,
    validos.length ? 1 : 0
  );

  const generar = async () => {
    if (!codigoModelo) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(codigoModelo)}/variantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejes: validos.map((e) => ({ nombre: e.nombre.trim(), valores: e.valores.split(",") })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudieron generar las variantes");
      notificar.exito(
        `${data.creadas.length} variante(s) creadas`,
        data.omitidas.length ? `${data.omitidas.length} ya existían y se dejaron igual` : undefined
      );
      onCreadas?.(data.creadas);
    } catch (e: any) {
      notificar.error(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-2">
      {ejes.map((eje, i) => (
        <div key={i} className="grid grid-cols-[1fr_2fr_auto] gap-2">
          <input
            value={eje.nombre}
            onChange={(e) => setEjes(ejes.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)))}
            placeholder="Eje (Talla)"
            aria-label={`Nombre del eje ${i + 1}`}
            className="input-dark"
          />
          <input
            value={eje.valores}
            onChange={(e) => setEjes(ejes.map((x, k) => (k === i ? { ...x, valores: e.target.value } : x)))}
            placeholder="Valores separados por coma"
            aria-label={`Valores del eje ${i + 1}`}
            className="input-dark"
          />
          <button
            type="button"
            onClick={() => setEjes(ejes.filter((_, k) => k !== i))}
            disabled={ejes.length === 1}
            aria-label={`Quitar eje ${i + 1}`}
            className="rounded-xl px-2 text-muted hover:text-rose-300 disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {ejes.length < MAX_EJES ? (
          <button
            type="button"
            onClick={() => setEjes([...ejes, { nombre: "", valores: "" }])}
            className="inline-flex items-center gap-1 text-xs font-bold text-acento hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar eje
          </button>
        ) : (
          <span />
        )}
        <span className="text-xs text-muted">
          {combinaciones > 0 ? `Se crearán hasta ${combinaciones} combinaciones` : "Captura al menos un eje con valores"}
        </span>
      </div>
      <button
        type="button"
        disabled={ocupado || !codigoModelo || combinaciones === 0 || combinaciones > 60}
        onClick={generar}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
      >
        {ocupado && <Loader2 className="h-4 w-4 animate-spin" />} Generar variantes
      </button>
      {combinaciones > 60 && <p className="text-xs text-rose-300">Máximo 60 combinaciones por modelo.</p>}
    </div>
  );
}
