import type { TipoNegocio } from "./business-types";

// ============================================================
// Personalización del giro (puro: servidor y cliente).
//
//   vocabulario       → cómo llama el negocio a sus cosas ("Medicamento",
//                       "Paciente", "Prenda"…).
//   etiquetasRol      → nombre visible de los roles base.
//   camposProducto    → campos propios del giro que se capturan en cada
//                       producto (sustancia activa, marca, medida…).
//   usarTipoImpresion → muestra el campo de impresión (solo papelerías).
//
// Cada giro trae una plantilla; el negocio puede ajustarla.
// ============================================================

export interface Vocabulario {
  producto: string;
  productos: string;
  cliente: string;
  clientes: string;
  recarga: string;
  apartado: string;
}

export type TipoCampo = "texto" | "numero" | "lista";

export interface CampoPersonalizado {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  opciones?: string[];
}

export interface Personalizacion {
  vocabulario: Vocabulario;
  etiquetasRol: { ADMINISTRADORA: string; CAJERA: string };
  camposProducto: CampoPersonalizado[];
  usarTipoImpresion: boolean;
}

export const MAX_CAMPOS_PRODUCTO = 8;

const VOCABULARIO_BASE: Vocabulario = {
  producto: "Producto",
  productos: "Productos",
  cliente: "Cliente",
  clientes: "Clientes",
  recarga: "Recarga",
  apartado: "Apartado",
};

const ETIQUETAS_BASE = { ADMINISTRADORA: "Administrador(a)", CAJERA: "Cajero(a)" };

const campo = (clave: string, etiqueta: string, tipo: TipoCampo = "texto", opciones?: string[]) => ({
  clave,
  etiqueta,
  tipo,
  ...(opciones ? { opciones } : {}),
});

/** Plantilla de cada giro (punto de partida editable). */
export function presetPorGiro(tipo: TipoNegocio | string | null | undefined): Personalizacion {
  const base: Personalizacion = {
    vocabulario: { ...VOCABULARIO_BASE },
    etiquetasRol: { ...ETIQUETAS_BASE },
    camposProducto: [],
    usarTipoImpresion: false,
  };
  switch (tipo) {
    case "PAPELERIA_RETAIL":
      return {
        ...base,
        usarTipoImpresion: true,
        camposProducto: [
          campo("marca", "Marca"),
          campo("linea", "Línea", "lista", ["Escolar", "Oficina", "Arte y manualidades", "Regalos", "Cómputo"]),
          campo("presentacion", "Presentación", "lista", ["Pieza", "Paquete", "Caja", "Resma"]),
        ],
      };
    case "FARMACIA":
      return {
        ...base,
        vocabulario: {
          ...base.vocabulario,
          producto: "Medicamento",
          productos: "Medicamentos",
          cliente: "Paciente",
          clientes: "Pacientes",
          recarga: "Servicio",
        },
        camposProducto: [
          campo("sustancia", "Sustancia activa"),
          campo("laboratorio", "Laboratorio"),
          campo("presentacion", "Presentación"),
          campo("receta", "Requiere receta", "lista", ["No", "Sí", "Controlado"]),
        ],
      };
    case "BOUTIQUE":
      return {
        ...base,
        vocabulario: { ...base.vocabulario, producto: "Prenda", productos: "Prendas" },
        camposProducto: [
          campo("marca", "Marca"),
          campo("temporada", "Temporada", "lista", ["Primavera-Verano", "Otoño-Invierno", "Todo el año"]),
          campo("material", "Material"),
        ],
      };
    case "FERRETERIA":
      return {
        ...base,
        vocabulario: { ...base.vocabulario, producto: "Artículo", productos: "Artículos" },
        camposProducto: [campo("marca", "Marca"), campo("medida", "Medida"), campo("material", "Material")],
      };
    case "ABARROTES":
      return {
        ...base,
        camposProducto: [
          campo("marca", "Marca"),
          campo("contenido", "Contenido neto"),
          campo("presentacion", "Presentación", "lista", ["Pieza", "Paquete", "Caja", "Granel"]),
        ],
      };
    case "SERVICIOS":
      return {
        ...base,
        vocabulario: { ...base.vocabulario, producto: "Servicio", productos: "Servicios", recarga: "Servicio" },
        camposProducto: [campo("duracion", "Duración (min)", "numero"), campo("responsable", "Responsable")],
      };
    case "MIXTO":
      return { ...base, usarTipoImpresion: true, camposProducto: [campo("marca", "Marca")] };
    default:
      return base;
  }
}

