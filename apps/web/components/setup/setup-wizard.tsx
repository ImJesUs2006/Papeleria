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
  PartyPopper,
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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/store/config";
import {
  TIPO_NEGOCIO,
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
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="h-12 w-12 rounded-2xl bg-neon-green/10 flex items-center justify-center">
            <PartyPopper className="h-6 w-6 text-neon-green" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-100">
              Bienvenida a tu sistema
            </h1>
            <p className="text-sm text-muted">
              Plantilla universal · Marca Blanca · 4 pasos
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {PASOS.map((p, i) => (
            <div key={p} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  "h-2 flex-1 rounded-full transition-all",
                  i <= pasoIndex ? "bg-neon-green shadow-neon" : "bg-surface-600"
                )}
              />
            </div>
          ))}
        </div>

        <div className="bg-surface-800 border border-surface-600 rounded-3xl p-8">
          <AnimatePresence mode="wait">
            {paso === "tipo" && (
              <PasoClave key="tipo" titulo="¿Qué tipo de negocio?">
                <div className="grid grid-cols-2 gap-4">
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
                          "border-2 rounded-2xl p-5 text-left transition-all bg-surface-700",
                          meta.cls,
                          activo && "bg-surface-600 ring-2 ring-offset-0"
                        )}
                      >
                        <Icon className={cn("h-7 w-7 mb-3", activo ? "text-neon-green" : "text-muted")} />
                        <p className="font-bold text-gray-100 text-sm">{meta.label}</p>
                        <p className="text-xs text-muted mt-1 leading-snug">{meta.desc}</p>
                      </motion.button>
                    );
                  })}
                </div>
              </PasoClave>
            )}

            {paso === "pagos" && (
              <PasoClave key="pagos" titulo="Tipos de pago que aceptas">
                <div className="grid grid-cols-3 gap-4">
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
                          "rounded-2xl p-5 text-left border-2 transition-all bg-surface-700 flex flex-col items-center text-center",
                          activo
                            ? "border-neon-cyan bg-surface-600"
                            : "border-surface-500 opacity-70"
                        )}
                      >
                        <div
                          className={cn(
                            "h-9 w-9 rounded-xl flex items-center justify-center mb-3",
                            activo ? "bg-neon-cyan/10" : "bg-surface-600"
                          )}
                        >
                          <Icon className={cn("h-5 w-5", activo ? "text-neon-cyan" : "text-muted")} />
                        </div>
                        <p className="font-bold text-gray-100 text-sm">{meta.label}</p>
                        <p className="text-[11px] text-muted mt-1">{meta.desc}</p>
                        <div
                          className={cn(
                            "mt-3 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all",
                            activo ? "border-neon-cyan bg-neon-cyan" : "border-surface-400"
                          )}
                        >
                          {activo && <Check className="h-3 w-3 text-surface-900" />}
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
                titulo="Módulos del sistema (Feature Flags)"
                subtitulo="Se precargaron según tu tipo de negocio; puedes ajustarlos. La administradora los cambia solo aquí."
              >
                <div className="space-y-3">
                  {FLAG_KEYS.map((k) => {
                    const meta = FLAG_UI[k];
                    const Icon = meta.icon;
                    const activo = flags[k];
                    return (
                      <button
                        key={k}
                        onClick={() => toggleFlag(k)}
                        className={cn(
                          "w-full flex items-center gap-4 rounded-2xl p-4 border-2 transition-all bg-surface-700 text-left",
                          activo ? "border-neon-green/50" : "border-surface-500 opacity-60"
                        )}
                      >
                        <div
                          className={cn(
                            "h-10 w-10 rounded-xl flex items-center justify-center",
                            activo ? "bg-neon-green/10" : "bg-surface-600"
                          )}
                        >
                          <Icon className={cn("h-5 w-5", activo ? "text-neon-green" : "text-muted")} />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-gray-100 text-sm">{meta.label}</p>
                          <p className="text-xs text-muted">{meta.desc}</p>
                        </div>
                        <div
                          className={cn(
                            "h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all",
                            activo ? "border-neon-green bg-neon-green" : "border-surface-400"
                          )}
                        >
                          {activo && <Check className="h-3.5 w-3.5 text-surface-900" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </PasoClave>
            )}

            {paso === "resumen" && tipo && flags && (
              <PasoClave key="resumen" titulo="Confirma la definición del negocio">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-neon-green" />
                    <p className="text-sm text-gray-100">
                      <span className="font-bold">{Object.keys(TIPO_NEGOCIO).length} presets</span>{" "}
                      precargados por tipo de negocio. La configuración viaja{" "}
                      <span className="text-neon-cyan">firmada</span> a cada punto de venta y el
                      servidor la revalida en cada petición.
                    </p>
                  </div>
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
                        <span key={m} className="flex items-center gap-1.5 bg-surface-700 rounded-full px-3 py-1.5 text-xs text-gray-200">
                          <Icon className="h-3.5 w-3.5 text-neon-cyan" /> {METODO_UI[m].label}
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
                className="mt-5 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-3"
              >
                <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
                <p className="text-sm text-gray-100">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="mt-8 flex items-center justify-between">
            <button
              onClick={atras}
              disabled={paso === "tipo" || guardando}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-muted hover:text-gray-100 transition-colors disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Atrás
            </button>

            {paso !== "resumen" ? (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={siguiente}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-neon-green text-surface-900 font-bold shadow-neon"
              >
                Continuar <ArrowRight className="h-4 w-4" />
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={completar}
                disabled={guardando}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-neon-green text-surface-900 font-bold shadow-neon disabled:opacity-60"
              >
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PartyPopper className="h-4 w-4" />
                )}
                {guardando ? "Configurando..." : "Guardar y empezar"}
              </motion.button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted mt-6">
          Cambiar la interfaz por tipo de negocio no elimina datos. Cada cambio firma una nueva
          versión de configuración.
        </p>
      </motion.div>
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