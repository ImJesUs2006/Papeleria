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
import { TIPO_IMPRESION_OPCIONES } from "@/lib/validate-product";
import { cn } from "@/lib/utils";

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
  /** Fase 12: precio de mayoreo (0 = el producto no tiene mayoreo). */
  precioMayoreo?: number | null;
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
    precioMayoreo: z
      .number({ invalid_type_error: "Precio de mayoreo inválido" })
      .min(0, "El precio de mayoreo no puede ser negativo")
      .max(9_999_999, "Precio de mayoreo demasiado alto")
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
    proveedor: textoOpcional(120),
    tipoImpresion: z.enum(TIPO_IMPRESION_OPCIONES).optional().or(z.literal("")),
    fechaCaducidad: z
      .string()
      .trim()
      .max(10, "Fecha inválida")
      .optional()
      .or(z.literal("")),
    permiteDecimales: z.boolean().optional(),
    esServicio: z.boolean().optional(),
  })
  .refine(
    (d) => d.precioCompra == null || d.precioUnitario >= d.precioCompra,
    {
      message: "El precio de venta no puede ser menor al de compra",
      path: ["precioUnitario"],
    }
  )
  // Fase 12: el mayoreo, si existe, siempre es menor al precio de venta.
  .refine(
    (d) => !d.precioMayoreo || d.precioUnitario > d.precioMayoreo,
    {
      message: "El precio de mayoreo debe ser menor al precio de venta",
      path: ["precioMayoreo"],
    }
  );

type FormValues = z.infer<typeof formSchema>;

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

export function ProductFormModal({ open, onClose, onSaved, producto, usarCaducidad = true, usarUbicaciones = true }: Props) {
  const editando = Boolean(producto);

  const [serverError, setServerError] = useState<string | null>(null);
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
  const precioMayoreo = watch("precioMayoreo");
  const imagenUrl = watch("imagenUrl");
  const margen =
    precioCompra != null && precioUnitario != null ? precioUnitario - precioCompra : null;
  // Fase 12: ahorro que ve la cajera al pasar la venta a mayoreo.
  const ahorroMayoreo =
    precioMayoreo != null && precioUnitario != null && precioMayoreo > 0
      ? precioUnitario - precioMayoreo
      : null;

  useEffect(() => {
    if (!open) return;
    setServerError(null);

    if (producto) {
      setCargando(true);
      fetch(`/api/productos/${encodeURIComponent(producto.codigoItem)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar"))))
        .then((p) => {
          reset({
            codigoItem: p.codigoItem,
            descripcion: p.descripcion,
            precioUnitario: Number(p.precioUnitario),
            precioCompra: p.precioCompra != null ? Number(p.precioCompra) : undefined,
            stockActual: Number(p.stockActual),
            stockMinimo: Number(p.stockMinimo),
            codigoBarras: p.codigoBarras ?? "",
            ubicacionEstante: p.ubicacionEstante ?? "",
            proveedor: p.proveedor ?? "",
            tipoImpresion: p.tipoImpresion ?? "",
            fechaCaducidad: p.fechaCaducidad ? p.fechaCaducidad.slice(0, 10) : "",
            permiteDecimales: Boolean(p.permiteDecimales),
            esServicio: Boolean(p.esServicio),
          });
        })
        .catch((e) => setServerError(e.message))
        .finally(() => setCargando(false));
    } else {
      reset({
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
      });
    }
  }, [open, producto, reset]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    const payload = {
      codigoItem: values.codigoItem.trim().toUpperCase(),
      descripcion: values.descripcion,
      precioUnitario: values.precioUnitario,
      precioCompra: values.precioCompra ?? null,
      precioMayoreo: values.precioMayoreo ?? null,
      imagenUrl: values.imagenUrl?.trim() || null,
      stockActual: values.stockActual,
      stockMinimo: values.stockMinimo,
      codigoBarras: values.codigoBarras?.trim() || null,
      ubicacionEstante: values.ubicacionEstante?.trim() || null,
      proveedor: values.proveedor?.trim() || null,
      tipoImpresion: values.tipoImpresion || null,
      fechaCaducidad: values.fechaCaducidad?.trim() || null,
      permiteDecimales: values.permiteDecimales === true,
      esServicio: values.esServicio === true,
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
      title={editando ? "Editar producto" : "Nuevo producto"}
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Precio compra</span>
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
              {/* Fase 12: precio de mayoreo (vacío = sin mayoreo). */}
              <label className="block">
                <span className="text-xs text-muted mb-1 block">
                  Precio mayoreo (opcional)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  {...register("precioMayoreo", numeroOpcional)}
                  className="input-dark"
                  placeholder="Sin mayoreo"
                />
                {err("precioMayoreo")}
                {ahorroMayoreo != null && (
                  <span className="text-[11px] text-teal-300 mt-1 block">
                    Ahorro por unidad: ${ahorroMayoreo.toFixed(2)}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Stock actual</span>
                <input
                  type="number"
                  min={0}
                  {...register("stockActual", numeroObligatorio)}
                  className="input-dark"
                />
                {err("stockActual")}
              </label>
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
            </div>

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
                <span className="text-xs text-muted mb-1 block">Proveedor</span>
                <input {...register("proveedor")} className="input-dark" placeholder="Nombre" />
                {err("proveedor")}
              </label>
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
              {usarCaducidad && (
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

            {/* Sellos de Fase 10: granel y servicios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="flex items-start gap-2.5 bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 cursor-pointer hover:border-neon-cyan/40 transition-colors">
                <input
                  type="checkbox"
                  {...register("permiteDecimales")}
                  className="mt-0.5 rounded accent-neon-cyan"
                />
                <span>
                  <span className="block text-sm font-bold text-gray-100">Se vende a granel</span>
                  <span className="block text-[11px] text-muted">
                    Admite cantidades fraccionarias (kg, metros, litros)
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 cursor-pointer hover:border-neon-purple/40 transition-colors">
                <input
                  type="checkbox"
                  {...register("esServicio")}
                  className="mt-0.5 rounded accent-neon-purple"
                />
                <span>
                  <span className="block text-sm font-bold text-gray-100">Es un servicio</span>
                  <span className="block text-[11px] text-muted">
                    No usa inventario ni Kardex; se cobra directamente
                  </span>
                </span>
              </label>
            </div>
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
