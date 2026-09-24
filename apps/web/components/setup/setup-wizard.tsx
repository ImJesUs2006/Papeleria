"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  ShoppingBasket,
  Wrench,
  Shuffle,
  Check,
  ArrowRight,
  ArrowLeft,
  Banknote,
  CreditCard,
  Landmark,
  Boxes,
  FileText,
  BarChart3,
  Truck,
  ScrollText,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/store/config";
import { RecoveryHistory } from "@/components/setup/recovery-history";
import {
  PRESETS_POR_NEGOCIO,
  type TipoNegocio,
  type MetodoPagoConfig,
  type FeatureFlags,
} from "@/lib/business-types";

const TIPO_UI: Record<
  TipoNegocio,
  { label: string; desc: string; icon: React.ElementType; cls: string }
> = {
  PAPELERIA_RETAIL: {
    label: "Papelería / Retail",
    desc: "Venta de artículos con inventario, etiquetas y punto de venta",
    icon: Store,
    cls: "border-neon-green/40 hover:border-neon-green",
  },
  ABARROTES: {
    label: "Abarrotes",
    desc: "Productos de consumo diario, facturación y proveedores",
    icon: ShoppingBasket,
    cls: "border-neon-cyan/40 hover:border-neon-cyan",
  },
  SERVICIOS: {
    label: "Servicios",
    desc: "Sin inventario físico; cobro por servicios y transferencias",
    icon: Wrench,
    cls: "border-neon-magenta/40 hover:border-neon-magenta",
  },
  MIXTO: {
    label: "Mixto",
    desc: "Productos y servicios; todos los módulos activos",
    icon: Shuffle,
    cls: "border-neon-purple/40 hover:border-neon-purple",
  },
};

const METODO_UI: Record<
  MetodoPagoConfig,
  { label: string; desc: string; icon: React.ElementType }
> = {
  EFECTIVO: { label: "Efectivo", desc: "Cobro en caja", icon: Banknote },
  TARJETA_TERMINAL: { label: "Terminal", desc: "Tarjeta física / chip", icon: CreditCard },
  TRANSFERENCIA: { label: "Transferencia", desc: "SPEI / pago digital", icon: Landmark },
  CREDITO_TIENDA: {
    label: "Crédito de Tienda",
    desc: "Cargar a saldo del cliente (CRM)",
    icon: Users,
  },
};

const FLAG_UI: Record<keyof FeatureFlags, { label: string; desc: string; icon: React.ElementType }> = {
  inventario: { label: "Inventario", desc: "Stock, etiquetas, carga masiva", icon: Boxes },
  facturacion: { label: "Facturación", desc: "Comprobantes / CFDI", icon: FileText },
  dashboard: { label: "Dashboard", desc: "Métricas y gráficas", icon: BarChart3 },
  proveedores: { label: "Proveedores", desc: "Cadena de suministro", icon: Truck },
  bitacora: { label: "Bitácora", desc: "Auditoría de acciones", icon: ScrollText },
};

const PASOS = ["tipo", "pagos", "modulos", "resumen"] as const;
type Paso = (typeof PASOS)[number];

const FLAG_KEYS = Object.keys(PRESETS_POR_NEGOCIO.PAPELERIA_RETAIL.featureFlags) as Array<
  keyof FeatureFlags
>;

