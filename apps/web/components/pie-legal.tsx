"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import type { ContactoSoporte } from "@/lib/soporte";

/** Pie de las pantallas públicas: ayuda de soporte y enlaces legales. */
export function PieLegal() {
  const [soporte, setSoporte] = useState<ContactoSoporte | null>(null);
  useEffect(() => {
    fetch("/api/soporte")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSoporte)
      .catch(() => {});
  }, []);
  return (
    <div className="mt-4 space-y-2 text-center text-xs text-muted" data-testid="pie-legal">
      {(soporte?.whatsapp || soporte?.correo) && (
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>¿Necesitas ayuda?</span>
          {soporte.whatsapp && (
            <a href={`https://wa.me/${soporte.whatsapp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-acento hover:underline">
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
          {soporte.correo && (
            <a href={`mailto:${soporte.correo}`} className="inline-flex items-center gap-1 font-semibold text-acento hover:underline">
              <Mail className="h-3.5 w-3.5" /> {soporte.correo}
            </a>
          )}
          {soporte.horario && <span>· {soporte.horario}</span>}
        </p>
      )}
      <p>
        <Link href="/privacidad" className="hover:text-gray-200 hover:underline">
          Aviso de privacidad
        </Link>
        {" · "}
        <Link href="/terminos" className="hover:text-gray-200 hover:underline">
          Términos y condiciones
        </Link>
      </p>
    </div>
  );
}
