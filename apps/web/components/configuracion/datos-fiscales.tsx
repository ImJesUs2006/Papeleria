"use client";

import type { DatosFiscales } from "@/lib/business-types";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/sat-catalogos";
export { clienteADatosFiscales, datosFiscalesACliente, erroresClienteAEditor, type ClienteFiscal } from "@/lib/cliente-fiscal";

// ============================================================
// Datos fiscales (CFDI 4.0). Un solo editor para el EMISOR (el negocio, en
// Configuración) y el RECEPTOR (cada cliente): mismos campos, mismos
// catálogos del SAT y mismas reglas. El régimen se filtra por el tipo de
// RFC (12 = empresa, 13 = persona física).
// ============================================================

function Campo({
  label,
  children,
  hint,
  error,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <span className="text-xs text-muted mb-1 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-[11px] font-semibold text-rose-300">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>
      )}
    </label>
  );
}

export function DatosFiscalesEditor({
  datos,
  onChange,
  disabled,
  modo = "emisor",
  errores = {},
}: {
  datos: DatosFiscales | null;
  onChange: (datos: DatosFiscales) => void;
  disabled?: boolean;
  /** "emisor" = tu negocio · "receptor" = el cliente al que le facturas. */
  modo?: "emisor" | "receptor";
  /** Mensajes por campo (rfc, regimenFiscal, cp, …). */
  errores?: Partial<Record<keyof DatosFiscales, string>>;
}) {
  const setCampo = <K extends keyof DatosFiscales>(key: K, valor: string) => {
    const next = { ...(datos ?? {}), [key]: (valor.trim() || undefined) as DatosFiscales[K] };
    if (valor.trim()) {
      if (key === "rfc") next.rfc = valor.trim().toUpperCase() as DatosFiscales["rfc"];
      if (key === "curp") next.curp = valor.trim().toUpperCase() as DatosFiscales["curp"];
      if (key === "cp") next.cp = valor.replace(/\D/g, "").slice(0, 5) as DatosFiscales["cp"];
    }
    onChange(next);
  };
  const emisor = modo === "emisor";
  // El receptor vive en un modal angosto: rejilla de 2 columnas en vez de 12.
  const compacto = !emisor;
  const col = (amplio: string, angosto: string) => `block ${compacto ? angosto : amplio}`;
  const largoRfc = (datos?.rfc ?? "").length;
  const regimenes = REGIMENES_FISCALES.filter((r) => (largoRfc === 12 ? r.moral : largoRfc === 13 ? r.fisica : true));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1">
          {emisor ? "Tus datos como emisor (SAT)" : "Datos fiscales del cliente (receptor)"}
        </p>
        <p className="mb-3 text-[11px] text-muted">
          {emisor
            ? "Son los datos de TU negocio, los que aparecen como quien factura. Los de cada cliente (receptor) se capturan en su ficha en Clientes."
            : "Opcionales; obligatorios solo para facturarle. Cópialos de su Constancia de Situación Fiscal (RFC, nombre exacto, régimen y C.P.)."}
        </p>
        <div className={compacto ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
          <Campo label="RFC" hint="Persona física (13 caracteres) o empresa (12)." error={errores.rfc}>
            <input
              value={datos?.rfc ?? ""}
              onChange={(e) => setCampo("rfc", e.target.value)}
              placeholder={emisor ? "XAXX010101000" : "13 (persona) o 12 (empresa)"}
              maxLength={13}
              disabled={disabled}
              aria-label="RFC"
              className="input-dark uppercase"
            />
          </Campo>
          {emisor ? (
            <Campo label="CURP (opcional, persona física)" hint="18 caracteres, formato oficial del SAT." error={errores.curp}>
              <input
                value={datos?.curp ?? ""}
                onChange={(e) => setCampo("curp", e.target.value)}
                placeholder="18 caracteres"
                maxLength={18}
                disabled={disabled}
                className="input-dark uppercase"
              />
            </Campo>
          ) : (
            <span className="hidden md:block" />
          )}
          <Campo
            label={emisor ? "Razón social / Nombre" : "Nombre o razón social (como en su constancia)"}
            className="block md:col-span-2"
            error={errores.razonSocial}
          >
            <input
              value={datos?.razonSocial ?? ""}
              onChange={(e) => setCampo("razonSocial", e.target.value)}
              placeholder={emisor ? "Papelería El Lápiz S.A. de C.V." : "ESCUELA KEMPER URGATE"}
              maxLength={120}
              disabled={disabled}
              aria-label="Razón social"
              className="input-dark"
            />
          </Campo>
          <Campo label="Régimen fiscal (catálogo SAT)" error={errores.regimenFiscal}>
            <select
              value={datos?.regimenFiscal ?? ""}
              onChange={(e) => setCampo("regimenFiscal", e.target.value)}
              disabled={disabled}
              aria-label="Régimen fiscal"
              className="input-dark"
            >
              <option value="" className="bg-surface-800">
                — Selecciona —
              </option>
              {regimenes.map((r) => (
                <option key={r.clave} value={r.clave} className="bg-surface-800">
                  {r.clave} · {r.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            label={emisor ? "Uso de CFDI (catálogo SAT)" : "Uso de CFDI que pide el cliente"}
            error={errores.usoCFDI}
          >
            <select
              value={datos?.usoCFDI ?? ""}
              onChange={(e) => setCampo("usoCFDI", e.target.value)}
              disabled={disabled}
              aria-label="Uso de CFDI"
              className="input-dark"
            >
              <option value="" className="bg-surface-800">
                — Selecciona —
              </option>
              {USOS_CFDI.map((u) => (
                <option key={u.clave} value={u.clave} className="bg-surface-800">
                  {u.clave} · {u.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
          Domicilio fiscal{!emisor && " (el SAT solo exige el C.P.)"}
        </p>
        <div className={compacto ? "grid grid-cols-2 gap-3" : "grid grid-cols-1 md:grid-cols-12 gap-4"}>
          <Campo label="Calle" className={col("md:col-span-6", "col-span-2")} error={errores.calle}>
            <input
              value={datos?.calle ?? ""}
              onChange={(e) => setCampo("calle", e.target.value)}
              placeholder="Av. Revolución"
              maxLength={120}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Núm. exterior" className={col("md:col-span-2", "")} error={errores.numExt}>
            <input
              value={datos?.numExt ?? ""}
              onChange={(e) => setCampo("numExt", e.target.value)}
              placeholder="12A"
              maxLength={10}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Núm. interior" className={col("md:col-span-2", "")} error={errores.numInt}>
            <input
              value={datos?.numInt ?? ""}
              onChange={(e) => setCampo("numInt", e.target.value)}
              placeholder="2"
              maxLength={10}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="C.P." className={col("md:col-span-2", "")} error={errores.cp}>
            <input
              value={datos?.cp ?? ""}
              onChange={(e) => setCampo("cp", e.target.value)}
              placeholder="06600"
              maxLength={5}
              disabled={disabled}
              inputMode="numeric"
              aria-label="Código postal fiscal"
              className="input-dark"
            />
          </Campo>
          <Campo label="Colonia" className={col("md:col-span-5", "")} error={errores.colonia}>
            <input
              value={datos?.colonia ?? ""}
              onChange={(e) => setCampo("colonia", e.target.value)}
              placeholder="Centro"
              maxLength={80}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Municipio / Alcaldía" className={col("md:col-span-4", "")} error={errores.municipio}>
            <input
              value={datos?.municipio ?? ""}
              onChange={(e) => setCampo("municipio", e.target.value)}
              placeholder="Cuauhtémoc"
              maxLength={80}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Estado" className={col("md:col-span-3", "")} error={errores.estado}>
            <input
              value={datos?.estado ?? ""}
              onChange={(e) => setCampo("estado", e.target.value)}
              placeholder="CDMX"
              maxLength={60}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
        </div>
      </div>
    </div>
  );
}
