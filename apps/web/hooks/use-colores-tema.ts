"use client";

import { useEffect, useState } from "react";

// ============================================================
// Colores de gráficas que SIGUEN el tema activo (neón oscuro o claros).
// Las gráficas SVG no heredan las clases de Tailwind: leen aquí los
// tokens del tema (globals.css) y se re-pintan al cambiar data-theme.
// ============================================================

export interface ColoresTema {
  claro: boolean;
  texto: string;
  textoSuave: string;
  rejilla: string;
  tooltipFondo: string;
  tooltipBorde: string;
  serie: [string, string, string];
}

const OSCURO: ColoresTema = {
  claro: false,
  texto: "#e5e7eb",
  textoSuave: "#9ca3af",
  rejilla: "#2e2e2e",
  tooltipFondo: "#111111",
  tooltipBorde: "#333333",
  serie: ["#00ff88", "#00d4ff", "#ff0080"],
};

function leer(): ColoresTema {
  if (typeof document === "undefined") return OSCURO;
  const raiz = document.documentElement;
  const tema = raiz.dataset.theme ?? "neon";
  if (tema === "neon") return OSCURO;
  const css = getComputedStyle(raiz);
  const rgb = (v: string, fallback: string) => {
    const valor = css.getPropertyValue(v).trim();
    return valor ? `rgb(${valor})` : fallback;
  };
  return {
    claro: true,
    texto: rgb("--gray-200-rgb", "#1f2937"),
    textoSuave: rgb("--muted-rgb", "#6b7280"),
    rejilla: rgb("--surface-500-rgb", "#e2e8f0"),
    tooltipFondo: rgb("--surface-800-rgb", "#ffffff"),
    tooltipBorde: rgb("--surface-500-rgb", "#e2e8f0"),
    serie: ["#047857", "#0e7490", "#be185d"],
  };
}

export function useColoresTema(): ColoresTema {
  const [colores, setColores] = useState<ColoresTema>(OSCURO);
  useEffect(() => {
    setColores(leer());
    const obs = new MutationObserver(() => setColores(leer()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return colores;
}
