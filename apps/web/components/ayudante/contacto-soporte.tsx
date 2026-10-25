"use client";

import { useEffect, useState } from "react";
import { LifeBuoy } from "lucide-react";
import type { ContactoSoporte } from "@/lib/soporte";

/** Pie del ayudante: cómo hablar con una persona del soporte (si está configurado). */
export function ContactoSoporteAyudante() {
  const [c, setC] = useState<ContactoSoporte | null>(null);
  useEffect(() => {
    fetch("/api/soporte")
      .then((r) => (r.ok ? r.json() : null))
      .then(setC)
      .catch(() => {});
  }, []);
  if (!c?.whatsapp && !c?.correo) return null;
  return (
    <div className="border-t border-surface-600 p-3 text-xs text-muted" data-testid="contacto-soporte">
      <p className="mb-1 flex items-center gap-1.5 font-bold text-gray-200">
        <LifeBuoy className="h-3.5 w-3.5 text-amber-300" /> ¿Prefieres hablar con una persona?
      </p>
      <p className="flex flex-wrap gap-x-3">
        {c.whatsapp && (
          <a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="font-semibold text-acento hover:underline">
            WhatsApp
          </a>
        )}
        {c.correo && (
          <a href={`mailto:${c.correo}`} className="font-semibold text-acento hover:underline">
            {c.correo}
          </a>
        )}
        {c.horario && <span>{c.horario}</span>}
      </p>
    </div>
  );
}
