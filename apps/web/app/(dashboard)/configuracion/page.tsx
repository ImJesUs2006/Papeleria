"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Settings2,
  Save,
  Loader2,
  Check,
  AlertTriangle,
  UserCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UserManagement } from "@/components/configuracion/user-management";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth";
import {
  TIPO_NEGOCIO,
  METODOS_PAGO_DISPONIBLES,
  VALID_FLAG_KEYS,
  DEFAULT_FEATURE_FLAGS,
  type BusinessConfig,
  type FeatureFlags,
  type MetodoPagoConfig,
  type TipoNegocio,
} from "@/lib/business-types";
import { cn } from "@/lib/utils";

const FLAG_LABELS: Record<keyof FeatureFlags, string> = {
  inventario: "Inventario",
  facturacion: "Facturación electrónica",
  dashboard: "Dashboard de métricas",
  proveedores: "Proveedores y pedidos",
  bitacora: "Bitácora de auditoría",
};

/**
 * Normaliza una configuración que puede venir incompleta o con módulos
 * incompatibles (p. ej. creada bajo otro tipo de negocio) para que el
 * renderizado nunca reciba `undefined`/valores fuera de rango.
 */
function normalizeConfig(raw: any): BusinessConfig {
  const flagsRaw = raw?.featureFlags && typeof raw.featureFlags === "object" ? raw.featureFlags : {};
  const featureFlags = VALID_FLAG_KEYS.reduce<FeatureFlags>(
    (acc, key) => {
      acc[key] = typeof flagsRaw[key] === "boolean" ? flagsRaw[key] : DEFAULT_FEATURE_FLAGS[key];
      return acc;
    },
    { ...DEFAULT_FEATURE_FLAGS }
  );

  const metodosRaw = Array.isArray(raw?.metodosPago) ? raw.metodosPago : [];
  const metodosPago = metodosRaw.filter(
    (m: unknown): m is MetodoPagoConfig =>
      typeof m === "string" && (METODOS_PAGO_DISPONIBLES as readonly string[]).includes(m)
  );

  const tipoNegocio: TipoNegocio =
    raw?.tipoNegocio && raw.tipoNegocio in TIPO_NEGOCIO
      ? (raw.tipoNegocio as TipoNegocio)
      : "PAPELERIA_RETAIL";

  const iva = Number(raw?.ivaRate);

  return {
    nombreNegocio: typeof raw?.nombreNegocio === "string" ? raw.nombreNegocio : "Mi Negocio",
    tipoNegocio,
    moneda: typeof raw?.moneda === "string" ? raw.moneda : "MXN",
    ivaRate: Number.isFinite(iva) ? iva : 16,
    featureFlags,
    metodosPago,
    politicaStockOffline:
      raw?.politicaStockOffline === "RECHAZAR" ? "RECHAZAR" : "PERMITIR_NEGATIVO",
    configVersion: Number.isFinite(Number(raw?.configVersion)) ? Number(raw.configVersion) : 1,
    setupPendiente: Boolean(raw?.setupPendiente),
  };
}

