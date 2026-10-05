"use client";

import type { DatosFiscales } from "@/lib/business-types";

// Catálogos SAT oficiales (claves + descripción para el selector).
const REGIMEN_FISCAL_SAT: Array<{ clave: string; descripcion: string }> = [
  { clave: "601", descripcion: "General de Ley Personas Morales" },
  { clave: "603", descripcion: "Personas Morales con Fines no Lucrativos" },
  { clave: "606", descripcion: "Arrendamiento" },
  { clave: "607", descripcion: "Régimen de Enajenación o Adquisición de Bienes" },
  { clave: "608", descripcion: "Demás ingresos" },
  { clave: "610", descripcion: "Residentes en el Extranjero sin Establecimiento Permanente" },
  { clave: "611", descripcion: "Ingresos por Dividendos" },
  { clave: "612", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales" },
  { clave: "614", descripcion: "Ingresos por intereses" },
  { clave: "615", descripcion: "Régimen de los ingresos por obtención de premios" },
  { clave: "616", descripcion: "Sin obligaciones fiscales" },
  { clave: "621", descripcion: "Incorporación Fiscal" },
  { clave: "625", descripcion: "Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas" },
  { clave: "626", descripcion: "Régimen Simplificado de Confianza" },
  { clave: "628", descripcion: "Hidrocarburos" },
  { clave: "629", descripcion: "Régimenes Fiscales Preferentes y de las Empresas Multinacionales" },
  { clave: "630", descripcion: "Enajenación de acciones en bolsa de valores" },
  { clave: "636", descripcion: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras" },
  { clave: "639", descripcion: "Hidrocarburos (base única)" },
  { clave: "651", descripcion: "Sin sujeción a contribuciones" },
  { clave: "652", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales (Plataformas)" },
  { clave: "653", descripcion: "Personas Físicas con Actividades Empresariales y Profesionales (Régimen Simplificado de Confianza)" },
  { clave: "655", descripcion: "No contribuyente" },
];

const USO_CFDI_SAT: Array<{ clave: string; descripcion: string }> = [
  { clave: "G01", descripcion: "Adquisición de mercancías" },
  { clave: "G02", descripcion: "Devoluciones, descuentos o bonificaciones" },
  { clave: "G03", descripcion: "Gastos en general" },
  { clave: "G04", descripcion: "Construcciones" },
  { clave: "G05", descripcion: "Mobiliario y equipo de oficina por inversiones" },
  { clave: "G06", descripcion: "Equipo de transporte" },
  { clave: "G07", descripcion: "Equipo de cómputo y accesorios" },
  { clave: "G08", descripcion: "Otras máquinas y equipos" },
  { clave: "G09", descripcion: "Otros bienes inmuebles" },
  { clave: "G10", descripcion: "Pagos realizados en los sistemas de pago autorizados" },
  { clave: "I01", descripcion: "Construcciones" },
  { clave: "I02", descripcion: "Mobiliario y equipo de oficina" },
  { clave: "I03", descripcion: "Equipo de transporte" },
  { clave: "I04", descripcion: "Equipo de cómputo y accesorios" },
  { clave: "I05", descripcion: "Otras máquinas y equipos" },
  { clave: "I06", descripcion: "Otros bienes inmuebles" },
  { clave: "I07", descripcion: "Activos intangibles" },
  { clave: "I08", descripcion: "Otras inversiones" },
  { clave: "P01", descripcion: "Por definir" },
  { clave: "P04", descripcion: "Obligaciones de pago por obligaciones cubiertas por partes" },
  { clave: "P05", descripcion: "Obligaciones de pago determinadas en días hábiles" },
  { clave: "S01", descripcion: "Sin efectos fiscales" },
  { clave: "CP01", descripcion: "Pagos" },
  { clave: "D01", descripcion: "Honorarios médicos, dentales y gastos hospitalarios" },
  { clave: "D02", descripcion: "Gastos médicos por incapacidad o discapacidad" },
  { clave: "D03", descripcion: "Gastos funerales" },
  { clave: "D04", descripcion: "Donativos" },
  { clave: "D05", descripcion: "Intereses reales efectivamente pagados por créditos hipotecarios" },
  { clave: "D06", descripcion: "Aportaciones voluntarias al SAR" },
  { clave: "D07", descripcion: "Primas por seguros de gastos médicos" },
  { clave: "D08", descripcion: "Gastos de transportación escolar obligatoria" },
  { clave: "D09", descripcion: "Depósitos en cuentas para el ahorro" },
  { clave: "D10", descripcion: "Pagos por servicios educativos (colegiaturas)" },
];

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
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-3">
          Identificación fiscal (SAT)
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
              placeholder="GARC001101HDFRRL09"
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