"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

export default function LoginScreen() {
  // Código del negocio (multi-tenant). Opcional si la instalación tiene uno solo;
  // se recuerda en este dispositivo para no teclearlo en cada turno.
  const [negocio, setNegocio] = useState("");
  useEffect(() => {
    try {
      setNegocio(localStorage.getItem("papeleria-negocio") ?? "");
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, negocio: negocio.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Usuario o contraseña incorrectos");
        return;
      }

      const user = await res.json();
      try {
        if (user.negocio?.codigo) localStorage.setItem("papeleria-negocio", user.negocio.codigo);
      } catch {
        /* almacenamiento no disponible */
      }
      login(user);
      // Primer arranque: la administradora configura el negocio.
      if (user.setupPendiente && user.rol === "ADMINISTRADORA") {
        window.location.href = "/setup";
      } else {
        window.location.href = "/cobro";
      }
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.h1
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 10, delay: 0.2 }}
            className="text-4xl font-black tracking-tight"
          >
            <span className="text-neon-green">Pape</span>
            <span className="text-gray-100">lería</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted mt-2"
          >
            Sistema de Gestión · Plantilla Universal
          </motion.p>
        </div>

        <motion.div
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
          }}
          initial="hidden"
          animate="show"
          className="bg-surface-800 border border-surface-600 rounded-2xl p-8"
        >
          <form onSubmit={handleLogin} className="space-y-5">
            <label className="block">
              <span className="text-sm text-muted mb-1 block">Negocio</span>
              <input
                type="text"
                value={negocio}
                onChange={(e) => setNegocio(e.target.value)}
                placeholder="Código de tu negocio (opcional si solo hay uno)"
                disabled={isLoading}
                autoComplete="organization"
                autoCapitalize="none"
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all disabled:opacity-50"
              />
            </label>
            <motion.label
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
              }}
              className="block"
            >
              <span className="text-sm text-muted mb-1 block">Usuario</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu usuario"
                autoFocus
                disabled={isLoading}
                autoComplete="username"
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all disabled:opacity-50"
              />
            </motion.label>

            <motion.label
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
              }}
              className="block"
            >
              <span className="text-sm text-muted mb-1 block">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all disabled:opacity-50"
              />
            </motion.label>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-neon-red bg-neon-red/10 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
              }}
            >
              <motion.button
                whileHover={isLoading ? undefined : { scale: 1.01 }}
                whileTap={isLoading ? undefined : { scale: 0.97 }}
                type="submit"
                disabled={isLoading || !username || !password}
                aria-busy={isLoading}
                className={cn(
                  "w-full py-3 rounded-xl font-bold text-lg transition-all",
                  username && password
                    ? "bg-neon-green text-btn-ink shadow-neon"
                    : "bg-surface-600 text-muted cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <span className="inline-flex items-center justify-center gap-1.5 h-9">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="h-2.5 w-2.5 rounded-full bg-btn-ink"
                        animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                        transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.14 }}
                      />
                    ))}
                  </span>
                ) : (
                  "Ingresar"
                )}
              </motion.button>
            </motion.div>
          </form>
        </motion.div>

        <p className="text-center text-xs text-muted mt-4">
          Contacta al administrador para obtener credenciales
        </p>
      </motion.div>
    </div>
  );
}
