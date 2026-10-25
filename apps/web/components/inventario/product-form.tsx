"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Save,
  Loader2,
  AlertTriangle,
  Barcode,
  Sparkles,
  ScanLine,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ImagenProductoUpload } from "@/components/inventario/imagen-producto-upload";
import {
  EditorEscalas,
  escalasAFilas,
  filasAEscalas,
  type FilaEscala,
} from "@/components/inventario/editor-escalas";
import { EscalaError, validarEscalas, type EscalaPrecio } from "@/lib/precios";
import { TIPO_IMPRESION_OPCIONES } from "@/lib/validate-product";
import { cn } from "@/lib/utils";
import { useConfigStore, usePersonalizacion } from "@/store/config";
import {
  banderasDeTipo,
  CONTROLES_EXTRA,
  controlesPermitidos,
  costoPorPieza,
  MODOS_VENTA,
  stockSeCapturaDirecto,
  tipoDeProducto,
  UNIDADES_COMPRA,
  UNIDADES_GRANEL,
  type ControlExtra,
  type ModoVenta,
} from "@/lib/unidades";

const TIPO_IMPRESION_LABELS: Record<(typeof TIPO_IMPRESION_OPCIONES)[number], string> = {
  BLANCO_NEGRO: "Blanco y negro",
  COLOR: "Color",
  PLOTTER: "Plotter",
};

export interface ProductFormData {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  precioCompra?: number | null;
  /** Impuestos por producto: IVA propio (null = el del negocio), exento, IEPS. */
  tasaIva?: number | null;
  exentoIva?: boolean;
  tasaIeps?: number | null;
  /** Fase 12: imagen del producto (URL de Cloudinary). */
  imagenUrl?: string | null;
  stockActual: number;
  stockMinimo: number;
  ubicacionEstante?: string | null;
  proveedor?: string | null;
  tipoImpresion?: string | null;
  codigoBarras?: string | null;
  permiteDecimales?: boolean;
  esServicio?: boolean;
  fechaCaducidad?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (producto: ProductFormData) => void;
  /** Al crear un modelo con "Variantes": abrir su ficha para generarlas. */
  onAbrirVariantes?: (codigoItem: string) => void;
  /** Si se indica, el formulario entra en modo edición. */
  producto?: ProductFormData | null;
  /** Configuración personalizable (Fase 10): campos según el giro del negocio. */
  usarCaducidad?: boolean;
  usarUbicaciones?: boolean;
}

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .or(z.literal(""));

const numeroRequerido = (campo: string) =>
  z
    .number({ invalid_type_error: `${campo} inválido` })
    .min(0, `El ${campo.toLowerCase()} no puede ser negativo`)
    .max(9_999_999, `${campo} demasiado alto`)
    .refine((v) => Number.isFinite(v), { message: `${campo} es obligatorio` });

const stockFormSchema = (campo: string) =>
  z
    .number({ invalid_type_error: `${campo} inválido` })
    .min(0, `El ${campo.toLowerCase()} no puede ser negativo`)
    .max(1_000_000, `${campo} demasiado alto`)
    .refine((v) => Number.isFinite(v), { message: `${campo} inválido` })
    .refine((v) => Math.round(v * 1000) / 1000 === v, {
      message: `El ${campo.toLowerCase()} admite hasta 3 decimales`,
    });

