"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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

// Nombre de cada pantalla para el título de la pestaña: "Cobro · Papelería Luna".
const TITULOS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/cobro": "Cobro",
  "/caja": "Caja",
  "/apartados": "Apartados",
  "/devoluciones": "Devoluciones",
  "/promociones": "Promociones",
  "/clientes": "Clientes",
  "/inventario": "Inventario",
  "/lotes": "Lotes y series",
  "/traspasos": "Traspasos",
  "/proveedores": "Proveedores",
  "/pedidos": "Pedidos",
  "/reportes": "Reportes",
  "/facturacion": "Facturación",
  "/bitacora": "Bitácora",
  "/configuracion": "Configuración",
  "/setup": "Configuración inicial",
  "/login": "Iniciar sesión",
  "/plataforma": "Consola de plataforma",
};
const ICONO_DEFECTO = "/icons/icon-128.png";

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

  // Identidad del negocio en la pestaña: su nombre en el título y su logo como icono.
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    const seccion = Object.entries(TITULOS).find(([ruta]) => pathname === ruta || pathname.startsWith(`${ruta}/`))?.[1];
    const negocio = pathname.startsWith("/plataforma") || pathname === "/login" ? null : config?.nombreNegocio;
    document.title = [seccion, negocio].filter(Boolean).join(" · ") || "Punto de venta";

    const href = !pathname.startsWith("/plataforma") && config?.logo ? config.logo : ICONO_DEFECTO;
    let icono = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!icono) {
      icono = document.createElement("link");
      icono.rel = "icon";
      document.head.appendChild(icono);
    }
    if (icono.href !== href) icono.href = href;
  }, [pathname, config?.nombreNegocio, config?.logo]);

  return null;
}