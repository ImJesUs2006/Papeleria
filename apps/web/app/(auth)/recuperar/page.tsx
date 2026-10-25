"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { PieLegal } from "@/components/pie-legal";

// Pide un enlace para restablecer la contraseña. La respuesta es la misma
// exista o no el usuario: no se revela quién tiene cuenta.
export default function RecuperarClave() {
  const [negocio, setNegocio] = useState("");
  const [usuario, setUsuario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState<{ correoConfigurado: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setNegocio(localStorage.getItem("papeleria-negocio") ?? "");
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocio: negocio.trim() || undefined, usuario }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo enviar la solicitud");
      setListo({ correoConfigurado: d.correoConfigurado === true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    "w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:outline-none";

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-surface-600 bg-surface-800 p-8">
          <h1 className="text-xl font-black text-gray-100">Recuperar contraseña</h1>
          {listo ? (
            <div className="mt-4 space-y-3 text-sm" data-testid="recuperar-listo">
              <MailCheck className="h-8 w-8 text-neon-green" />
              <p className="text-gray-100">
                Si el usuario existe y tiene un correo registrado, le enviamos un enlace para elegir una
                contraseña nueva. Revisa tu bandeja (y la de spam); el enlace vale 1 hora.
              </p>
              <p className="text-muted">
                {listo.correoConfigurado
                  ? "¿No te llegó? Pide a la administradora de tu negocio que te restablezca la contraseña desde Configuración → Usuarios."
                  : "Este sistema todavía no tiene configurado el envío de correos: pide a la administradora de tu negocio que te restablezca la contraseña desde Configuración → Usuarios."}
              </p>
            </div>
          ) : (
            <form onSubmit={enviar} className="mt-4 space-y-4">
              <p className="text-sm text-muted">Te enviaremos un enlace al correo que tu negocio registró para tu usuario.</p>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">Negocio</span>
                <input
                  value={negocio}
                  onChange={(e) => setNegocio(e.target.value)}
                  placeholder="Código de tu negocio (opcional si solo hay uno)"
                  autoCapitalize="none"
                  className={campo}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-muted">Usuario</span>
                <input
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Tu usuario"
                  autoFocus
                  autoCapitalize="none"
                  className={campo}
                  data-testid="recuperar-usuario"
                />
              </label>
              {error && <p className="rounded-lg bg-neon-red/10 px-3 py-2 text-sm text-neon-red">{error}</p>}
              <button
                type="submit"
                disabled={enviando || !usuario.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon-green py-3 font-bold text-btn-ink disabled:bg-surface-600 disabled:text-muted"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar enlace
              </button>
            </form>
          )}
          <Link href="/login" className="mt-5 inline-flex items-center gap-1 text-sm text-muted hover:text-gray-100">
            <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
          </Link>
        </div>
        <PieLegal />
      </div>
    </div>
  );
}
