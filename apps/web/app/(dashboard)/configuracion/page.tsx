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
  Store,
  Printer,
  Boxes,
  FileText,
  Coins,
} from "lucide-react";
import { normalizarPersonalizacion, presetPorGiro } from "@/lib/personalizacion";
import { UserManagement } from "@/components/configuracion/user-management";
import { PersonalizacionGiroEditor } from "@/components/configuracion/personalizacion-giro";
import { HardwarePanel } from "@/components/configuracion/hardware-panel";
import { MiCuentaPanel } from "@/components/configuracion/mi-cuenta";
import { DatosFiscalesEditor } from "@/components/configuracion/datos-fiscales";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { FactoryResetButton } from "@/components/configuracion/factory-reset";
import { TrustBadge } from "@/components/configuracion/trust-badge";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import {
  TIPO_NEGOCIO,
  METODOS_PAGO_DISPONIBLES,
  VALID_FLAG_KEYS,
  MODULOS_INFO,
  nivelModulo,
  PRESETS_POR_NEGOCIO,
  DEFAULT_FEATURE_FLAGS,
  TEMAS_BASE,
  DEFAULT_TEMA_BASE,
  DEFAULT_COLOR_ACENTO,
  ANCHOS_TICKET,
  VISTAS_POS,
  DEFAULT_ANCHO_TICKET,
  DEFAULT_VISTA_POS,
  DEFAULT_PUNTOS_CONFIG,
  type BusinessConfig,
  type DatosBancarios,
  type DatosFiscales,
  type FeatureFlags,
  type MetodoPagoConfig,
  type PuntosConfig,
  type TemaBase,
  type AnchoTicket,
  type VistaPOS,
  type TipoNegocio,
} from "@/lib/business-types";
import { cn } from "@/lib/utils";
import { notificar } from "@/store/notificaciones";
import { aDataUrlReducida, leerConfigCloudinary, subirACloudinary } from "@/lib/imagenes-cliente";


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
    preciosIncluyenIva: raw?.preciosIncluyenIva === true,
    descuentoMaxCajera: Number.isFinite(Number(raw?.descuentoMaxCajera)) ? Number(raw?.descuentoMaxCajera) : 10,
    personalizacion: normalizarPersonalizacion(raw?.personalizacion, raw?.tipoNegocio),
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
    mensajeTicket:
      typeof raw?.mensajeTicket === "string" && raw.mensajeTicket.trim()
        ? raw.mensajeTicket
        : null,
    anchoTicket:
      raw?.anchoTicket === "58mm" || raw?.anchoTicket === "80mm"
        ? (raw.anchoTicket as AnchoTicket)
        : DEFAULT_ANCHO_TICKET,
    vistaDefectoPOS:
      raw?.vistaDefectoPOS === "ESCANER" || raw?.vistaDefectoPOS === "CATALOGO_TACTIL"
        ? (raw.vistaDefectoPOS as VistaPOS)
        : DEFAULT_VISTA_POS,
    datosFiscales: (() => {
      const fRaw: any =
        raw?.datosFiscales && typeof raw.datosFiscales === "object" ? raw.datosFiscales : {};
      const fiscales: DatosFiscales = {
        rfc: typeof fRaw.rfc === "string" ? fRaw.rfc : undefined,
        razonSocial: typeof fRaw.razonSocial === "string" ? fRaw.razonSocial : undefined,
        curp: typeof fRaw.curp === "string" ? fRaw.curp : undefined,
        regimenFiscal: typeof fRaw.regimenFiscal === "string" ? fRaw.regimenFiscal : undefined,
        usoCFDI: typeof fRaw.usoCFDI === "string" ? fRaw.usoCFDI : undefined,
        codigoPostal: typeof fRaw.codigoPostal === "string" ? fRaw.codigoPostal : undefined,
        calle: typeof fRaw.calle === "string" ? fRaw.calle : undefined,
        numExt: typeof fRaw.numExt === "string" ? fRaw.numExt : undefined,
        numInt: typeof fRaw.numInt === "string" ? fRaw.numInt : undefined,
        colonia: typeof fRaw.colonia === "string" ? fRaw.colonia : undefined,
        municipio: typeof fRaw.municipio === "string" ? fRaw.municipio : undefined,
        estado: typeof fRaw.estado === "string" ? fRaw.estado : undefined,
        cp:
          typeof fRaw.cp === "string"
            ? fRaw.cp
            : typeof fRaw.codigoPostal === "string"
              ? fRaw.codigoPostal
              : undefined,
      };
      const tieneAlgo = Object.values(fiscales).some((v) => typeof v === "string" && v.trim());
      return tieneAlgo ? fiscales : null;
    })(),
    datosBancarios,
    usarCaducidad:
      typeof raw?.usarCaducidad === "boolean" ? raw.usarCaducidad : false,
    usarUbicaciones:
      typeof raw?.usarUbicaciones === "boolean" ? raw.usarUbicaciones : true,
    requerirFondoInicial:
      typeof raw?.requerirFondoInicial === "boolean" ? raw.requerirFondoInicial : true,
    diasApartado: Number(raw?.diasApartado) > 0 ? Number(raw.diasApartado) : 30,
    corteConReferencia: raw?.corteConReferencia === true,
    imprimirCorteAuto: raw?.imprimirCorteAuto === true,
    diasDevolucion: Number(raw?.diasDevolucion) > 0 ? Number(raw.diasDevolucion) : 30,
    montoAutorizarDevolucion: Number(raw?.montoAutorizarDevolucion) > 0 ? Number(raw.montoAutorizarDevolucion) : null,
    puntosConfig: normalizePuntosConfigLocal(raw?.puntosConfig),
    configVersion: Number.isFinite(Number(raw?.configVersion)) ? Number(raw.configVersion) : 1,
    setupPendiente: Boolean(raw?.setupPendiente),
  };
}