const formSchema = z
  .object({
    codigoItem: z
      .string()
      .trim()
      .min(1, "El código es obligatorio")
      .max(40, "Máximo 40 caracteres")
      .regex(/^[A-Za-z0-9._-]+$/, "Solo letras, números, punto, guion y guion bajo"),
    descripcion: z
      .string()
      .trim()
      .min(2, "Mínimo 2 caracteres")
      .max(120, "Máximo 120 caracteres"),
    precioUnitario: numeroRequerido("Precio de venta"),
    precioCompra: z
      .number({ invalid_type_error: "Precio de compra inválido" })
      .min(0, "El precio de compra no puede ser negativo")
      .max(9_999_999, "Precio de compra demasiado alto")
      .optional(),
    // Fase D: unidad de compra ("Paquete" de N piezas) y de venta a granel.
    unidadCompra: z.string().trim().max(20, "Máximo 20 caracteres").optional().or(z.literal("")),
    piezasPorUnidad: z
      .number({ invalid_type_error: "Piezas inválidas" })
      .int("Las piezas deben ser enteras")
      .min(1, "Mínimo 1 pieza")
      .max(10_000, "Máximo 10,000 piezas")
      .optional(),
    unidadVenta: z.string().trim().max(10).optional().or(z.literal("")),
    // "" = tasa del negocio · "EXENTO" · o el porcentaje ("16", "8", "0").
    impuestoIva: z.string().optional(),
    tasaIeps: z
      .number({ invalid_type_error: "IEPS inválido" })
      .min(0, "El IEPS no puede ser negativo")
      .max(100, "El IEPS no puede pasar de 100%")
      .optional(),
    imagenUrl: z
      .string()
      .trim()
      .max(500, "La URL de la imagen es demasiado larga")
      .refine(
        (v) =>
          v === "" ||
          v.startsWith("data:image/") ||
          /^https:\/\/[\w.-]+\.cloudinary\.com\//i.test(v),
        "La imagen debe ser una URL de Cloudinary o un data URI"
      )
      .optional()
      .or(z.literal("")),
    stockActual: stockFormSchema("Stock actual"),
    stockMinimo: stockFormSchema("Stock mínimo"),
    codigoBarras: textoOpcional(64),
    ubicacionEstante: textoOpcional(60),
    idCategoria: z.string().max(40).optional(),
    proveedor: textoOpcional(120),
    tipoImpresion: z.enum(TIPO_IMPRESION_OPCIONES).optional().or(z.literal("")),
    fechaCaducidad: z
      .string()
      .trim()
      .max(10, "Fecha inválida")
      .optional()
      .or(z.literal("")),
    permiteDecimales: z.boolean().optional(),
    usaLotes: z.boolean().optional(),
    usaSeries: z.boolean().optional(),
    esServicio: z.boolean().optional(),
  })
  .refine(
    (d) => d.precioCompra == null || d.precioUnitario >= d.precioCompra,
    {
      message: "El precio de venta no puede ser menor al de compra",
      path: ["precioUnitario"],
    }
  )
  .refine((d) => !d.unidadCompra?.trim() || (d.piezasPorUnidad ?? 1) > 1, {
    message: "¿Cuántas piezas trae? Debe ser más de 1",
    path: ["piezasPorUnidad"],
  });

type FormValues = z.infer<typeof formSchema>;

// `reset` de react-hook-form IGNORA los undefined (el campo conserva el valor
// anterior): para vaciar un número opcional hay que pasar "".
const NUMERO_VACIO = "" as unknown as number;

const numeroOpcional = {
  setValueAs: (v: unknown) =>
    v === "" || v === null || v === undefined || Number.isNaN(Number(v))
      ? undefined
      : Number(v),
};

const numeroObligatorio = {
  setValueAs: (v: unknown) =>
    v === "" || v === null || v === undefined || Number.isNaN(Number(v))
      ? undefined
      : Number(v),
};

/** Genera un EAN-13 válido (con dígito verificador) a partir de una semilla. */
function generarEAN13(seed: string): string {
  let base = "";
  for (let i = 0; base.length < 12; i++) {
    const c = seed.charCodeAt(i % seed.length) + i * 7;
    base += String(c % 10);
  }
  base = base.slice(0, 12);
  const suma = base
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (suma % 10)) % 10;
  return base + check;
}

