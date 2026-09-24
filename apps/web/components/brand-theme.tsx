"use client";

import { useEffect } from "react";
import { useConfigStore } from "@/store/config";
import {
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
  type TemaBase,
} from "@/lib/business-types";

// ============================================================
// Sistema de temas (Fase 3).
// 1) Inyecta `data-theme="<temaBase>"` en <html>:
//    neon | minimalista | brutalista | corporativo. Las variables
//    CSS semánticas de Tailwind (bg-surface, shadow-card, texto)
//    cambian sus valores nativos según ese atributo (globals.css).
// 2) Aplica `colorAcento` como --neon-green / --marca-color /
//    --color-accento para botones principales y acentos (en
//    cualquier tema). Complementa a layout.tsx, que pone el
//    default `data-theme="neon"` en el SSR para evitar parpadeo.
// ============================================================

const TEMAS_VALIDOS = new Set<string>([
  "neon",
  "minimalista",
  "brutalista",
  "corporativo",
]);

export function BrandTheme() {
  const config = useConfigStore((s) => s.config);
  const hydrate = useConfigStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const base: TemaBase = config?.temaBase || DEFAULT_TEMA_BASE;
    const tema = base.toLowerCase();
    const acento =
      typeof config?.colorAcento === "string" && /^#[0-9a-fA-F]{6}$/.test(config.colorAcento)
        ? config.colorAcento
        : DEFAULT_COLOR_ACENTO;

    const root = document.documentElement;
    root.setAttribute("data-theme", TEMAS_VALIDOS.has(tema) ? tema : "neon");
    root.style.setProperty("--neon-green", acento);
    root.style.setProperty("--marca-color", acento);
    root.style.setProperty("--color-accento", acento);
  }, [config?.temaBase, config?.colorAcento]);

  return null;
}