/** Normaliza la tasa del Puntos Monedero a valores seguros (Fase 12). */
function normalizePuntosConfigLocal(raw: any): PuntosConfig {
  const pesos =
    typeof raw?.pesosCompraPorPunto === "number" &&
    Number.isFinite(raw.pesosCompraPorPunto) &&
    raw.pesosCompraPorPunto >= 1
      ? Math.min(raw.pesosCompraPorPunto, 100000)
      : DEFAULT_PUNTOS_CONFIG.pesosCompraPorPunto;
  const valor =
    typeof raw?.valorPuntoPesos === "number" &&
    Number.isFinite(raw.valorPuntoPesos) &&
    raw.valorPuntoPesos > 0
      ? Math.min(raw.valorPuntoPesos, 10000)
      : DEFAULT_PUNTOS_CONFIG.valorPuntoPesos;
  return { pesosCompraPorPunto: pesos, valorPuntoPesos: valor };
}

export default function ConfiguracionPage() {
  const { nombre, rol } = useAuthStore();
  const [tab, setTab] = useState<"usuarios" | "negocio" | "equipo">("usuarios");
  // Enlaces directos: /configuracion?tab=negocio&seccion=financiero
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "negocio" || t === "equipo" || t === "usuarios") setTab(t);
  }, []);

  return (
    <>
      <div className="p-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">Configuración</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-muted">
              Gestión de usuarios, roles y parámetros del negocio
            </p>
            <TrustBadge />
          </div>
        </motion.div>

        <div className="flex gap-1 mb-6 bg-surface-800 p-1 rounded-xl w-fit">
          {(
            [
              { id: "usuarios", label: "Usuarios", icon: Users },
              { id: "negocio", label: "Negocio", icon: Settings2 },
              { id: "equipo", label: "Este equipo", icon: Printer },
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
              <MiCuentaPanel />
              <ErrorBoundary label="la gestión de usuarios">
                <UserManagement />
              </ErrorBoundary>
            </motion.div>
          ) : tab === "equipo" ? (
            <motion.div
              key="equipo"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ErrorBoundary label="el hardware del equipo">
                <HardwarePanel />
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
    </>
  );
}

function NegocioConfigPanel() {
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marcaError, setMarcaError] = useState<string | null>(null);
  const [seccion, setSeccion] = useState<"identidad" | "pos" | "financiero" | "modulos">("identidad");
  useEffect(() => {
    const sec = new URLSearchParams(window.location.search).get("seccion");
    if (sec === "identidad" || sec === "pos" || sec === "financiero" || sec === "modulos") setSeccion(sec);
  }, []);
  const refreshConfig = useConfigStore((s) => s.refresh);

  /**
   * Logo: con Cloudinary se sube ahí (URL); sin él, se reduce a 512 px y se
   * guarda como data URL. En ambos casos sin límite de tamaño del original.
   */
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const aplicarLogoArchivo = async (file: File | undefined | null) => {
    if (!file) return;
    setMarcaError(null);
    if (!file.type.startsWith("image/")) {
      setMarcaError("El archivo debe ser una imagen (PNG, JPG/JPEG o WEBP).");
      return;
    }
    setSubiendoLogo(true);
    try {
      const nube = await leerConfigCloudinary();
      const logo = nube.enabled ? await subirACloudinary(file, nube, "logos") : await aDataUrlReducida(file);
      if (!nube.enabled && logo.length > LOGO_MAX_BYTES) {
        throw new Error("No se pudo reducir el logo lo suficiente; prueba con otra imagen.");
      }
      setConfig((c) => (c ? { ...c, logo } : c));
    } catch (e: any) {
      setMarcaError(e.message || "No se pudo cargar el logo");
    } finally {
      setSubiendoLogo(false);
    }
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

  const setDatoFiscal = (datos: DatosFiscales) => {
    setConfig((c) => {
      if (!c) return c;
      const limpios: DatosFiscales = {};
      for (const [k, v] of Object.entries(datos) as Array<[keyof DatosFiscales, any]>) {
        if (typeof v === "string" && v.trim()) limpios[k] = v;
      }
      const tieneAlgo = Object.values(limpios).some((v) => typeof v === "string" && v.trim());
      return { ...c, datosFiscales: tieneAlgo ? limpios : null };
    });
  };

  const setPuntoTasa = (campo: keyof PuntosConfig, valor: number) => {
    if (guardando) return;
    setConfig((c) =>
      c ? { ...c, puntosConfig: { ...c.puntosConfig, [campo]: valor } } : c
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
    try {
      const res = await fetch("/api/configuracion/negocio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombreNegocio: config.nombreNegocio,
          tipoNegocio: config.tipoNegocio,
          moneda: config.moneda,
          ivaRate: Number(config.ivaRate),
          preciosIncluyenIva: config.preciosIncluyenIva === true,
          descuentoMaxCajera: Number(config.descuentoMaxCajera ?? 10),
          personalizacion: config.personalizacion,
          featureFlags: config.featureFlags,
          metodosPago: config.metodosPago,
          politicaStockOffline: config.politicaStockOffline,
          logo: config.logo ?? null,
          temaBase: config.temaBase,
          colorAcento: config.colorAcento,
          datosBancarios: config.datosBancarios ?? null,
          mensajeTicket: config.mensajeTicket ?? null,
          anchoTicket: config.anchoTicket,
          vistaDefectoPOS: config.vistaDefectoPOS,
          datosFiscales: config.datosFiscales ?? null,
          usarCaducidad: config.usarCaducidad,
          usarUbicaciones: config.usarUbicaciones,
          requerirFondoInicial: config.requerirFondoInicial,
          diasApartado: Math.round(Number(config.diasApartado) || 30),
          corteConReferencia: config.corteConReferencia === true,
          imprimirCorteAuto: config.imprimirCorteAuto === true,
          diasDevolucion: Math.round(Number(config.diasDevolucion) || 30),
          montoAutorizarDevolucion:
            config.montoAutorizarDevolucion != null && Number(config.montoAutorizarDevolucion) > 0
              ? Number(config.montoAutorizarDevolucion)
              : null,
          puntosConfig: config.puntosConfig,
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
      notificar.exito(
        "Configuración guardada",
        data.config?.configVersion ? `Versión ${data.config.configVersion}` : undefined
      );
    } catch (e: any) {
      notificar.error("No se guardó la configuración", e.message);
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

  // Vuelve a la plantilla del giro: módulos, pagos, caducidad/ubicaciones y
  // vocabulario. No guarda: la administradora revisa y pulsa Guardar.
  const aplicarPlantilla = () => {
    if (!config || guardando) return;
    const p = PRESETS_POR_NEGOCIO[config.tipoNegocio];
    if (!p) return;
    setConfig({
      ...config,
      featureFlags: { ...p.featureFlags },
      metodosPago: [...p.metodosPago],
      politicaStockOffline: p.politicaStockOffline,
      usarCaducidad: p.usarCaducidad,
      usarUbicaciones: p.usarUbicaciones,
      personalizacion: presetPorGiro(config.tipoNegocio),
    });
    notificar.info(
      `Plantilla de ${TIPO_NEGOCIO[config.tipoNegocio]} aplicada`,
      "Revisa los cambios y pulsa Guardar para conservarlos."
    );
  };

  const togglePreferencia = (
    key: "usarCaducidad" | "usarUbicaciones" | "requerirFondoInicial"
  ) => {
    if (guardando) return; // UI bloqueada mientras el PUT está en vuelo
    setConfig((c) => (c ? { ...c, [key]: !c[key] } : c));
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
      {/* Sub-pestañas de configuración */}
      <div className="flex flex-wrap gap-1 bg-surface-700 p-1 rounded-xl w-fit">
        {(
          [
            { id: "identidad" as const, label: "Identidad y Tema", icon: Store },
            { id: "pos" as const, label: "Punto de Venta", icon: Printer },
            { id: "financiero" as const, label: "Financiero", icon: Landmark },
            { id: "modulos" as const, label: "Módulos", icon: Boxes },
          ]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setSeccion(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              seccion === id
                ? "bg-surface-600 text-gray-100 shadow-inner"
                : "text-muted hover:text-gray-100"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
      {seccion === "identidad" && (
        <motion.div
          key="identidad"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-5"
        >
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
          <span className="mt-1 block text-[11px] text-muted">
            Al cambiar de giro, ve a{" "}
            <button type="button" onClick={() => setSeccion("modulos")} className="font-semibold text-acento underline">
              Módulos → Aplicar plantilla
            </button>{" "}
            para cargar sus módulos y vocabulario.
          </span>
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

      <label className="flex items-start gap-3 rounded-xl border border-surface-600 bg-surface-700/40 p-3">
        <input
          type="checkbox"
          checked={config.preciosIncluyenIva === true}
          onChange={(e) => setConfig({ ...config, preciosIncluyenIva: e.target.checked })}
          className="mt-1"
        />
        <span>
          <span className="block text-sm font-bold text-gray-100">
            Mis precios ya incluyen impuestos
          </span>
          <span className="block text-xs text-muted">
            Activado: el cliente paga el precio de etiqueta y el ticket desglosa el IVA. Desactivado:
            el IVA se suma al precio al cobrar. Cada producto puede tener su propia tasa (0%, exento,
            IEPS) desde Inventario.
          </span>
        </span>
      </label>

      <label className="block max-w-xs">
        <span className="text-xs text-muted mb-1 block">
          Descuento máximo de la cajera sin autorización (%)
        </span>
        <input
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={config.descuentoMaxCajera ?? 10}
          onChange={(e) => setConfig({ ...config, descuentoMaxCajera: Number(e.target.value) })}
          className="input-dark"
        />
      </label>

      <PersonalizacionGiroEditor
        valor={config.personalizacion}
        tipoNegocio={config.tipoNegocio}
        onChange={(personalizacion) => setConfig({ ...config, personalizacion })}
      />

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
              {subiendoLogo ? "Subiendo logo…" : "PNG, JPG o WEBP · se ajusta el tamaño automáticamente"}
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
      </motion.div>
      )}
      {seccion === "financiero" && (
        <motion.div
          key="financiero"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-5"
        >
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

        <div className="border-t border-surface-600 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-neon-cyan" />
            <span className="text-xs font-bold text-muted uppercase tracking-wider">
              Facturación · Datos fiscales del negocio
            </span>
          </div>
          <p className="text-[11px] text-muted mb-3">
            RFC y razón social que se usarán para emitir comprobantes desde el
            módulo de Facturación.
          </p>
          <DatosFiscalesEditor
            datos={config.datosFiscales}
            onChange={setDatoFiscal}
            disabled={guardando}
          />
        </div>
      </motion.div>
      )}
      {seccion === "modulos" && (
        <motion.div
          key="modulos"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-5"
        >
        <div className="flex flex-col gap-3 rounded-xl border border-surface-500 bg-surface-700 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-100">
              Plantilla de {TIPO_NEGOCIO[config.tipoNegocio]}
            </p>
            <p className="text-xs text-muted">
              Restablece módulos, métodos de pago, caducidad/ubicaciones y vocabulario a lo
              recomendado para el giro. Cambia el giro en &quot;Identidad y Tema&quot;.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={aplicarPlantilla}
              className="rounded-xl border border-acento/50 px-4 py-2 text-sm font-bold text-acento hover:bg-acento/10"
            >
              Aplicar plantilla
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`¿Cargar los productos de ejemplo de ${TIPO_NEGOCIO[config.tipoNegocio]}? Sus códigos empiezan con EJ- y no se duplican.`)) return;
                const r = await fetch("/api/setup/catalogo-ejemplo", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tipoNegocio: config.tipoNegocio }),
                });
                const d = await r.json().catch(() => ({}));
                if (r.ok) notificar.exito("Catálogo de ejemplo cargado", `${d.productos} productos y ${d.categorias} categorías nuevas`);
                else notificar.error("No se cargó el catálogo de ejemplo", d.error);
              }}
              className="rounded-xl border border-surface-500 px-4 py-2 text-xs font-semibold text-muted hover:text-gray-100"
            >
              Cargar productos de ejemplo
            </button>
          </div>
        </div>
      <div>
        <span className="text-xs text-muted mb-2 block">Módulos activos</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {VALID_FLAG_KEYS.map((flag) => (
            <button
              key={flag}
              type="button"
              onClick={() => toggleFlag(flag)}
              aria-pressed={config.featureFlags[flag]}
              className={cn(
                "flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all",
                config.featureFlags[flag]
                  ? "bg-neon-green/10 border-neon-green/40 text-gray-100"
                  : "bg-surface-700 border-surface-500 text-muted"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 h-4 w-4 rounded-md border flex items-center justify-center shrink-0",
                  config.featureFlags[flag]
                    ? "bg-neon-green border-neon-green"
                    : "border-surface-400"
                )}
              >
                {config.featureFlags[flag] && <Check className="h-3 w-3 text-btn-ink" />}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {MODULOS_INFO[flag].label}
                  {(() => {
                    const nivel = nivelModulo(config.tipoNegocio, flag);
                    return (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
                          nivel === "recomendado"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : nivel === "opcional"
                              ? "bg-surface-600 text-muted"
                              : "bg-rose-500/10 text-rose-300"
                        )}
                      >
                        {nivel === "recomendado" ? "Recomendado" : nivel === "opcional" ? "Opcional" : "No aplica"}
                      </span>
                    );
                  })()}
                </span>
                <span className="block text-[11px] leading-snug text-muted">{MODULOS_INFO[flag].desc}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Un módulo apagado desaparece del menú y su información queda resguardada; el servidor
          también rechaza su uso hasta que lo vuelvas a activar.
        </p>
      </div>

      </motion.div>
      )}
      {seccion === "pos" && (
        <motion.div
          key="pos"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-5"
        >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-muted mb-1 block">Ancho de impresión del ticket</span>
            <div className="flex gap-2">
              {ANCHOS_TICKET.map((anc) => (
                <button
                  key={anc}
                  type="button"
                  onClick={() => setConfig({ ...config, anchoTicket: anc })}
                  className={cn(
                    "px-4 py-2 rounded-xl border text-xs font-bold transition-all",
                    config.anchoTicket === anc
                      ? "bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan"
                      : "bg-surface-700 border-surface-500 text-muted"
                  )}
                >
                  {anc === "80mm" ? "Térmica 80 mm (estándar)" : "Térmica 58 mm (mini)"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted mb-1 block">Pantalla de cobro por defecto</span>
            <div className="flex gap-2">
              {VISTAS_POS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setConfig({ ...config, vistaDefectoPOS: v })}
                  className={cn(
                    "px-4 py-2 rounded-xl border text-xs font-bold transition-all",
                    config.vistaDefectoPOS === v
                      ? "bg-neon-cyan/10 border-neon-cyan/40 text-neon-cyan"
                      : "bg-surface-700 border-surface-500 text-muted"
                  )}
                >
                  {v === "ESCANER" ? "Lector de código (escáner)" : "Catálogo táctil"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-xs text-muted mb-1 block">Mensaje al pie del ticket</span>
          <textarea
            value={config.mensajeTicket ?? ""}
            onChange={(e) => setConfig({ ...config, mensajeTicket: e.target.value || null })}
            placeholder="¡Gracias por su compra!"
            maxLength={500}
            rows={2}
            className="input-dark w-full resize-none"
          />
          <span className="mt-1 text-[11px] text-muted">
            Hasta 500 caracteres · aparece al final de tickets y cortes de caja.
          </span>
        </label>

      <div>
        <span className="text-xs text-muted mb-2 block">
          Preferencias del negocio (Configuración personalizable)
        </span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(
            [
              {
                key: "usarCaducidad",
                label: "Fechas de caducidad",
                desc: "Vigencia y lote por producto (farmacias, abarrotes)",
                activo: config.usarCaducidad,
              },
              {
                key: "usarUbicaciones",
                label: "Ubicaciones en estante",
                desc: "Campo de ubicación del almacén en cada producto",
                activo: config.usarUbicaciones,
              },
              {
                key: "requerirFondoInicial",
                label: "Fondo inicial obligatorio",
                desc: "Solicitar el fondo inicial al abrir la caja",
                activo: config.requerirFondoInicial,
              },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => togglePreferencia(p.key)}
              className={cn(
                "flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border text-left transition-all",
                p.activo
                  ? "bg-neon-cyan/10 border-neon-cyan/40"
                  : "bg-surface-700 border-surface-500 opacity-60"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-bold text-gray-100">
                <span
                  className={cn(
                    "h-4 w-4 rounded-md border flex items-center justify-center shrink-0",
                    p.activo ? "bg-neon-cyan border-neon-cyan" : "border-surface-400"
                  )}
                >
                  {p.activo && <Check className="h-3 w-3 text-btn-ink" />}
                </span>
                {p.label}
              </span>
              <span className="text-[11px] text-muted leading-snug">{p.desc}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 flex max-w-md flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-100">Días que se guarda un apartado</span>
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            inputMode="numeric"
            value={config.diasApartado}
            onChange={(e) =>
              setConfig({ ...config, diasApartado: Math.min(365, Math.max(1, Math.round(Number(e.target.value) || 1))) })
            }
            className="input-dark w-24"
          />
          <span className="w-full text-[11px] text-muted">
            Pasado ese plazo te avisamos para contactar al cliente o cancelar el apartado.
          </span>
        </label>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, corteConReferencia: !config.corteConReferencia })}
            aria-pressed={config.corteConReferencia}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all",
              config.corteConReferencia ? "border-neon-cyan/40 bg-neon-cyan/10" : "border-surface-500 bg-surface-700"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-gray-100">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-md border",
                  config.corteConReferencia ? "border-neon-cyan bg-neon-cyan" : "border-surface-400"
                )}
              >
                {config.corteConReferencia && <Check className="h-3 w-3 text-btn-ink" />}
              </span>
              Corte con referencia
            </span>
            <span className="text-[11px] leading-snug text-muted">
              Apagado = corte ciego (recomendado con cajeras): no ven lo esperado. Encendido: lo ven mientras
              cuentan (útil si el dueño cobra).
            </span>
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, imprimirCorteAuto: !config.imprimirCorteAuto })}
            aria-pressed={config.imprimirCorteAuto}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all",
              config.imprimirCorteAuto ? "border-neon-cyan/40 bg-neon-cyan/10" : "border-surface-500 bg-surface-700"
            )}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-gray-100">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-md border",
                  config.imprimirCorteAuto ? "border-neon-cyan bg-neon-cyan" : "border-surface-400"
                )}
              >
                {config.imprimirCorteAuto && <Check className="h-3 w-3 text-btn-ink" />}
              </span>
              Imprimir el corte al cerrar
            </span>
            <span className="text-[11px] leading-snug text-muted">
              Apagado = el resultado se muestra en pantalla y se imprime solo si pulsas «Imprimir».
            </span>
          </button>
          <label className="block rounded-xl border border-surface-500 bg-surface-700 px-3 py-2.5">
            <span className="text-sm font-bold text-gray-100">Plazo para devoluciones</span>
            <span className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                inputMode="numeric"
                value={config.diasDevolucion}
                onChange={(e) =>
                  setConfig({ ...config, diasDevolucion: Math.min(365, Math.max(1, Math.round(Number(e.target.value) || 1))) })
                }
                className="input-dark w-20 py-1.5"
              />
              <span className="text-xs text-muted">días desde la venta</span>
            </span>
            <span className="mt-1 block text-[11px] text-muted">Después, solo la administradora puede aceptarla.</span>
          </label>
          <label className="block rounded-xl border border-surface-500 bg-surface-700 px-3 py-2.5">
            <span className="text-sm font-bold text-gray-100">Autorizar devoluciones desde</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="text-xs text-muted">$</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={config.montoAutorizarDevolucion ?? ""}
                placeholder="Sin límite"
                onChange={(e) =>
                  setConfig({
                    ...config,
                    montoAutorizarDevolucion: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="input-dark w-28 py-1.5"
              />
            </span>
            <span className="mt-1 block text-[11px] text-muted">
              Una cajera necesitará la clave de la administradora a partir de ese monto.
            </span>
          </label>
        </div>
      </div>

      <div className="border-t border-surface-600 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Coins className="h-4 w-4 text-neon-yellow" />
          <span className="text-xs font-bold text-muted uppercase tracking-wider">
            Puntos Monedero · Fidelización
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-muted mb-1 block">
              Compra para ganar 1 punto ($MXN)
            </span>
            <input
              type="number"
              min={1}
              max={100000}
              step={1}
              value={config.puntosConfig.pesosCompraPorPunto}
              onChange={(e) =>
                setPuntoTasa(
                  "pesosCompraPorPunto",
                  Number(e.target.value) || DEFAULT_PUNTOS_CONFIG.pesosCompraPorPunto
                )
              }
              className="input-dark"
            />
            <span className="mt-1 text-[11px] text-muted block">
              Ej. 100: el cliente gana 1 punto por cada $100 que paga.
            </span>
          </label>
          <label className="block">
            <span className="text-xs text-muted mb-1 block">
              Valor de 1 punto al pagar ($MXN)
            </span>
            <input
              type="number"
              min={0.01}
              max={10000}
              step={0.05}
              value={config.puntosConfig.valorPuntoPesos}
              onChange={(e) =>
                setPuntoTasa(
                  "valorPuntoPesos",
                  Number(e.target.value) || DEFAULT_PUNTOS_CONFIG.valorPuntoPesos
                )
              }
              className="input-dark"
            />
            <span className="mt-1 text-[11px] text-muted block">
              Ej. 1: cada punto cubre $1 al pagar una venta.
            </span>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Con el método{" "}
          <span className="font-bold text-neon-yellow">PUNTOS_MONEDERO</span>{" "}
          activo, la cajera canjea los puntos del cliente desde el POS. Los
          puntos no ingresan a la caja: se descuentan del saldo del cliente.
        </p>
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
      </motion.div>
      )}
      </AnimatePresence>

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