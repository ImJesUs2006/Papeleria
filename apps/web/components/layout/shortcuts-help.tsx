"use client";

import { useState } from "react";
import { Keyboard } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useHotkeys } from "@/hooks/use-hotkeys";

const ATAJOS: { teclas: string; descripcion: string }[] = [
  { teclas: "Ctrl + P", descripcion: "Cobrar la venta actual" },
  { teclas: "⊞ / ⌘ + K", descripcion: "Buscar producto en el punto de venta" },
  { teclas: "Ctrl + B", descripcion: "Enfocar el buscador de productos" },
  { teclas: "F2", descripcion: "Abrir el buscador de productos" },
  { teclas: "Esc", descripcion: "Cerrar ventana o comprobante" },
  { teclas: "?", descripcion: "Mostrar esta ayuda de atajos" },
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useHotkeys(
    {
      "?": () => setOpen((v) => !v),
      "shift+/": () => setOpen((v) => !v),
    },
    { enabled: true }
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Atajos de teclado"
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted hover:text-neon-blue hover:bg-surface-700 transition-all"
      >
        <Keyboard className="h-4 w-4" />
        <span>Atajos de teclado</span>
        <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-surface-700 text-muted">?</kbd>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Atajos de teclado" subtitle="Acelera la operación de caja">
        <ul className="space-y-2">
          {ATAJOS.map((a) => (
            <li key={a.teclas} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-300">{a.descripcion}</span>
              <kbd className="shrink-0 text-[11px] font-mono px-2 py-1 rounded-md bg-surface-700 border border-surface-600 text-gray-200">
                {a.teclas}
              </kbd>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}