export function ProductFormModal({
  open,
  onClose,
  onSaved,
  onAbrirVariantes,
  producto,
  usarCaducidad = true,
  usarUbicaciones = true,
}: Props) {
  const editando = Boolean(producto);

  const [serverError, setServerError] = useState<string | null>(null);
  // Personalización del giro: vocabulario y campos propios del producto.
  const personalizacion = usePersonalizacion();
  // Módulo "Lotes, series y variantes" apagado: no se ofrecen esas opciones.
  const usaLotesSeries = useConfigStore((s) => s.config?.featureFlags?.lotesSeries !== false);
  const camposGiro = personalizacion.camposProducto;
  const [atributos, setAtributos] = useState<Record<string, string>>({});
  const [escalas, setEscalas] = useState<FilaEscala[]>([]);
  // Las dos preguntas del tipo de producto (lib/unidades).
  const [modo, setModo] = useState<ModoVenta>("PIEZA");
  const [control, setControl] = useState<ControlExtra>("NINGUNO");
  const [esVariante, setEsVariante] = useState(false);
  const controles = controlesPermitidos(modo, usaLotesSeries);
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string }>>([]);
  useEffect(() => {
    if (!open) return;
    fetch("/api/categorias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { categorias: [] }))
      .then((d) => setCategorias(d.categorias ?? []))
      .catch(() => {});
  }, [open]);
  const [cargando, setCargando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setFocus,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigoItem: "",
      descripcion: "",
      precioUnitario: 0,
      precioCompra: undefined,
      stockActual: 0,
      stockMinimo: 5,
      codigoBarras: "",
      ubicacionEstante: "",
      proveedor: "",
      tipoImpresion: "",
      fechaCaducidad: "",
      permiteDecimales: false,
      esServicio: false,
    },
  });

  const precioCompra = watch("precioCompra");
  const precioUnitario = watch("precioUnitario");
  const imagenUrl = watch("imagenUrl");
  const unidadCompra = watch("unidadCompra");
  const piezasPorUnidad = watch("piezasPorUnidad") ?? 1;
  const porPaquete = !!unidadCompra?.trim();
  const margen =
    precioCompra != null && precioUnitario != null ? precioUnitario - precioCompra : null;

  useEffect(() => {
    if (!open) return;
    setServerError(null);

    if (producto) {
      setCargando(true);
      fetch(`/api/productos/${encodeURIComponent(producto.codigoItem)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar"))))
        .then((p) => {
          setEscalas(escalasAFilas(p.escalasPrecio));
          const tipo = tipoDeProducto(p);
          setModo(tipo.modo);
          setControl(tipo.control);
          setEsVariante(!!p.grupoVariante && p.grupoVariante !== p.codigoItem);
          setAtributos(
            Object.fromEntries(
              Object.entries((p.atributos ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])
            )
          );
          reset({
            codigoItem: p.codigoItem,
            descripcion: p.descripcion,
            precioUnitario: Number(p.precioUnitario),
            precioCompra: p.precioCompra != null ? Number(p.precioCompra) : NUMERO_VACIO,
            unidadCompra: p.unidadCompra ?? "",
            piezasPorUnidad: p.piezasPorUnidad ?? 1,
            unidadVenta: p.unidadVenta ?? "",
            imagenUrl: p.imagenUrl ?? "",
            impuestoIva: p.exentoIva ? "EXENTO" : p.tasaIva != null ? String(Number(p.tasaIva)) : "",
            tasaIeps: p.tasaIeps != null ? Number(p.tasaIeps) : NUMERO_VACIO,
            stockActual: Number(p.stockActual),
            stockMinimo: Number(p.stockMinimo),
            codigoBarras: p.codigoBarras ?? "",
            ubicacionEstante: p.ubicacionEstante ?? "",
            idCategoria: p.idCategoria ?? "",
            proveedor: p.proveedor ?? "",
            tipoImpresion: p.tipoImpresion ?? "",
            fechaCaducidad: p.fechaCaducidad ? p.fechaCaducidad.slice(0, 10) : "",
            permiteDecimales: Boolean(p.permiteDecimales),
            usaLotes: Boolean(p.usaLotes),
            usaSeries: Boolean(p.usaSeries),
            esServicio: Boolean(p.esServicio),
          });
        })
        .catch((e) => setServerError(e.message))
        .finally(() => setCargando(false));
    } else {
      setAtributos({});
      setEscalas([]);
      setModo("PIEZA");
      setControl("NINGUNO");
      setEsVariante(false);
      reset({
        codigoItem: "",
        descripcion: "",
        precioUnitario: 0,
        precioCompra: NUMERO_VACIO,
        tasaIeps: NUMERO_VACIO,
        impuestoIva: "",
        imagenUrl: "",
        idCategoria: "",
        stockActual: 0,
        stockMinimo: 5,
        codigoBarras: "",
        ubicacionEstante: "",
        proveedor: "",
        tipoImpresion: "",
        fechaCaducidad: "",
        unidadCompra: "",
        piezasPorUnidad: 1,
        unidadVenta: "",
        permiteDecimales: false,
        esServicio: false,
      });
    }
  }, [open, producto, reset]);

  // Si cambia la forma de venta, el control extra se ajusta a lo permitido.
  useEffect(() => {
    if (!controles.includes(control)) setControl("NINGUNO");
  }, [controles, control]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    // Mismas reglas que el servidor: el error aparece antes de enviar.
    let escalasPrecio: EscalaPrecio[] = [];
    try {
      escalasPrecio = validarEscalas(filasAEscalas(escalas), values.precioUnitario);
    } catch (e) {
      if (e instanceof EscalaError) {
        setServerError(e.message);
        return;
      }
      throw e;
    }
    const payload = {
      codigoItem: values.codigoItem.trim().toUpperCase(),
      descripcion: values.descripcion,
      precioUnitario: values.precioUnitario,
      precioCompra: values.precioCompra ?? null,
      escalasPrecio,
      exentoIva: values.impuestoIva === "EXENTO",
      tasaIva:
        !values.impuestoIva || values.impuestoIva === "EXENTO"
          ? null
          : Number(values.impuestoIva),
      tasaIeps: values.tasaIeps ?? null,
      imagenUrl: values.imagenUrl?.trim() || null,
      stockActual: values.stockActual,
      stockMinimo: values.stockMinimo,
      codigoBarras: values.codigoBarras?.trim() || null,
      ubicacionEstante: values.ubicacionEstante?.trim() || null,
      idCategoria: values.idCategoria || null,
      proveedor: values.proveedor?.trim() || null,
      tipoImpresion: values.tipoImpresion || null,
      fechaCaducidad: values.fechaCaducidad?.trim() || null,
      ...banderasDeTipo(modo, control),
      unidadCompra: modo === "SERVICIO" || !porPaquete ? null : values.unidadCompra!.trim(),
      piezasPorUnidad: modo === "SERVICIO" || !porPaquete ? 1 : values.piezasPorUnidad ?? 1,
      unidadVenta: modo === "GRANEL" ? values.unidadVenta || "kg" : null,
      atributos: camposGiro.length
        ? Object.fromEntries(
            camposGiro
              .filter((c) => (atributos[c.clave] ?? "").trim() !== "")
              .map((c) => [c.clave, c.tipo === "numero" ? Number(atributos[c.clave]) : atributos[c.clave].trim()])
          )
        : undefined,
    };

    try {
      const res = await fetch(
        editando
          ? `/api/productos/${encodeURIComponent(producto!.codigoItem)}`
          : "/api/productos",
        {
          method: editando ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar el producto");
      onSaved?.({ ...payload, ...(data.data ?? data) });
      onClose();
      // Modelo nuevo con variantes: directo a generarlas en su ficha.
      if (!editando && control === "VARIANTES") onAbrirVariantes?.(payload.codigoItem);
    } catch (e: any) {
      setServerError(e.message || "Error al guardar el producto");
    }
  };

  const err = (name: keyof FormValues) =>
    errors[name] ? (
      <span className="text-[11px] text-neon-red mt-1 block">{errors[name]?.message as string}</span>
    ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${editando ? "Editar" : "Nuevo"} ${personalizacion.vocabulario.producto.toLowerCase()}`}
      subtitle={editando ? producto?.codigoItem : "Alta manual en el inventario"}
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100">
            <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" /> {serverError}
          </div>
        )}

        <div
          className="grid gap-4"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Descripción *</span>
              <input {...register("descripcion")} className="input-dark" placeholder="Ej: Cuaderno profesional 100 hojas" />
              {err("descripcion")}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Código de artículo *</span>
                <div className="flex gap-2">
                  <input
                    {...register("codigoItem")}
                    disabled={editando}
                    className={cn("input-dark", editando && "opacity-60 cursor-not-allowed")}
                    placeholder="Ej: CUAD-100"
                  />
                  {!editando && (
                    <button
                      type="button"
                      title="Generar código"
                      onClick={() =>
                        setValue(
                          "codigoItem",
                          `P${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`,
                          { shouldValidate: true }
                        )
                      }
                      className="px-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-muted hover:text-neon-cyan transition-colors shrink-0"
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {err("codigoItem")}
              </label>

              <label className="block">
                <span className="text-xs text-muted mb-1 block">Código de barras</span>
                <div className="flex gap-2">
                  <input
                    {...register("codigoBarras")}
                    className="input-dark"
                    placeholder="Escanea o genera"
                  />
                  <button
                    type="button"
                    title="Enfocar para escanear"
                    onClick={() => setFocus("codigoBarras")}
                    className="px-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-muted hover:text-neon-cyan transition-colors shrink-0"
                  >
                    <ScanLine className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Generar código de barras"
                    onClick={() =>
                      setValue("codigoBarras", generarEAN13(watch("codigoItem") || "PAPELERIA"), {
                        shouldValidate: true,
                      })
                    }
                    className="px-3 rounded-xl bg-surface-700 hover:bg-surface-600 text-muted hover:text-neon-cyan transition-colors shrink-0"
                  >
                    <Barcode className="h-4 w-4" />
                  </button>
                </div>
                {err("codigoBarras")}
              </label>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-gray-100">¿Cómo se vende?</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
                {MODOS_VENTA.map((m) => (
                  <button
                    key={m.valor}
                    type="button"
                    role="radio"
                    aria-checked={modo === m.valor}
                    disabled={esVariante && m.valor === "SERVICIO"}
                    onClick={() => setModo(m.valor)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-40",
                      modo === m.valor ? "border-acento bg-acento/10" : "border-surface-500 hover:border-surface-400"
                    )}
                  >
                    <span className="block text-sm font-bold text-gray-100">{m.titulo}</span>
                    <span className="block text-[11px] text-muted">{m.detalle}</span>
                    <span className="block text-[10px] text-muted/80">Ej.: {m.ejemplo}</span>
                  </button>
                ))}
              </div>
              {modo === "GRANEL" && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  Se vende por
                  <select {...register("unidadVenta")} className="input-dark w-24">
                    {UNIDADES_GRANEL.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  y el precio es por {watch("unidadVenta") || "kg"}.
                </label>
              )}
            </fieldset>

            {controles.length > 1 && !esVariante && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-bold text-gray-100">¿Control extra?</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
                  {CONTROLES_EXTRA.filter((c) => controles.includes(c.valor)).map((c) => (
                    <button
                      key={c.valor}
                      type="button"
                      role="radio"
                      aria-checked={control === c.valor}
                      onClick={() => setControl(c.valor)}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-left transition-colors",
                        control === c.valor ? "border-acento bg-acento/10" : "border-surface-500 hover:border-surface-400"
                      )}
                    >
                      <span className="block text-sm font-bold text-gray-100">{c.titulo}</span>
                      <span className="block text-[11px] text-muted">{c.detalle}</span>
                      <span className="block text-[10px] text-muted/80">Ej.: {c.ejemplo}</span>
                    </button>
                  ))}
                </div>
                {control === "VARIANTES" && (
                  <p className="text-[11px] text-teal-300">
                    {editando
                      ? "Genera o revisa las combinaciones en la ficha del producto → Variantes."
                      : "Al guardar este modelo se abrirá su ficha para generar las tallas, colores o medidas."}
                  </p>
                )}
              </fieldset>
            )}
            {esVariante && (
              <p className="rounded-xl border border-surface-600 px-3 py-2 text-[11px] text-muted">
                Es una variante de un modelo: su existencia se lleva por separado y comparte precio con el modelo.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Costo por pieza</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  {...register("precioCompra", numeroOpcional)}
                  className="input-dark"
                  placeholder="0.00"
                />
                {err("precioCompra")}
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Precio venta *</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  {...register("precioUnitario", numeroObligatorio)}
                  className="input-dark"
                  placeholder="0.00"
                />
                {err("precioUnitario")}
              </label>
              <div className="col-span-full">
                <EditorEscalas filas={escalas} onChange={setEscalas} precioMenudeo={precioUnitario} />
              </div>
              {/* Impuestos por producto (tasa 0%, exento, IEPS). */}
              <label className="block">
                <span className="text-xs text-muted mb-1 block">IVA del producto</span>
                <select {...register("impuestoIva")} className="input-dark">
                  <option value="">Tasa del negocio</option>
                  <option value="16">16%</option>
                  <option value="8">8% (frontera)</option>
                  <option value="0">Tasa 0%</option>
                  <option value="EXENTO">Exento</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">IEPS % (opcional)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  {...register("tasaIeps", numeroOpcional)}
                  className="input-dark"
                  placeholder="No causa IEPS"
                />
                {err("tasaIeps")}
              </label>
              {modo !== "SERVICIO" &&
                (stockSeCapturaDirecto(modo, control) ? (
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">
                      {editando ? "Existencia" : "Existencia inicial"}
                      {modo === "GRANEL" && ` (${watch("unidadVenta") || "kg"})`}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={modo === "GRANEL" ? "0.001" : "1"}
                      {...register("stockActual", numeroObligatorio)}
                      className="input-dark"
                    />
                    {err("stockActual")}
                  </label>
                ) : (
                  <p className="text-[11px] leading-snug text-muted">
                    La existencia entra {control === "LOTES" ? "al registrar cada lote" : "al registrar cada serie"} (al
                    recibir un pedido o en Lotes y series).
                  </p>
                ))}
              {modo !== "SERVICIO" && (
                <label className="block">
                  <span className="text-xs text-muted mb-1 block">Stock mínimo</span>
                  <input
                    type="number"
                    min={0}
                    {...register("stockMinimo", numeroObligatorio)}
                    className="input-dark"
                  />
                  {err("stockMinimo")}
                </label>
              )}
            </div>

            {modo !== "SERVICIO" && (
              <div className="rounded-xl border border-surface-600 p-3">
                <p className="mb-2 text-xs font-bold text-gray-100">¿Cómo lo compras al proveedor?</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Se compra por</span>
                    <input
                      list="unidades-compra"
                      {...register("unidadCompra")}
                      className="input-dark"
                      placeholder="Pieza"
                    />
                    <datalist id="unidades-compra">
                      {UNIDADES_COMPRA.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                    {err("unidadCompra")}
                  </label>
                  {porPaquete && (
                    <>
                      <label className="block">
                        <span className="text-xs text-muted mb-1 block">¿Cuántas piezas trae?</span>
                        <input
                          type="number"
                          min={2}
                          step="1"
                          {...register("piezasPorUnidad", numeroOpcional)}
                          className="input-dark"
                        />
                        {err("piezasPorUnidad")}
                      </label>
                      <label className="block">
                        <span className="text-xs text-muted mb-1 block">Costo del {unidadCompra?.toLowerCase()}</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={
                            precioCompra != null && piezasPorUnidad > 1
                              ? Math.round(precioCompra * piezasPorUnidad * 100) / 100
                              : ""
                          }
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setValue(
                              "precioCompra",
                              e.target.value === "" || !Number.isFinite(v) ? undefined : costoPorPieza(v, piezasPorUnidad),
                              { shouldValidate: true }
                            );
                          }}
                          className="input-dark"
                          placeholder="0.00"
                        />
                      </label>
                    </>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted">
                  {porPaquete && piezasPorUnidad > 1
                    ? `Los pedidos se capturan en ${unidadCompra?.toLowerCase()}s; al recibir 1 entran ${piezasPorUnidad} piezas y el costo se reparte por pieza.`
                    : "Si lo compras por paquete o caja (p. ej. papas en paquete de 24), escribe la unidad y cuántas piezas trae."}
                </p>
              </div>
            )}

            {margen != null && (
              <p
                className={cn(
                  "text-xs font-bold",
                  margen < 0 ? "text-neon-red" : margen === 0 ? "text-warning" : "text-neon-green"
                )}
              >
                Margen por unidad: ${margen.toFixed(2)}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {usarUbicaciones && (
                <label className="block">
                  <span className="text-xs text-muted mb-1 block">Ubicación</span>
                  <input {...register("ubicacionEstante")} className="input-dark" placeholder="Estante A-1" />
                  {err("ubicacionEstante")}
                </label>
              )}
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Categoría</span>
                <select {...register("idCategoria")} className="input-dark">
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {categorias.length === 0 && (
                  <span className="mt-1 block text-[11px] text-muted">Créalas en Inventario → Categorías.</span>
                )}
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Proveedor</span>
                <input {...register("proveedor")} className="input-dark" placeholder="Nombre" />
                {err("proveedor")}
              </label>
              {personalizacion.usarTipoImpresion && (
                <label className="block">
                  <span className="text-xs text-muted mb-1 block">Tipo de impresión</span>
                  <select {...register("tipoImpresion")} className="input-dark">
                    <option value="">— Ninguno —</option>
                    {TIPO_IMPRESION_OPCIONES.map((t) => (
                      <option key={t} value={t}>
                        {TIPO_IMPRESION_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {/* Campos propios del giro (Configuración → Negocio). */}
              {camposGiro.map((c) => (
                <label key={c.clave} className="block">
                  <span className="text-xs text-muted mb-1 block">{c.etiqueta}</span>
                  {c.tipo === "lista" ? (
                    <select
                      value={atributos[c.clave] ?? ""}
                      onChange={(e) => setAtributos((a) => ({ ...a, [c.clave]: e.target.value }))}
                      className="input-dark"
                    >
                      <option value="">— Sin dato —</option>
                      {(c.opciones ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={c.tipo === "numero" ? "number" : "text"}
                      value={atributos[c.clave] ?? ""}
                      onChange={(e) => setAtributos((a) => ({ ...a, [c.clave]: e.target.value }))}
                      className="input-dark"
                    />
                  )}
                </label>
              ))}
              {usarCaducidad && modo !== "SERVICIO" && control !== "LOTES" && (
                <label className="block">
                  <span className="text-xs text-muted mb-1 block">Fecha de caducidad</span>
                  <input
                    type="date"
                    {...register("fechaCaducidad")}
                    className="input-dark"
                  />
                  {err("fechaCaducidad")}
                </label>
              )}
            </div>

            {/* Fase 12: imagen del producto (Cloudinary). */}
            <ImagenProductoUpload
              value={imagenUrl?.trim() ? imagenUrl.trim() : null}
              onChange={(url) =>
                setValue("imagenUrl", url ?? "", { shouldValidate: true, shouldDirty: true })
              }
            />

          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-sm font-medium text-gray-100 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || cargando}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all",
              !isSubmitting && !cargando
                ? "bg-neon-green text-btn-ink shadow-neon"
                : "bg-surface-600 text-muted cursor-not-allowed"
            )}
          >
            {(isSubmitting || cargando) && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" />
            {editando ? "Guardar cambios" : "Crear producto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
