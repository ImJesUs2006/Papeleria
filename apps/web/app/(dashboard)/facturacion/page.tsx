"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileText, Pencil } from "lucide-react";
import { FacturacionEmitir } from "@/components/facturacion/facturacion-emitir";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import { faltantesEmisor } from "@/lib/factura-manual";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/sat-catalogos";

// ============================================================
// Facturación: emitir y listar facturas. Los datos del EMISOR se leen de
// Configuración → Financiero (una sola fuente): aquí solo se muestran y se
// avisa qué falta, para no capturarlos dos veces.
// ============================================================

export default function FacturacionPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h2 className="text-2xl font-black text-gray-100 mb-1">Facturación</h2>
        <p className="text-sm text-muted">CFDI 4.0 · prepara cada factura con los datos de tu negocio y de tu cliente.</p>
      </motion.div>

      <ErrorBoundary>
        <EmisorResumen />
      </ErrorBoundary>

      <div className="mt-6">
        <ErrorBoundary>
          <FacturacionEmitir />
        </ErrorBoundary>
      </div>
    </div>
  );
}

function EmisorResumen() {
  const config = useConfigStore((s) => s.config);
  const esAdmin = useAuthStore((s) => s.rol) === "ADMINISTRADORA";
  const d = config?.datosFiscales ?? null;
  const faltan = faltantesEmisor(d);
  const regimen = REGIMENES_FISCALES.find((r) => r.clave === d?.regimenFiscal);
  const uso = USOS_CFDI.find((u) => u.clave === d?.usoCFDI);
  const domicilio = [
    [d?.calle, d?.numExt && `#${d.numExt}`, d?.numInt && `int. ${d.numInt}`].filter(Boolean).join(" "),
    d?.colonia,
    d?.municipio,
    d?.estado,
    (d?.cp || d?.codigoPostal) && `C.P. ${d?.cp || d?.codigoPostal}`,
  ]
    .filter(Boolean)
    .join(", ");
  const filas: Array<[string, string | null | undefined]> = [
    ["RFC", d?.rfc],
    ["Razón social", d?.razonSocial],
    ["Régimen fiscal", regimen ? `${regimen.clave} · ${regimen.nombre}` : d?.regimenFiscal],
    ["Uso de CFDI por defecto", uso ? `${uso.clave} · ${uso.nombre}` : null],
    ["Domicilio fiscal", domicilio || null],
  ];

  return (
    <section className="rounded-2xl border border-surface-600 bg-surface-800 p-5" data-testid="emisor-resumen">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon-cyan/10">
            <FileText className="h-5 w-5 text-neon-cyan" />
          </div>
          <div>
            <h3 className="font-bold text-gray-100">Tus datos como emisor</h3>
            <p className="text-xs text-muted">Se toman de Configuración → Financiero. No hace falta escribirlos aquí.</p>
          </div>
        </div>
        {esAdmin && (
          <Link
            href="/configuracion?tab=negocio&seccion=financiero"
            className="inline-flex items-center gap-1.5 rounded-xl border border-surface-500 px-3 py-2 text-xs font-bold text-gray-200 hover:border-acento/60 hover:text-acento"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar en Configuración
          </Link>
        )}
      </div>

      {faltan.length > 0 ? (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Para facturar falta: {faltan.join(", ")}.
        </p>
      ) : (
        <p className="mb-3 flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Datos del emisor completos.
        </p>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm md:grid-cols-2">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-surface-700 py-1">
            <dt className="shrink-0 text-xs text-muted">{k}</dt>
            <dd className="min-w-0 truncate text-right text-gray-100" title={v ?? undefined}>
              {v || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
