"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, KeyRound, Loader2 } from "lucide-react";

// ============================================================
// Alta de negocios (operación de PLATAFORMA). No requiere sesión de
// ningún negocio: se autoriza con el token de plataforma
// (PLATAFORMA_TOKEN), que nunca se guarda en el navegador.
// ============================================================

const sugerirCodigo = (nombre: string) =>
  nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export default function AltaNegocioPage() {
  const [token, setToken] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [admin, setAdmin] = useState({ nombre: "", username: "admin", password: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ codigo: string; nombre: string; admin: string } | null>(null);

  const crear = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/negocios", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-plataforma-token": token },
        body: JSON.stringify({ codigo, nombre, admin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el negocio");
      setCreado(data);
      setToken("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const valido =
    token.length >= 24 &&
    nombre.trim().length >= 2 &&
    /^[a-z0-9][a-z0-9-]{2,39}$/.test(codigo) &&
    admin.nombre.trim().length >= 2 &&
    admin.username.trim().length >= 3 &&
    admin.password.length >= 8;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Building2 className="h-6 w-6 text-acento" />
        <h1 className="text-2xl font-black text-gray-100">Alta de negocio</h1>
      </div>

      {creado ? (
        <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          <p className="text-base font-bold">Negocio &quot;{creado.nombre}&quot; creado.</p>
          <p>
            Código para iniciar sesión: <b className="font-mono">{creado.codigo}</b>
            <br />
            Usuario administrador: <b className="font-mono">{creado.admin}</b>
          </p>
          <p>Al entrar por primera vez se abrirá el asistente para configurar el giro.</p>
          <Link href="/login" className="inline-block rounded-xl bg-acento px-4 py-2 font-bold text-btn-ink">
            Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <form
          className="space-y-3 rounded-2xl border border-surface-600 bg-surface-800 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) crear();
          }}
        >
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-xs text-muted">
              <KeyRound className="h-3.5 w-3.5" /> Token de plataforma
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              className="input-dark"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Nombre del negocio</span>
            <input
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (!codigoTocado) setCodigo(sugerirCodigo(e.target.value));
              }}
              className="input-dark"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">
              Código para iniciar sesión (minúsculas, números y guiones)
            </span>
            <input
              value={codigo}
              onChange={(e) => {
                setCodigoTocado(true);
                setCodigo(e.target.value.toLowerCase());
              }}
              className="input-dark font-mono"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs text-muted">Nombre de quien administra</span>
              <input
                value={admin.nombre}
                onChange={(e) => setAdmin({ ...admin, nombre: e.target.value })}
                className="input-dark"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Usuario</span>
              <input
                value={admin.username}
                onChange={(e) => setAdmin({ ...admin, username: e.target.value })}
                autoComplete="off"
                className="input-dark"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Contraseña (mín. 8)</span>
              <input
                type="password"
                value={admin.password}
                onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                autoComplete="new-password"
                className="input-dark"
              />
            </label>
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={!valido || enviando}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} Crear negocio
          </button>
        </form>
      )}
    </main>
  );
}