export function SetupWizard() {
  const router = useRouter();
  const refreshConfig = useConfigStore((s) => s.hydrate);

  const [paso, setPaso] = useState<Paso>("tipo");
  const [tipo, setTipo] = useState<TipoNegocio | null>(null);
  const [metodos, setMetodos] = useState<MetodoPagoConfig[]>([]);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAbierto, setRecoveryAbierto] = useState(false);

  const preset = useMemo(() => (tipo ? PRESETS_POR_NEGOCIO[tipo] : null), [tipo]);

  const elegirTipo = (t: TipoNegocio) => {
    setTipo(t);
    const p = PRESETS_POR_NEGOCIO[t];
    setMetodos([...p.metodosPago]);
    setFlags({ ...p.featureFlags });
    setError(null);
  };

  const toggleMetodo = (m: MetodoPagoConfig) =>
    setMetodos((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );

  const toggleFlag = (k: keyof FeatureFlags) =>
    setFlags((prev) => (prev ? { ...prev, [k]: !prev[k] } : prev));

  const siguiente = () => {
    if (paso === "tipo" && !tipo) {
      setError("Selecciona el tipo de negocio para precargar la interfaz.");
      return;
    }
    if (paso === "pagos" && metodos.length === 0) {
      setError("Selecciona al menos un método de pago.");
      return;
    }
    setError(null);
    const idx = PASOS.indexOf(paso);
    setPaso(PASOS[Math.min(idx + 1, PASOS.length - 1)]);
  };

  const atras = () => {
    setError(null);
    const idx = PASOS.indexOf(paso);
    setPaso(PASOS[Math.max(idx - 1, 0)]);
  };

  const completar = async () => {
    if (!tipo || !flags) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreNegocio: "Mi Negocio",
          tipoNegocio: tipo,
          ivaRate: 16,
          featureFlags: flags,
          metodosPago: metodos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      await refreshConfig();
      router.replace("/cobro");
      router.refresh();
    } catch (e: any) {
      setError(e.message || "No se pudo completar la configuración");
    } finally {
      setGuardando(false);
    }
  };

  const pasoIndex = PASOS.indexOf(paso);

  return (
    <div className="min-h-screen bg-app flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl"
      >
        <div className="mb-6">
          <h1 className="text-xl font-black text-gray-100">Configura tu sistema</h1>
          <p className="text-xs text-muted">
            Plantilla universal · Marca Blanca · 4 pasos
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {PASOS.map((p, i) => (
            <div key={p} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  "h-1 flex-1 rounded-full transition-all",
                  i <= pasoIndex ? "bg-neon-green shadow-neon" : "bg-surface-600"
                )}
              />
            </div>
          ))}
        </div>

        <div className="bg-surface-800 border border-surface-600 rounded-2xl p-6">
          <AnimatePresence mode="wait">
            {paso === "tipo" && (
              <PasoClave key="tipo" titulo="¿Qué tipo de negocio?">
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(TIPO_UI) as TipoNegocio[]).map((t) => {
                    const meta = TIPO_UI[t];
                    const Icon = meta.icon;
                    const activo = tipo === t;
                    return (
                      <motion.button
                        key={t}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => elegirTipo(t)}
                        className={cn(
                          "border rounded-xl p-4 text-left transition-all bg-surface-700",
                          meta.cls,
                          activo && "bg-surface-600 ring-2 ring-offset-0"
                        )}
                      >
                        <Icon className={cn("h-5 w-5 mb-2", activo ? "text-neon-green" : "text-muted")} />
                        <p className="font-bold text-gray-100 text-sm">{meta.label}</p>
                        <p className="text-[11px] text-muted mt-0.5 leading-snug">{meta.desc}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </PasoClave>
            )}

            {paso === "pagos" && (
              <PasoClave key="pagos" titulo="Tipos de pago que aceptas">
                <div className="grid grid-cols-3 gap-3">
                  {(Object.keys(METODO_UI) as MetodoPagoConfig[]).map((m) => {
                    const meta = METODO_UI[m];
                    const Icon = meta.icon;
                    const activo = metodos.includes(m);
                    return (
                      <motion.button
                        key={m}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => toggleMetodo(m)}
                        className={cn(
                          "rounded-xl p-4 border text-left transition-all bg-surface-700 flex flex-col items-center text-center",
                          activo
                            ? "border-neon-cyan bg-surface-600"
                            : "border-surface-500 opacity-70"
                        )}
                      >
                        <Icon className={cn("h-5 w-5 mb-2", activo ? "text-neon-cyan" : "text-muted")} />
                        <p className="font-bold text-gray-100 text-sm">{meta.label}</p>
                        <p className="text-[11px] text-muted mt-0.5">{meta.desc}</p>
                        <div
                          className={cn(
                            "mt-2.5 h-4 w-4 rounded-full border-2 flex items-center justify-center transition-all",
                            activo ? "border-neon-cyan bg-neon-cyan" : "border-surface-400"
                          )}
                        >
                          {activo && <Check className="h-2.5 w-2.5 text-btn-ink" />}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </PasoClave>
            )}

            {paso === "modulos" && flags && (
              <PasoClave
                key="modulos"
                titulo="Módulos del sistema"
                subtitulo="Precargados según tu tipo de negocio; puedes ajustarlos."
              >
                <div className="space-y-2">
                  {FLAG_KEYS.map((k) => {
                    const meta = FLAG_UI[k];
                    const Icon = meta.icon;
                    const activo = flags[k];
                    return (
                      <button
                        key={k}
                        onClick={() => toggleFlag(k)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-xl p-3 border transition-all bg-surface-700 text-left",
                          activo ? "border-neon-green/50" : "border-surface-500 opacity-60"
                        )}
                      >
                        <div
                          className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center",
                            activo ? "bg-neon-green/10" : "bg-surface-600"
                          )}
                        >
                          <Icon className={cn("h-4 w-4", activo ? "text-neon-green" : "text-muted")} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-100 text-sm">{meta.label}</p>
                          <p className="text-[11px] text-muted">{meta.desc}</p>
                        </div>
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                            activo ? "border-neon-green bg-neon-green" : "border-surface-400"
                          )}
                        >
                          {activo && <Check className="h-3 w-3 text-btn-ink" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </PasoClave>
            )}

            {paso === "resumen" && tipo && flags && (
              <PasoClave key="resumen" titulo="Confirma la definición del negocio">
                <div className="space-y-3">
                  <ResumenRow label="Tipo de negocio" value={TIPO_UI[tipo].label} />
                  <ResumenRow
                    label="Tipos de pago"
                    value={metodos.length ? metodos.length + " habilitados" : "Ninguno"}
                  />
                  <ResumenRow
                    label="Módulos activos"
                    value={FLAG_KEYS.filter((k) => flags[k]).length + " de " + FLAG_KEYS.length}
                  />
                  <div className="flex flex-wrap gap-2">
                    {metodos.map((m) => {
                      const Icon = METODO_UI[m].icon;
                      return (
                        <span key={m} className="flex items-center gap-1.5 bg-surface-700 rounded-full px-3 py-1 text-xs text-gray-200">
                          <Icon className="h-3 w-3 text-neon-cyan" /> {METODO_UI[m].label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </PasoClave>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5"
              >
                <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
                <p className="text-sm text-gray-100">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={atras}
              disabled={paso === "tipo" || guardando}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-muted hover:text-gray-100 transition-colors disabled:opacity-40 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Atrás
            </button>

            {paso !== "resumen" ? (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={siguiente}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-green text-btn-ink font-bold shadow-neon text-sm"
              >
                Continuar <ArrowRight className="h-4 w-4" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={completar}
                disabled={guardando}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-green text-btn-ink font-bold shadow-neon disabled:opacity-60 text-sm"
              >
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {guardando ? "Configurando..." : "Guardar y empezar"}
              </motion.button>
            )}
          </div>

          {paso === "resumen" && (
            <div className="mt-4 border-t border-surface-600 pt-3 flex justify-center">
              <button
                onClick={() => setRecoveryAbierto(true)}
                className="text-[11px] text-muted hover:text-neon-cyan flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Ver historial de recuperación
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted mt-5">
          Cambiar la interfaz por tipo de negocio no elimina datos. Cada cambio firma una nueva
          versión de configuración.
        </p>
      </motion.div>

      <RecoveryHistory
        open={recoveryAbierto}
        onClose={() => setRecoveryAbierto(false)}
        onRestored={async () => {
          await refreshConfig();
          router.replace("/cobro");
          router.refresh();
        }}
      />
    </div>
  );
}

function PasoClave({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.18 }}
    >
      <h2 className="text-xl font-black text-gray-100 mb-1">{titulo}</h2>
      {subtitulo && <p className="text-sm text-muted mb-5">{subtitulo}</p>}
      <div className={subtitulo ? "" : "mt-5"}>{children}</div>
    </motion.div>
  );
}

function ResumenRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-surface-700 rounded-xl px-4 py-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-bold text-gray-100">{value}</span>
    </div>
  );
}