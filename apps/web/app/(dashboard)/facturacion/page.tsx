"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Save, Loader2, Check, AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { DatosFiscalesEditor } from "@/components/configuracion/datos-fiscales";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfigStore } from "@/store/config";
import type { BusinessConfig, DatosFiscales } from "@/lib/business-types";

export default function FacturacionPage() {
  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">Facturación</h2>
          <p className="text-sm text-muted">
            CFDI 4.0 · Datos fiscales del negocio para emitir comprobantes
          </p>
        </motion.div>

        <ErrorBoundary>
          <FacturacionDatosFiscales />
        </ErrorBoundary>
      </div>
    </DashboardLayout>
  );
}

function FacturacionDatosFiscales() {
  const [config, setConfig] = useState<BusinessConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const refreshConfig = useConfigStore((s) => s.refresh);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracion/negocio", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar configuración");
        setConfig(extractConfig(data.config));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const guardar = async () => {
    if (!config || guardando) return;
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
          usarImagenesProductos: config.usarImagenesProductos,
          mensajeTicket: config.mensajeTicket ?? null,
          anchoTicket: config.anchoTicket,
          vistaDefectoPOS: config.vistaDefectoPOS,
          datosFiscales: config.datosFiscales ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      if (data.config && typeof data.firma === "string") {
        refreshConfig(data.config, data.firma, data.sessionKey ?? "");
      }
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
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

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-800 border border-surface-600 rounded-2xl p-6 space-y-4"
      >
        <Skeleton className="h-9 w-2/3" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-11 w-40" />
      </motion.div>
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
            <Check className="h-4 w-4 text-neon-green" /> Datos fiscales guardados
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-neon-cyan/10 flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5 text-neon-cyan" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-100">
              Datos fiscales del negocio
            </h3>
            <p className="text-xs text-muted">
              RFC, razón social, régimen y código postal. Son la base de los
              comprobantes que emita este sistema.
            </p>
          </div>
        </div>

        <DatosFiscalesEditor datos={config.datosFiscales} onChange={setDatoFiscal} disabled={guardando} />

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={guardar}
            className="flex items-center gap-2 py-3 px-6 rounded-xl font-bold bg-neon-cyan text-btn-ink shadow-neon-cyan transition-all hover:brightness-110 active:scale-[0.97] disabled:bg-surface-600 disabled:text-muted disabled:shadow-none disabled:cursor-not-allowed"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar datos fiscales
          </button>
          <span className="text-xs text-muted">
            La facturación electrónica (CFDI 4.0) operará sobre estos datos.
          </span>
        </div>
      </div>
    </fieldset>
  );
}

function extractConfig(raw: any): BusinessConfig {
  const anchoRaw: any = raw?.anchoTicket;
  const vistaRaw: any = raw?.vistaDefectoPOS;
  const flags = (raw?.featureFlags ?? {}) as BusinessConfig["featureFlags"];
  const fRaw: any =
    raw?.datosFiscales && typeof raw.datosFiscales === "object" ? raw.datosFiscales : {};
  const datosFiscales: DatosFiscales = {
    rfc: typeof fRaw.rfc === "string" ? fRaw.rfc : undefined,
    razonSocial: typeof fRaw.razonSocial === "string" ? fRaw.razonSocial : undefined,
    regimenFiscal: typeof fRaw.regimenFiscal === "string" ? fRaw.regimenFiscal : undefined,
    codigoPostal: typeof fRaw.codigoPostal === "string" ? fRaw.codigoPostal : undefined,
  };
  const tieneFiscales = Object.values(datosFiscales).some((v) => typeof v === "string" && v.trim());

  return {
    nombreNegocio: raw?.nombreNegocio ?? "Mi Negocio",
    tipoNegocio: raw?.tipoNegocio ?? "PAPELERIA",
    moneda: raw?.moneda ?? "MXN",
    ivaRate: Number(raw?.ivaRate ?? 0),
    featureFlags: {
      inventario: flags.inventario === true,
      facturacion: flags.facturacion === true,
      dashboard: flags.dashboard === true,
      proveedores: flags.proveedores === true,
      bitacora: flags.bitacora === true,
    },
    metodosPago: Array.isArray(raw?.metodosPago) ? raw.metodosPago : ["EFECTIVO", "TRANSFERENCIA"],
    politicaStockOffline:
      raw?.politicaStockOffline === "RECHAZAR" ? "RECHAZAR" : "PERMITIR_NEGATIVO",
    logo: raw?.logo ?? null,
    temaBase: raw?.temaBase ?? "NEON",
    colorAcento: raw?.colorAcento ?? "#10b981",
    datosBancarios: raw?.datosBancarios ?? null,
    usarImagenesProductos: raw?.usarImagenesProductos !== false,
    mensajeTicket:
      typeof raw?.mensajeTicket === "string" && raw.mensajeTicket.trim() ? raw.mensajeTicket : null,
    anchoTicket: anchoRaw === "58mm" || anchoRaw === "80mm" ? anchoRaw : "80mm",
    vistaDefectoPOS:
      vistaRaw === "ESCANER" || vistaRaw === "CATALOGO_TACTIL" ? vistaRaw : "ESCANER",
    datosFiscales: tieneFiscales ? datosFiscales : null,
    configVersion: raw?.configVersion ?? 1,
    setupPendiente: raw?.setupPendiente ?? false,
  };
}