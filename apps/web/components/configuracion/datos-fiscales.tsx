"use client";

import type { DatosFiscales } from "@/lib/business-types";
import { REGIMENES_FISCALES, USOS_CFDI } from "@/lib/sat-catalogos";

// Catálogos SAT vigentes (CFDI 4.0), una sola fuente en lib/sat-catalogos.
const REGIMEN_FISCAL_SAT = REGIMENES_FISCALES.map((r) => ({ clave: r.clave, descripcion: r.nombre }));
const USO_CFDI_SAT = USOS_CFDI.map((u) => ({ clave: u.clave, descripcion: u.nombre }));

function Campo({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={className ?? "block"}>
      <span className="text-xs text-muted mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function DatosFiscalesEditor({
  datos,
  onChange,
  disabled,
}: {
  datos: DatosFiscales | null;
  onChange: (datos: DatosFiscales) => void;
  disabled?: boolean;
}) {
  const setCampo = <K extends keyof DatosFiscales>(key: K, valor: string) => {
    const next = { ...(datos ?? {}), [key]: (valor.trim() || undefined) as DatosFiscales[K] };
    if (valor.trim()) {
      if (key === "rfc") next.rfc = valor.trim().toUpperCase() as DatosFiscales["rfc"];
      if (key === "curp") next.curp = valor.trim().toUpperCase() as DatosFiscales["curp"];
    }
    onChange(next);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1">
          Tus datos como emisor (SAT)
        </p>
        <p className="mb-3 text-[11px] text-muted">
          Son los datos de TU negocio, los que aparecen como quien factura. Los de cada cliente (receptor) se
          capturan en su ficha en Clientes.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Campo
            label="RFC"
            hint="Persona física (13 caracteres) o moral (12)."
          >
            <input
              value={datos?.rfc ?? ""}
              onChange={(e) => setCampo("rfc", e.target.value)}
              placeholder="XAXX010101000"
              maxLength={13}
              disabled={disabled}
              className="input-dark uppercase"
            />
          </Campo>
          <Campo
            label="CURP (opcional, persona física)"
            hint="18 caracteres, formato oficial del SAT."
          >
            <input
              value={datos?.curp ?? ""}
              onChange={(e) => setCampo("curp", e.target.value)}
              placeholder="18 caracteres"
              maxLength={18}
              disabled={disabled}
              className="input-dark uppercase"
            />
          </Campo>
          <Campo label="Razón social / Nombre" className="block md:col-span-2">
            <input
              value={datos?.razonSocial ?? ""}
              onChange={(e) => setCampo("razonSocial", e.target.value)}
              placeholder="Papelería El Lápiz S.A. de C.V."
              maxLength={120}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Régimen fiscal (catálogo SAT)">
            <select
              value={datos?.regimenFiscal ?? ""}
              onChange={(e) => setCampo("regimenFiscal", e.target.value)}
              disabled={disabled}
              className="input-dark"
            >
              <option value="" className="bg-surface-800">
                — Selecciona —
              </option>
              {REGIMEN_FISCAL_SAT.map((r) => (
                <option key={r.clave} value={r.clave} className="bg-surface-800">
                  {r.clave} · {r.descripcion}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Uso de CFDI (catálogo SAT)">
            <select
              value={datos?.usoCFDI ?? ""}
              onChange={(e) => setCampo("usoCFDI", e.target.value)}
              disabled={disabled}
              className="input-dark"
            >
              <option value="" className="bg-surface-800">
                — Selecciona —
              </option>
              {USO_CFDI_SAT.map((u) => (
                <option key={u.clave} value={u.clave} className="bg-surface-800">
                  {u.clave} · {u.descripcion}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
          Domicilio fiscal
        </p>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Campo label="Calle" className="block md:col-span-6">
            <input
              value={datos?.calle ?? ""}
              onChange={(e) => setCampo("calle", e.target.value)}
              placeholder="Av. Revolución"
              maxLength={120}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Núm. exterior" className="block md:col-span-2">
            <input
              value={datos?.numExt ?? ""}
              onChange={(e) => setCampo("numExt", e.target.value)}
              placeholder="12A"
              maxLength={10}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Núm. interior" className="block md:col-span-2">
            <input
              value={datos?.numInt ?? ""}
              onChange={(e) => setCampo("numInt", e.target.value)}
              placeholder="2"
              maxLength={10}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="C.P." className="block md:col-span-2">
            <input
              value={datos?.cp ?? ""}
              onChange={(e) => setCampo("cp", e.target.value)}
              placeholder="06600"
              maxLength={5}
              disabled={disabled}
              inputMode="numeric"
              className="input-dark"
            />
          </Campo>
          <Campo label="Colonia" className="block md:col-span-5">
            <input
              value={datos?.colonia ?? ""}
              onChange={(e) => setCampo("colonia", e.target.value)}
              placeholder="Centro"
              maxLength={80}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Municipio / Alcaldía" className="block md:col-span-4">
            <input
              value={datos?.municipio ?? ""}
              onChange={(e) => setCampo("municipio", e.target.value)}
              placeholder="Cuauhtémoc"
              maxLength={80}
              disabled={disabled}
              className="input-dark"
            />
          </Campo>
          <Campo label="Estado" className="block md:col-span-3">
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