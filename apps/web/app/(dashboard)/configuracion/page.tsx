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
  Palette,
  ImagePlus,
  Landmark,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { UserManagement } from "@/components/configuracion/user-management";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { FactoryResetButton } from "@/components/configuracion/factory-reset";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import {
  TIPO_NEGOCIO,
  METODOS_PAGO_DISPONIBLES,
  VALID_FLAG_KEYS,
  DEFAULT_FEATURE_FLAGS,
  TEMAS_BASE,
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
  type BusinessConfig,
  type DatosBancarios,
  type FeatureFlags,
  type MetodoPagoConfig,
  type TemaBase,
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

/** Tamaño máximo del logo en bytes (base64 ≈ 1 MB). */
const LOGO_MAX_BYTES = 1_000_000;

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

  // Blindaje Financiero: solo se aceptan cadenas acotadas para los
  // datos bancarios del negocio (el resto se descarta).
  const bancosRaw: any =
    raw?.datosBancarios && typeof raw.datosBancarios === "object" ? raw.datosBancarios : {};
  const datosBancarios: DatosBancarios = {
    banco: typeof bancosRaw.banco === "string" ? bancosRaw.banco : undefined,
    titular: typeof bancosRaw.titular === "string" ? bancosRaw.titular : undefined,
    clabe: typeof bancosRaw.clabe === "string" ? bancosRaw.clabe : undefined,
    cuenta: typeof bancosRaw.cuenta === "string" ? bancosRaw.cuenta : undefined,
  };

  return {
    nombreNegocio: typeof raw?.nombreNegocio === "string" ? raw.nombreNegocio : "Mi Negocio",
    tipoNegocio,
    moneda: typeof raw?.moneda === "string" ? raw.moneda : "MXN",
    ivaRate: Number.isFinite(iva) ? iva : 16,
    featureFlags,
    metodosPago,
    politicaStockOffline:
      raw?.politicaStockOffline === "RECHAZAR" ? "RECHAZAR" : "PERMITIR_NEGATIVO",
    logo:
      typeof raw?.logo === "string" && raw.logo
        ? raw.logo
        : null,
    temaBase:
      typeof raw?.temaBase === "string" && raw.temaBase in TEMAS_BASE
        ? (raw.temaBase as TemaBase)
        : DEFAULT_TEMA_BASE,
    colorAcento:
      typeof raw?.colorAcento === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.colorAcento)
        ? raw.colorAcento
        : DEFAULT_COLOR_ACENTO,
    datosBancarios,
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
  const [marcaError, setMarcaError] = useState<string | null>(null);
  const refreshConfig = useConfigStore((s) => s.refresh);

  /** Lee un archivo de imagen, valida peso/mime y lo convierte a base64 (data URL). */
  const aplicarLogoArchivo = (file: File | undefined | null) => {
    if (!file) return;
    setMarcaError(null);
    if (!file.type.startsWith("image/")) {
      setMarcaError("El archivo debe ser una imagen (PNG, JPG/JPEG o WEBP).");
      return;
    }
    const lector = new FileReader();
    lector.onload = () => {
      if (typeof lector.result !== "string") return;
      const dataUrl: string = lector.result;
      const sinPrefijo = dataUrl.replace(/^data:image\/[^;,]+;base64,/, "");
      const bytes = (sinPrefijo.length * 3) / 4;
      if (bytes > LOGO_MAX_BYTES) {
        setMarcaError("El logo excede 1 MB. Usa una imagen más ligera.");
        return;
      }
      setConfig((c) => (c ? { ...c, logo: dataUrl } : c));
    };
    lector.readAsDataURL(file);
  };

  const setTema = (temaBase: TemaBase) => {
    setConfig((c) => (c ? { ...c, temaBase } : c));
  };

  const setColorAcento = (colorAcento: string) => {
    setConfig((c) => (c ? { ...c, colorAcento } : c));
  };

  const setDatoBancario = (campo: keyof DatosBancarios, valor: string) => {
    setConfig((c) =>
      c ? { ...c, datosBancarios: { ...c.datosBancarios, [campo]: valor || undefined } } : c
    );
  };

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
    if (!config || guardando) return; // anti doble envío: el PUT se bloquea (isSubmitting)
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
          logo: config.logo ?? null,
          temaBase: config.temaBase,
          colorAcento: config.colorAcento,
          datosBancarios: config.datosBancarios ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      // Véase: Fase B — el PUT debió llegar a 200 OK. SOLO ahora se actualiza
      // el estado global y el local: sin "toggles fantasma" ni diveracias con
      // el servidor (que pudo normalizar valores rechazados).
      if (data.config && typeof data.firma === "string") {
        const serverOk = refreshConfig(data.config, data.firma, data.sessionKey ?? "");
        if (serverOk) setConfig(normalizeConfig(data.config));
      }
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggleFlag = (flag: keyof FeatureFlags) => {
    if (guardando) return; // UI bloqueada mientras el PUT está en vuelo
    setConfig((c) => {
      if (!c) return c;
      const proximo = !c.featureFlags[flag];
      // NO tocamos Zustand aquí: el store se sincroniza recién con la
      // config firmada que devuelve el PUT (refresh → 200 OK).
      return { ...c, featureFlags: { ...c.featureFlags, [flag]: proximo } };
    });
  };

  const toggleMetodo = (m: MetodoPagoConfig) => {
    if (guardando) return; // UI bloqueada mientras el PUT está en vuelo
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
    <fieldset disabled={guardando} className="contents">
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

      <div className="border-t border-surface-600 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="h-4 w-4 text-neon-cyan" />
          <span className="text-xs font-bold text-muted uppercase tracking-wider">
            Marca blanca · Identidad
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-muted mb-1 block">Logo del negocio</span>
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-xl bg-surface-700 border border-surface-500 flex items-center justify-center overflow-hidden shrink-0">
                {config.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.logo}
                    alt="Logo del negocio"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted" />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs font-bold text-gray-100 cursor-pointer w-fit transition-colors">
                  <ImagePlus className="h-3.5 w-3.5" /> Subir imagen
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => aplicarLogoArchivo(e.target.files?.[0])}
                  />
                </label>
                {config.logo && (
                  <button
                    onClick={() => setConfig((c) => (c ? { ...c, logo: null } : c))}
                    className="text-[11px] text-neon-red hover:underline w-fit"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
            {marcaError && (
              <p className="mt-1 text-[11px] text-neon-red">{marcaError}</p>
            )}
            <p className="mt-1 text-[11px] text-muted">
              Máximo 1 MB · PNG, JPG o WEBP
            </p>
          </div>

          <div>
            <span className="text-xs text-muted mb-1 block">Tema de la interfaz</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {(Object.keys(TEMAS_BASE) as TemaBase[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTema(t)}
                  className={cn(
                    "px-2 py-2 rounded-xl border text-xs font-bold transition-all",
                    config.temaBase === t
                      ? "bg-neon-green text-btn-ink border-transparent shadow-neon"
                      : "bg-surface-700 border-surface-500 text-gray-100 hover:bg-surface-600"
                  )}
                >
                  {TEMAS_BASE[t]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Neón (oscuro con brillos), Minimalista (plano y claro), Brutalista
              (contraste duro) o Corporativo (luz profesional). Se aplica al guardar.
            </p>
          </div>

          <div>
            <span className="text-xs text-muted mb-1 block">Color de acento</span>
            <div className="flex items-center gap-2.5">
              <label
                className="relative h-10 w-14 rounded-xl overflow-hidden border border-surface-500 cursor-pointer shrink-0"
                style={{ background: config.colorAcento }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-black/60 font-bold">
                  #ABC
                </span>
                <input
                  type="color"
                  value={config.colorAcento}
                  onChange={(e) => setColorAcento(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Elegir color de acento"
                />
              </label>
              <div className="flex gap-1.5">
                {[
                  "#00ff88",
                  "#10b981",
                  "#38bdf8",
                  "#f472b6",
                  "#eab308",
                  "#8b5cf6",
                ].map((c) => (
                  <button
                    key={c}
                    aria-label={`Color ${c}`}
                    onClick={() => setColorAcento(c)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-all",
                      config.colorAcento.toLowerCase() === c
                        ? "border-gray-100 scale-110 shadow-neon"
                        : "border-transparent hover:scale-105"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Se aplica a botones principales y acentos en cualquier tema.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-surface-600 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Landmark className="h-4 w-4 text-neon-purple" />
          <span className="text-xs font-bold text-muted uppercase tracking-wider">
            Blindaje financiero · Cuenta para transferencias
          </span>
        </div>
        <p className="text-[11px] text-muted mb-3">
          Aparece en el POS al cobrar por transferencia; se exigen los últimos 4
          dígitos de la referencia de cada pago.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-muted mb-1 block">Banco</span>
            <input
              value={config.datosBancarios?.banco ?? ""}
              onChange={(e) => setDatoBancario("banco", e.target.value)}
              placeholder="Banco Azteca"
              className="input-dark"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted mb-1 block">Titular</span>
            <input
              value={config.datosBancarios?.titular ?? ""}
              onChange={(e) => setDatoBancario("titular", e.target.value)}
              placeholder="Papelería El Lápiz S.A."
              className="input-dark"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted mb-1 block">CLABE (18 dígitos)</span>
            <input
              value={config.datosBancarios?.clabe ?? ""}
              onChange={(e) => setDatoBancario("clabe", e.target.value)}
              inputMode="numeric"
              placeholder="012 180 000000000000"
              className="input-dark"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted mb-1 block">Cuenta bancaria (opcional)</span>
            <input
              value={config.datosBancarios?.cuenta ?? ""}
              onChange={(e) => setDatoBancario("cuenta", e.target.value)}
              placeholder="0000000000"
              className="input-dark"
            />
          </label>
        </div>
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
                {config.featureFlags[flag] && <Check className="h-3 w-3 text-btn-ink" />}
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
              ? "bg-neon-green text-btn-ink shadow-neon"
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

      <div className="border-t border-surface-600 pt-4">
        <FactoryResetButton />
      </div>
      </div>
    </fieldset>
  );
}