const texto = (v: unknown, max: number, porDefecto: string) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || porDefecto;
};

/** Personalización guardada + plantilla del giro para lo que falte. */
export function normalizarPersonalizacion(
  raw: unknown,
  tipo: TipoNegocio | string | null | undefined
): Personalizacion {
  const preset = presetPorGiro(tipo);
  if (!raw || typeof raw !== "object") return preset;
  const r = raw as Record<string, any>;
  const voc = (r.vocabulario ?? {}) as Record<string, unknown>;
  const roles = (r.etiquetasRol ?? {}) as Record<string, unknown>;

  const vocabulario = Object.fromEntries(
    (Object.keys(preset.vocabulario) as (keyof Vocabulario)[]).map((k) => [
      k,
      texto(voc[k], 30, preset.vocabulario[k]),
    ])
  ) as unknown as Vocabulario;

  let camposProducto = preset.camposProducto;
  if (Array.isArray(r.camposProducto)) {
    try {
      camposProducto = validarCamposProducto(r.camposProducto);
    } catch {
      camposProducto = preset.camposProducto;
    }
  }

  return {
    vocabulario,
    etiquetasRol: {
      ADMINISTRADORA: texto(roles.ADMINISTRADORA, 30, preset.etiquetasRol.ADMINISTRADORA),
      CAJERA: texto(roles.CAJERA, 30, preset.etiquetasRol.CAJERA),
    },
    camposProducto,
    usarTipoImpresion:
      typeof r.usarTipoImpresion === "boolean" ? r.usarTipoImpresion : preset.usarTipoImpresion,
  };
}

/** Valida la definición de campos personalizados (lanza Error con mensaje). */
export function validarCamposProducto(raw: unknown[]): CampoPersonalizado[] {
  if (raw.length > MAX_CAMPOS_PRODUCTO) {
    throw new Error(`Máximo ${MAX_CAMPOS_PRODUCTO} campos personalizados`);
  }
  const vistos = new Set<string>();
  return raw.map((c: any) => {
    const etiqueta = String(c?.etiqueta ?? "").trim().slice(0, 40);
    if (etiqueta.length < 2) throw new Error("Cada campo necesita un nombre de al menos 2 letras");
    const clave =
      String(c?.clave ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30) ||
      etiqueta
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 30);
    if (!clave) throw new Error(`Nombre de campo inválido: ${etiqueta}`);
    if (vistos.has(clave)) throw new Error(`Campo repetido: ${etiqueta}`);
    vistos.add(clave);
    const tipo: TipoCampo = c?.tipo === "numero" ? "numero" : c?.tipo === "lista" ? "lista" : "texto";
    if (tipo === "lista") {
      const opciones = Array.isArray(c?.opciones)
        ? c.opciones.map((o: unknown) => String(o).trim().slice(0, 40)).filter(Boolean)
        : [];
      if (opciones.length < 2) throw new Error(`La lista "${etiqueta}" necesita al menos 2 opciones`);
      return { clave, etiqueta, tipo, opciones: [...new Set<string>(opciones)].slice(0, 20) };
    }
    return { clave, etiqueta, tipo };
  });
}

/**
 * Valida los valores de un producto contra los campos del negocio.
 * Ignora claves que no estén definidas; vacíos se omiten.
 */
export function validarAtributos(
  raw: unknown,
  campos: CampoPersonalizado[]
): Record<string, string | number> {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("Atributos inválidos");
  const valores = raw as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const c of campos) {
    const v = valores[c.clave];
    if (v === undefined || v === null || v === "") continue;
    if (c.tipo === "numero") {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`"${c.etiqueta}" debe ser un número`);
      out[c.clave] = n;
    } else if (c.tipo === "lista") {
      const s = String(v);
      if (!c.opciones?.includes(s)) throw new Error(`"${c.etiqueta}": opción no válida`);
      out[c.clave] = s;
    } else {
      out[c.clave] = String(v).trim().slice(0, 120);
    }
  }
  return out;
}
