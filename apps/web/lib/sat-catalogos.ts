// ============================================================
// Catálogos del SAT (CFDI 4.0) con su descripción, para listas
// desplegables y validación. Una sola fuente de verdad.
// ============================================================

/** c_RegimenFiscal: [clave, descripción, aplica a física (F) / moral (M)]. */
export const REGIMENES_FISCALES: ReadonlyArray<{ clave: string; nombre: string; fisica: boolean; moral: boolean }> = [
  { clave: "601", nombre: "General de Ley Personas Morales", fisica: false, moral: true },
  { clave: "603", nombre: "Personas Morales con Fines no Lucrativos", fisica: false, moral: true },
  { clave: "605", nombre: "Sueldos y Salarios e Ingresos Asimilados a Salarios", fisica: true, moral: false },
  { clave: "606", nombre: "Arrendamiento", fisica: true, moral: false },
  { clave: "607", nombre: "Régimen de Enajenación o Adquisición de Bienes", fisica: true, moral: false },
  { clave: "608", nombre: "Demás ingresos", fisica: true, moral: false },
  { clave: "610", nombre: "Residentes en el Extranjero sin Establecimiento Permanente en México", fisica: true, moral: true },
  { clave: "611", nombre: "Ingresos por Dividendos (socios y accionistas)", fisica: true, moral: false },
  { clave: "612", nombre: "Personas Físicas con Actividades Empresariales y Profesionales", fisica: true, moral: false },
  { clave: "614", nombre: "Ingresos por intereses", fisica: true, moral: false },
  { clave: "615", nombre: "Régimen de los ingresos por obtención de premios", fisica: true, moral: false },
  { clave: "616", nombre: "Sin obligaciones fiscales", fisica: true, moral: false },
  { clave: "620", nombre: "Sociedades Cooperativas de Producción que optan por diferir sus ingresos", fisica: false, moral: true },
  { clave: "621", nombre: "Incorporación Fiscal", fisica: true, moral: false },
  { clave: "622", nombre: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras", fisica: false, moral: true },
  { clave: "623", nombre: "Opcional para Grupos de Sociedades", fisica: false, moral: true },
  { clave: "624", nombre: "Coordinados", fisica: false, moral: true },
  { clave: "625", nombre: "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas", fisica: true, moral: false },
  { clave: "626", nombre: "Régimen Simplificado de Confianza (RESICO)", fisica: true, moral: true },
];

/** c_UsoCFDI vigentes en CFDI 4.0. */
export const USOS_CFDI: ReadonlyArray<{ clave: string; nombre: string }> = [
  { clave: "G01", nombre: "Adquisición de mercancías" },
  { clave: "G02", nombre: "Devoluciones, descuentos o bonificaciones" },
  { clave: "G03", nombre: "Gastos en general" },
  { clave: "I01", nombre: "Construcciones" },
  { clave: "I02", nombre: "Mobiliario y equipo de oficina por inversiones" },
  { clave: "I03", nombre: "Equipo de transporte" },
  { clave: "I04", nombre: "Equipo de cómputo y accesorios" },
  { clave: "I05", nombre: "Dados, troqueles, moldes, matrices y herramental" },
  { clave: "I06", nombre: "Comunicaciones telefónicas" },
  { clave: "I07", nombre: "Comunicaciones satelitales" },
  { clave: "I08", nombre: "Otra maquinaria y equipo" },
  { clave: "D01", nombre: "Honorarios médicos, dentales y gastos hospitalarios" },
  { clave: "D02", nombre: "Gastos médicos por incapacidad o discapacidad" },
  { clave: "D03", nombre: "Gastos funerales" },
  { clave: "D04", nombre: "Donativos" },
  { clave: "D05", nombre: "Intereses reales pagados por créditos hipotecarios (casa habitación)" },
  { clave: "D06", nombre: "Aportaciones voluntarias al SAR" },
  { clave: "D07", nombre: "Primas por seguros de gastos médicos" },
  { clave: "D08", nombre: "Gastos de transportación escolar obligatoria" },
  { clave: "D09", nombre: "Depósitos en cuentas para el ahorro, primas de pensiones" },
  { clave: "D10", nombre: "Pagos por servicios educativos (colegiaturas)" },
  { clave: "S01", nombre: "Sin efectos fiscales" },
  { clave: "CP01", nombre: "Pagos" },
  { clave: "CN01", nombre: "Nómina" },
];

export const CLAVES_REGIMEN = REGIMENES_FISCALES.map((r) => r.clave);
export const CLAVES_USO = USOS_CFDI.map((u) => u.clave);

/** Persona moral = RFC de 12 caracteres; física = 13. */
export function regimenCompatible(clave: string, rfc: string | null | undefined): boolean {
  const r = REGIMENES_FISCALES.find((x) => x.clave === clave);
  if (!r) return false;
  if (!rfc) return true;
  return rfc.length === 12 ? r.moral : r.fisica;
}

/** Portal gratuito del SAT para emitir facturas (flujo manual). */
export const PORTAL_FACTURACION_SAT = "https://portal.facturaelectronica.sat.gob.mx/";
