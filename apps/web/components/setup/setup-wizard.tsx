"use client";

import { useEffect, useMemo, useState } from "react";
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
  Smartphone,
  ImagePlus,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Users,
  Sparkles,
  Coins,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/store/config";
import { RecoveryHistory } from "@/components/setup/recovery-history";
import { presetPorGiro } from "@/lib/personalizacion";
import { resumenCatalogo } from "@/lib/catalogos-ejemplo";
import {
  PRESETS_POR_NEGOCIO,
  nivelModulo,
  DEFAULT_USAR_CADUCIDAD,
  DEFAULT_USAR_UBICACIONES,
  DEFAULT_REQUERIR_FONDO_INICIAL,
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
    desc: "Útiles, copias e impresiones, regalos y recargas; proveedores para resurtir",
    icon: Store,
    cls: "border-neon-green/40 hover:border-neon-green",
  },
  ABARROTES: {
    label: "Abarrotes",
    desc: "Consumo diario con caducidad, proveedores y recargas",
    icon: ShoppingBasket,
    cls: "border-neon-cyan/40 hover:border-neon-cyan",
  },
  SERVICIOS: {
    label: "Servicios",
    desc: "Catálogo de servicios (sin existencias); cobro en efectivo, tarjeta o transferencia",
    icon: Wrench,
    cls: "border-neon-magenta/40 hover:border-neon-magenta",
  },
  MIXTO: {
    label: "Mixto",
    desc: "Productos y servicios; todos los módulos activos",
    icon: Shuffle,
    cls: "border-neon-purple/40 hover:border-neon-purple",
  },
  FERRETERIA: {
    label: "Ferretería",
    desc: "Herramientas y materiales por pieza o a granel (kg/metros)",
    icon: Wrench,
    cls: "border-neon-cyan/40 hover:border-neon-cyan",
  },
  FARMACIA: {
    label: "Farmacia",
    desc: "Medicamentos con lote, caducidad y stock estricto",
    icon: Boxes,
    cls: "border-neon-green/40 hover:border-neon-green",
  },
  BOUTIQUE: {
    label: "Boutique",
    desc: "Ropa y accesorios con variantes por talla y color",
    icon: Sparkles,
    cls: "border-neon-magenta/40 hover:border-neon-magenta",
  },
};

const METODO_UI: Record<
  MetodoPagoConfig,
  { label: string; desc: string; icon: React.ElementType }
> = {
  EFECTIVO: { label: "Efectivo", desc: "Cobro en caja", icon: Banknote },
  TARJETA_TERMINAL: { label: "Terminal", desc: "Tarjeta física / chip", icon: CreditCard },
  TRANSFERENCIA: { label: "Transferencia", desc: "SPEI / pago digital", icon: Landmark },
  PUNTOS_MONEDERO: {
    label: "Monedero (Puntos)",
    desc: "Canjear puntos de fidelidad del cliente",
    icon: Coins,
  },
};

const FLAG_UI: Record<keyof FeatureFlags, { label: string; desc: string; icon: React.ElementType }> = {
  inventario: { label: "Inventario", desc: "Catálogo, existencias, etiquetas y carga masiva", icon: Boxes },
  facturacion: { label: "Facturación", desc: "Comprobantes / CFDI", icon: FileText },
  dashboard: { label: "Dashboard", desc: "Métricas y gráficas", icon: BarChart3 },
  proveedores: { label: "Proveedores", desc: "Cadena de suministro", icon: Truck },
  bitacora: { label: "Bitácora", desc: "Auditoría de acciones", icon: ScrollText },
  recargas: { label: "Recargas", desc: "Recargas en Control de Caja", icon: Smartphone },
  imagenesCloudinary: {
    label: "Imágenes Cloudinary",
    desc: "Fotos de producto en la nube",
    icon: ImagePlus,
  },
  lotesSeries: { label: "Lotes, series y variantes", desc: "Caducidad, número de serie, tallas y colores", icon: Boxes },
  apartados: { label: "Apartados", desc: "Anticipo y liquidación posterior", icon: ShieldCheck },
};

