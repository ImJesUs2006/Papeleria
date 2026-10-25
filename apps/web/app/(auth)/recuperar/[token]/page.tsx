"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";

// Elegir la contraseña nueva con el enlace del correo.
export default function NuevaClave({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [estado, setEstado] = useState<"cargando" | "valido" | "invalido" | "listo">("cargando");
  const [quien, setQuien] = useState<{ nombre: string; username: string } | null>(null);
  const [error, setError] = useState("");
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/restablecer?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valido) {
          setQuien({ nombre: d.nombre, username: d.username });
          setEstado("valido");
        } else {
          setError(d.error || "El enlace no es válido");
          setEstado("invalido");
        }
      })
      .catch(() => {
        setError("No se pudo comprobar el enlace");
        setEstado("invalido");
      });
  }, [token]);

  const problema =
    clave.length > 0 && clave.length < 8
      ? "Debe tener al menos 8 caracteres"
      : repetir && repetir !== clave
        ? "Las contraseñas no coinciden"
        : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problema || clave.length < 8 || clave !== repetir) return;
    setGuardando(true);
    setError("");
    const r = await fetch("/api/auth/restablecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: clave }),
    });
    const d = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return setError(d.error || "No se pudo cambiar la contraseña");
    setEstado("listo");
  };

  const campo =
    "w-full rounded-xl border border-surface-500 bg-surface-700 px-4 py-3 text-gray-100 focus:border-neon-green focus:outline-none";

  return (
    <div className="flex min-h-screen items-center justify-center bg-app p-4">
      <div className="w-full max-w-md rounded-2xl border border-surface-600 bg-surface-800 p-8" data-testid="nueva-clave">
        <h1 className="text-xl font-black text-gray-100">Nueva contraseña</h1>
        {estado === "cargando" && <Loader2 className="mt-4 h-6 w-6 animate-spin text-muted" />}
        {estado === "invalido" && (
          <div className="mt-4 space-y-3 text-sm">
            <p className="rounded-lg bg-neon-red/10 px-3 py-2 text-neon-red">{error}</p>
            <Link href="/recuperar" className="font-semibold text-acento hover:underline">
              Pedir un enlace nuevo
            </Link>
          </div>
        )}
        {estado === "valido" && quien && (
          <form onSubmit={guardar} className="mt-4 space-y-4">
            <p className="text-sm text-muted">
              Para <span className="font-bold text-gray-100">{quien.nombre}</span> (usuario {quien.username}). Al
              guardarla se cierran las sesiones abiertas con la contraseña anterior.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">Contraseña nueva</span>
              <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" autoFocus className={campo} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted">Repítela</span>
              <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" className={campo} />
            </label>
            {(problema || error) && <p className="text-sm text-neon-red">{problema || error}</p>}
            <button
              type="submit"
              disabled={guardando || !!problema || clave.length < 8 || clave !== repetir}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-neon-green py-3 font-bold text-btn-ink disabled:bg-surface-600 disabled:text-muted"
            >
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar contraseña
            </button>
          </form>
        )}
        {estado === "listo" && (
          <div className="mt-4 space-y-3 text-sm" data-testid="clave-cambiada">
            <CheckCircle2 className="h-8 w-8 text-neon-green" />
            <p className="text-gray-100">Listo: ya puedes entrar con tu contraseña nueva.</p>
            <Link href="/login" className="inline-block rounded-xl bg-neon-green px-4 py-2 font-bold text-btn-ink">
              Iniciar sesión
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
