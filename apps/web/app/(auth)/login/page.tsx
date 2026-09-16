"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

export default function LoginScreen() {
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
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Usuario o contraseña incorrectos");
        return;
      }

      const user = await res.json();
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
    <div className="min-h-screen flex items-center justify-center bg-surface-900 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.h1
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 10, delay: 0.2 }}
            className="text-4xl font-black tracking-tight"
          >
            <span className="text-neon-green">Pape</span>
            <span className="text-gray-100">lería</span>
          </motion.h1>
          <p className="text-muted mt-2">Sistema de Gestión</p>
        </div>

        <div className="bg-surface-800 border border-surface-600 rounded-2xl p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <label className="block">
              <span className="text-sm text-muted mb-1 block">Usuario</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu usuario"
                autoFocus
                autoComplete="username"
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </label>

            <label className="block">
              <span className="text-sm text-muted mb-1 block">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </label>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-neon-red bg-neon-red/10 rounded-lg px-3 py-2"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={isLoading || !username || !password}
              className={cn(
                "w-full py-3 rounded-xl font-bold text-lg transition-all",
                username && password
                  ? "bg-neon-green text-surface-900 shadow-neon"
                  : "bg-surface-600 text-muted cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <div className="h-5 w-5 border-2 border-surface-900 border-t-transparent rounded-full animate-spin mx-auto" />
              ) : (
                "Ingresar"
              )}
            </motion.button>
          </form>
        </div>

        <p className="text-center text-xs text-muted mt-4">
          Contacta al administrador para obtener credenciales
        </p>
      </motion.div>
    </div>
  );
}
