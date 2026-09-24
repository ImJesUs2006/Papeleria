"use client";

import { useEffect, useRef } from "react";

// ============================================================
// useHotkeys — atajos de teclado globales.
//   useHotkeys({ "ctrl+p": cobrar, Escape: cerrar, "mod+enter": enviar })
// "mod" = Ctrl en Windows/Linux, Cmd en macOS.
//
// Regla anti-interferencia (Fase B): por defecto los atajos NUNCA se
// disparan mientras el foco está en un campo de texto (input, textarea,
// select, contentEditable), aunque lleven modificadores — así "shift+/"
// no abre la ayuda mientras el operador escribe "?" en un buscador.
// Los componentes que SÍ quieren dispararse desde un input lo indican
// explícitamente con `allowInInputs: true` (p. ej. Ctrl+P del POS o
// Escape para cerrar un modal que contiene un formulario).
// ============================================================

export type HotkeyHandler = (e: KeyboardEvent) => void;

interface Options {
  enabled?: boolean;
  allowInInputs?: boolean;
  preventDefault?: boolean;
}

function esMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function normalizar(combo: string): string {
  return combo
    .toLowerCase()
    .split("+")
    .map((p) => {
      const t = p.trim();
      if (t === "ctrl" || t === "cmd" || t === "meta") return "mod";
      return t;
    })
    .sort()
    .join("+");
}

function comboDesdeEvento(e: KeyboardEvent): string {
  const partes: string[] = [];
  if (e.ctrlKey || e.metaKey) partes.push("mod");
  if (e.altKey) partes.push("alt");
  if (e.shiftKey) partes.push("shift");

  const key = e.key.toLowerCase();
  if (!["control", "meta", "alt", "shift"].includes(key)) {
    partes.push(key === " " ? "space" : key);
  }
  return partes.sort().join("+");
}

function enCampoDeTexto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable
  );
}

export function useHotkeys(
  hotkeys: Record<string, HotkeyHandler>,
  options: Options = {}
) {
  const { enabled = true, allowInInputs = false, preventDefault = true } = options;

  const ref = useRef(hotkeys);
  ref.current = hotkeys;

  useEffect(() => {
    if (!enabled) return;

    const mapNorm = new Map<string, { combo: string; handler: HotkeyHandler }>();
    for (const combo of Object.keys(ref.current)) {
      mapNorm.set(normalizar(combo), { combo: combo.toLowerCase(), handler: ref.current[combo] });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const evento = comboDesdeEvento(e);
      const entrada = mapNorm.get(normalizar(evento));
      if (!entrada) return;

      // Fase B: si el foco está en un campo de texto y el componente no lo
      // habilitó, el atajo no se procesa — la edición gana siempre.
      if (!allowInInputs && enCampoDeTexto(e.target)) return;

      // Evita que el navegador se apropie de la tecla (Ctrl+P imprime,
      // "/" enfoca la búsqueda instantánea, F1 abre la ayuda…). Solo al
      // disparar realmente el atajo y solo cuando el caller lo solicitó.
      if (preventDefault) e.preventDefault();
      entrada.handler(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, allowInInputs, preventDefault]);
}

export function usarAtajoUI() {
  return { esMac: esMac() };
}