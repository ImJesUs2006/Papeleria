"use client";

import { useEffect, useState } from "react";
import { LifeBuoy, LogOut } from "lucide-react";

/** Aviso permanente mientras el soporte de la plataforma opera dentro del negocio. */
export function BannerSoporte() {
  const [hasta, setHasta] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasta(d?.soporte ? d.soporteHasta ?? "" : null))
      .catch(() => {});
  }, []);
  if (hasta === null) return null;
  const salir = async () => {
    await fetch("/api/auth/login", { method: "DELETE" }).catch(() => {});
    window.location.href = "/plataforma";
  };
  return (
    <div
      role="status"
      data-testid="banner-soporte"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-2 text-sm font-bold text-black"
    >
      <LifeBuoy className="h-4 w-4" />
      <span>
        Modo soporte de la plataforma
        {hasta && ` · la sesión termina a las ${new Date(hasta).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`}
      </span>
      <button type="button" onClick={salir} className="inline-flex items-center gap-1 rounded-lg bg-black/15 px-2 py-0.5 hover:bg-black/25">
        <LogOut className="h-3.5 w-3.5" /> Salir
      </button>
    </div>
  );
}
