"use client";

import { useEffect, useRef } from "react";

// ============================================================
// useHotkeys — atajos de teclado globales.
//   useHotkeys({ "ctrl+p": cobrar, Escape: cerrar, "mod+enter": enviar })
// "mod" = Ctrl en Windows/Linux, Cmd en macOS.
// Por defecto se ignoran las teclas mientras se escribe en un input,
// salvo que el atajo use modificadores (Ctrl/Cmd/Alt).
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

      const usaModificador = /mod|ctrl|alt|meta|shift/.test(entrada.combo);
      if (!allowInInputs && enCampoDeTexto(e.target) && !usaModificador) return;

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