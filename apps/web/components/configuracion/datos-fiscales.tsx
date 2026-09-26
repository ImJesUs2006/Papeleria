"use client";

import type { DatosFiscales } from "@/lib/business-types";

const CAMPOS: Array<{
  key: keyof DatosFiscales;
  label: string;
  placeholder: string;
  max: number;
  hint?: string;
}> = [
  {
    key: "rfc",
    label: "RFC",
    placeholder: "XAXX010101000",
    max: 20,
    hint: "Persona física o moral, hasta 13 caracteres.",
  },
  {
    key: "razonSocial",
    label: "Razón social",
    placeholder: "Papelería El Lápiz S.A. de C.V.",
    max: 120,
  },
  {
    key: "regimenFiscal",
    label: "Régimen fiscal",
    placeholder: "601 - General de Ley Personas Morales",
    max: 60,
  },
  {
    key: "codigoPostal",
    label: "Código postal",
    placeholder: "06600",
    max: 10,
    hint: "Necesario para validar en el SAT.",
  },
];

export function DatosFiscalesEditor({
  datos,
  onChange,
  disabled,
}: {
  datos: DatosFiscales | null;
  onChange: (datos: DatosFiscales) => void;
  disabled?: boolean;
}) {
  const setCampo = (key: keyof DatosFiscales, valor: string) => {
    onChange({ ...(datos ?? {}), [key]: valor || undefined });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {CAMPOS.map((c) => (
        <label key={c.key} className="block">
          <span className="text-xs text-muted mb-1 block">{c.label}</span>
          <input
            value={datos?.[c.key] ?? ""}
            onChange={(e) => setCampo(c.key, e.target.value)}
            placeholder={c.placeholder}
            maxLength={c.max}
            disabled={disabled}
            className="input-dark"
          />
          {c.hint && <span className="mt-1 text-[11px] text-muted">{c.hint}</span>}
        </label>
      ))}
    </div>
  );
}