const PASOS = ["tipo", "pagos", "modulos", "resumen"] as const;
type Paso = (typeof PASOS)[number];

const FLAG_KEYS = Object.keys(PRESETS_POR_NEGOCIO.PAPELERIA_RETAIL.featureFlags) as Array<
  keyof FeatureFlags
>;

/** Código de acceso sugerido a partir del nombre: "Papelería Luna" → "papeleria-luna". */
function sugerirCodigo(nombre: string) {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Asistente de configuración inicial. Con `plataforma`, el MISMO asistente
 * da de alta un negocio desde la consola: al final pide el código y la
 * administradora, crea el negocio y le aplica esta configuración.
 */
export function SetupWizard({
  plataforma,
}: {
  plataforma?: { onTerminado: (mensaje: string) => void; onCancelar: () => void };
} = {}) {
  const router = useRouter();
  const refreshConfig = useConfigStore((s) => s.hydrate);
  const configActual = useConfigStore((s) => s.config);

  const [paso, setPaso] = useState<Paso>("tipo");
  const [tipo, setTipo] = useState<TipoNegocio | null>(null);
  const [metodos, setMetodos] = useState<MetodoPagoConfig[]>([]);
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAbierto, setRecoveryAbierto] = useState(false);
  // Nombre real del negocio (antes se enviaba "Mi Negocio" y pisaba el nombre
  // capturado al volver a correr el asistente).
  // En la consola no hay negocio previo: nada se precarga de la configuración local.
  const [nombre, setNombre] = useState(plataforma ? "" : configActual?.nombreNegocio ?? "");
  const [preciosConIva, setPreciosConIva] = useState(configActual?.preciosIncluyenIva ?? true);
  // Productos de ejemplo del giro (opcional): para probar sin capturar nada.
  const [conEjemplos, setConEjemplos] = useState(false);
  // Solo en la consola: datos de acceso del negocio nuevo.
  const [acceso, setAcceso] = useState({ codigo: "", tocado: false, adminNombre: "", adminUsuario: "admin", adminClave: "" });
  useEffect(() => {
    if (plataforma && !acceso.tocado) setAcceso((a) => ({ ...a, codigo: sugerirCodigo(nombre) }));
  }, [nombre, plataforma, acceso.tocado]);
  useEffect(() => {
    if (plataforma || !configActual) return;
    setNombre((n) => n || configActual.nombreNegocio || "");
    setPreciosConIva(configActual.preciosIncluyenIva ?? true);
  }, [configActual, plataforma]);

  const preset = useMemo(() => (tipo ? PRESETS_POR_NEGOCIO[tipo] : null), [tipo]);

  const elegirTipo = (t: TipoNegocio) => {
    setTipo(t);
    const p = PRESETS_POR_NEGOCIO[t];
    setMetodos([...p.metodosPago]);
    setFlags({ ...p.featureFlags });
    setConEjemplos(false);
    setError(null);
  };

  const toggleMetodo = (m: MetodoPagoConfig) =>
    setMetodos((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );

  const toggleFlag = (k: keyof FeatureFlags) =>
    setFlags((prev) => (prev ? { ...prev, [k]: !prev[k] } : prev));

  const siguiente = () => {
    if (paso === "tipo" && !nombre.trim()) {
      setError("Escribe el nombre de tu negocio (aparece en tickets y reportes).");
      return;
    }
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
    if (plataforma) {
      if (!/^[a-z0-9-]{3,40}$/.test(acceso.codigo)) return setError("Código: 3 a 40 minúsculas, números o guiones.");
      if (acceso.adminNombre.trim().length < 2) return setError("Escribe el nombre de la administradora.");
      if (acceso.adminClave.length < 8) return setError("La contraseña de la administradora debe tener 8 caracteres o más.");
    }
    setGuardando(true);
    setError(null);
    try {
      const configuracion = {
          nombreNegocio: nombre.trim(),
          tipoNegocio: tipo,
          ivaRate: 16,
          preciosIncluyenIva: preciosConIva,
          featureFlags: flags,
          metodosPago: metodos,
          politicaStockOffline: preset?.politicaStockOffline,
          // Cambiar de giro trae su vocabulario y campos de producto; si el
          // giro es el mismo se respeta lo que el negocio ya personalizó.
          ...(plataforma || tipo !== configActual?.tipoNegocio ? { personalizacion: presetPorGiro(tipo) } : {}),
          // Configuración personalizable (Fase 10): preset por giro.
          usarCaducidad: preset?.usarCaducidad ?? DEFAULT_USAR_CADUCIDAD,
          usarUbicaciones: preset?.usarUbicaciones ?? DEFAULT_USAR_UBICACIONES,
          requerirFondoInicial: DEFAULT_REQUERIR_FONDO_INICIAL,
      };
      if (plataforma) {
        // 1) el negocio y su administradora · 2) el mismo asistente aplicado a él.
        const alta = await fetch("/api/plataforma/negocios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: acceso.codigo,
            nombre: nombre.trim(),
            tipoNegocio: tipo,
            catalogoEjemplo: false,
            admin: { nombre: acceso.adminNombre.trim(), username: acceso.adminUsuario.trim(), password: acceso.adminClave },
          }),
        });
        const creado = await alta.json().catch(() => ({}));
        if (!alta.ok) throw new Error(creado.error || "No se pudo crear el negocio");
        const setup = await fetch(`/api/plataforma/negocios/${creado.idNegocio}/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...configuracion, catalogoEjemplo: conEjemplos }),
        });
        const aplicado = await setup.json().catch(() => ({}));
        if (!setup.ok) {
          plataforma.onTerminado(
            `Negocio "${creado.nombre}" creado, pero su configuración quedó pendiente (${aplicado.error ?? "error"}): la administradora la completará al entrar.`
          );
          return;
        }
        plataforma.onTerminado(
          `Negocio "${creado.nombre}" listo. Entra en /login con el código ${creado.codigo} y el usuario ${creado.admin}` +
            (aplicado.catalogo ? ` · ${aplicado.catalogo.productos} productos de ejemplo` : "")
        );
        return;
      }
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configuracion),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      if (conEjemplos) {
        const ej = await fetch("/api/setup/catalogo-ejemplo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipoNegocio: tipo }),
        });
        if (!ej.ok) throw new Error("Se guardó la configuración, pero no se pudo cargar el catálogo de ejemplo");
      }
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
    <div
      className={
        plataforma
          ? "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-6"
          : "min-h-screen bg-app flex items-center justify-center p-6"
      }
      data-testid={plataforma ? "asistente-plataforma" : undefined}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl"
      >
        <div className="mb-6">
          <h1 className="text-xl font-black text-gray-100">{plataforma ? "Nuevo negocio" : "Configura tu sistema"}</h1>
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
                <label className="mb-4 block">
                  <span className="mb-1 block text-xs text-muted">Nombre del negocio</span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={80}
                    placeholder="Ej. Papelería El Lápiz"
                    className="input-dark"
                  />
                </label>
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
                <button
                  type="button"
                  onClick={() => setPreciosConIva((v) => !v)}
                  className={cn(
                    "mt-4 flex w-full items-center gap-3 rounded-xl border bg-surface-700 p-3 text-left transition-all",
                    preciosConIva ? "border-neon-cyan/50" : "border-surface-500"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-100">Mis precios ya incluyen IVA</p>
                    <p className="text-[11px] text-muted">
                      Lo común en mostrador: el precio de la etiqueta es lo que paga el cliente y el
                      ticket desglosa el impuesto. Apágalo si capturas precios antes de IVA.
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                      preciosConIva ? "border-neon-cyan bg-neon-cyan" : "border-surface-400"
                    )}
                  >
                    {preciosConIva && <Check className="h-3 w-3 text-btn-ink" />}
                  </div>
                </button>
              </PasoClave>
            )}

            {paso === "modulos" && flags && (
              <PasoClave
                key="modulos"
                titulo="Módulos del sistema"
                subtitulo="Precargados según tu tipo de negocio; puedes ajustarlos."
              >
                <div className="space-y-2">
                  {FLAG_KEYS.filter((k) => nivelModulo(tipo!, k) !== "no_aplica").map((k) => {
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
                  <ResumenRow label="Negocio" value={nombre.trim()} />
                  <ResumenRow label="Tipo de negocio" value={TIPO_UI[tipo].label} />
                  <ResumenRow label="Precios" value={preciosConIva ? "Incluyen IVA" : "Más IVA"} />
                  <ResumenRow
                    label="Tipos de pago"
                    value={metodos.length ? metodos.length + " habilitados" : "Ninguno"}
                  />
                  <ResumenRow
                    label="Módulos activos"
                    value={FLAG_KEYS.filter((k) => flags[k]).length + " de " + FLAG_KEYS.length}
                  />
                  {(() => {
                    const r = resumenCatalogo(tipo);
                    return (
                      <button
                        type="button"
                        onClick={() => setConEjemplos((v) => !v)}
                        aria-pressed={conEjemplos}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border bg-surface-700 p-3 text-left transition-all",
                          conEjemplos ? "border-neon-green/50" : "border-surface-500"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-gray-100">Cargar productos de ejemplo de {TIPO_UI[tipo].label}</p>
                          <p className="text-[11px] text-muted">
                            {r.productos} productos en {r.categorias} categorías (p. ej. {r.ejemplos.slice(0, 2).join(", ")}).
                            Sus códigos empiezan con EJ- para borrarlos cuando captures los tuyos.
                          </p>
                        </div>
                        <div
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                            conEjemplos ? "border-neon-green bg-neon-green" : "border-surface-400"
                          )}
                        >
                          {conEjemplos && <Check className="h-3 w-3 text-btn-ink" />}
                        </div>
                      </button>
                    );
                  })()}
                  {plataforma && (
                    <div className="space-y-2 rounded-xl border border-surface-500 p-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted">Acceso del negocio</p>
                      <label className="block">
                        <span className="mb-1 block text-xs text-muted">Código para iniciar sesión</span>
                        <input
                          value={acceso.codigo}
                          maxLength={40}
                          onChange={(e) => setAcceso({ ...acceso, codigo: e.target.value.toLowerCase(), tocado: true })}
                          aria-label="Código del negocio"
                          className="input-dark font-mono"
                        />
                      </label>
                      <input
                        value={acceso.adminNombre}
                        onChange={(e) => setAcceso({ ...acceso, adminNombre: e.target.value })}
                        placeholder="Nombre de la administradora (dueña)"
                        aria-label="Nombre de la administradora"
                        className="input-dark"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={acceso.adminUsuario}
                          onChange={(e) => setAcceso({ ...acceso, adminUsuario: e.target.value })}
                          placeholder="Usuario"
                          aria-label="Usuario de la administradora"
                          className="input-dark"
                        />
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={acceso.adminClave}
                          onChange={(e) => setAcceso({ ...acceso, adminClave: e.target.value })}
                          placeholder="Contraseña (8+)"
                          aria-label="Contraseña de la administradora"
                          className="input-dark"
                        />
                      </div>
                    </div>
                  )}
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
            {plataforma && paso === "tipo" ? (
              <button
                onClick={plataforma.onCancelar}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-muted hover:text-gray-100 transition-colors text-sm"
              >
                Cancelar
              </button>
            ) : (
            <button
              onClick={atras}
              disabled={paso === "tipo" || guardando}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-muted hover:text-gray-100 transition-colors disabled:opacity-40 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Atrás
            </button>
            )}

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
                {guardando ? "Configurando..." : plataforma ? "Crear negocio" : "Guardar y empezar"}
              </motion.button>
            )}
          </div>

          {paso === "resumen" && !plataforma && (
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
    <div className="flex items-center justify-between gap-3 bg-surface-700 rounded-xl px-4 py-3">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 truncate text-sm font-bold text-gray-100" title={value}>{value}</span>
    </div>
  );
}