export default function ConfiguracionPage() {
  const { nombre, rol } = useAuthStore();
  const [tab, setTab] = useState<"usuarios" | "negocio">("usuarios");

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">Configuración</h2>
          <p className="text-sm text-muted">
            Gestión de usuarios, roles y parámetros del negocio
          </p>
        </motion.div>

        <div className="flex gap-1 mb-6 bg-surface-800 p-1 rounded-xl w-fit">
          {(
            [
              { id: "usuarios", label: "Usuarios", icon: Users },
              { id: "negocio", label: "Negocio", icon: Settings2 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === id ? "bg-surface-600 text-gray-100" : "text-muted hover:text-gray-100"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === "usuarios" ? (
            <motion.div
              key="usuarios"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center gap-2 text-xs text-muted mb-4">
                <UserCircle className="h-3.5 w-3.5" />
                Sesión actual: <span className="text-gray-200 font-medium">{nombre}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-purple/10 text-neon-purple font-bold">
                  {rol}
                </span>
              </div>
              <ErrorBoundary label="la gestión de usuarios">
                <UserManagement />
              </ErrorBoundary>
            </motion.div>
          ) : (
            <motion.div
              key="negocio"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ErrorBoundary label="la configuración del negocio">
                <NegocioConfigPanel />
              </ErrorBoundary>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

function NegocioConfigPanel() {
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracion/negocio", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar configuración");
        setConfig(normalizeConfig(data.config));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const guardar = async () => {
    if (!config) return;
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      const res = await fetch("/api/configuracion/negocio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreNegocio: config.nombreNegocio,
          tipoNegocio: config.tipoNegocio,
          moneda: config.moneda,
          ivaRate: Number(config.ivaRate),
          featureFlags: config.featureFlags,
          metodosPago: config.metodosPago,
          politicaStockOffline: config.politicaStockOffline,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggleFlag = (flag: keyof FeatureFlags) => {
    setConfig((c) => (c ? { ...c, featureFlags: { ...c.featureFlags, [flag]: !c.featureFlags[flag] } } : c));
  };

  const toggleMetodo = (m: MetodoPagoConfig) => {
    setConfig((c) => {
      if (!c) return c;
      const tiene = c.metodosPago.includes(m);
      const metodos = tiene
        ? c.metodosPago.filter((x) => x !== m)
        : [...c.metodosPago, m];
      return { ...c, metodosPago: metodos };
    });
  };

  if (loading) {
    return (
      <div className="bg-surface-800 border border-surface-600 rounded-2xl p-6 space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-2/3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-11 w-40" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center gap-3 bg-neon-red/10 border border-neon-red/40 rounded-2xl px-5 py-4 text-sm text-gray-100">
        <AlertTriangle className="h-5 w-5 text-neon-red" /> {error || "No se pudo cargar"}
      </div>
    );
  }

  return (
    <div className="bg-surface-800 border border-surface-600 rounded-2xl p-6 space-y-5">
      {error && (
        <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
          <AlertTriangle className="h-4 w-4 text-neon-red" /> {error}
        </div>
      )}
      {ok && (
        <div className="flex items-center gap-2 bg-neon-green/10 border border-neon-green/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
          <Check className="h-4 w-4 text-neon-green" /> Configuración guardada (v{config.configVersion})
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs text-muted mb-1 block">Nombre del negocio</span>
          <input
            value={config.nombreNegocio}
            onChange={(e) => setConfig({ ...config, nombreNegocio: e.target.value })}
            className="input-dark"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted mb-1 block">Tipo de negocio</span>
          <select
            value={config.tipoNegocio}
            onChange={(e) => setConfig({ ...config, tipoNegocio: e.target.value as TipoNegocio })}
            className="input-dark"
          >
            {Object.entries(TIPO_NEGOCIO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted mb-1 block">Moneda</span>
          <input
            value={config.moneda}
            onChange={(e) => setConfig({ ...config, moneda: e.target.value })}
            className="input-dark"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted mb-1 block">IVA (%)</span>
          <input
            type="number"
            value={config.ivaRate}
            onChange={(e) => setConfig({ ...config, ivaRate: Number(e.target.value) })}
            className="input-dark"
          />
        </label>
      </div>

      <div>
        <span className="text-xs text-muted mb-2 block">Módulos activos (Feature Flags)</span>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {VALID_FLAG_KEYS.map((flag) => (
            <button
              key={flag}
              onClick={() => toggleFlag(flag)}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all",
                config.featureFlags[flag]
                  ? "bg-neon-green/10 border-neon-green/40 text-gray-100"
                  : "bg-surface-700 border-surface-500 text-muted"
              )}
            >
              <span
                className={cn(
                  "h-4 w-4 rounded-md border flex items-center justify-center shrink-0",
                  config.featureFlags[flag]
                    ? "bg-neon-green border-neon-green"
                    : "border-surface-400"
                )}
              >
                {config.featureFlags[flag] && <Check className="h-3 w-3 text-surface-900" />}
              </span>
              {FLAG_LABELS[flag]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-xs text-muted mb-2 block">Métodos de pago aceptados</span>
        <div className="flex flex-wrap gap-2">
          {METODOS_PAGO_DISPONIBLES.map((m) => (
            <button
              key={m}
              onClick={() => toggleMetodo(m)}
              className={cn(
                "px-3 py-2 rounded-xl border text-xs font-bold transition-all",
                config.metodosPago.includes(m)
                  ? "bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan"
                  : "bg-surface-700 border-surface-500 text-muted"
              )}
            >
              {m.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <label className="block max-w-md">
        <span className="text-xs text-muted mb-1 block">
          Política de stock en modo offline
        </span>
        <select
          value={config.politicaStockOffline}
          onChange={(e) =>
            setConfig({
              ...config,
              politicaStockOffline: e.target.value as BusinessConfig["politicaStockOffline"],
            })
          }
          className="input-dark"
        >
          <option value="PERMITIR_NEGATIVO">
            Permitir ventas con stock negativo (con alerta)
          </option>
          <option value="RECHAZAR">Rechazar ventas sin existencias</option>
        </select>
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={guardar}
          disabled={guardando || config.metodosPago.length === 0}
          className={cn(
            "flex items-center gap-2 py-3 px-6 rounded-xl font-bold transition-all",
            !guardando && config.metodosPago.length > 0
              ? "bg-neon-green text-surface-900 shadow-neon"
              : "bg-surface-600 text-muted cursor-not-allowed"
          )}
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </button>
        <span className="text-xs text-muted">
          Versión actual: v{config.configVersion}
        </span>
      </div>
    </div>
  );
}