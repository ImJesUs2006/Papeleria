"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, AlertTriangle, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FASE 12 · Subida de imagen del producto a Cloudinary.
 *
 * Usa la subida "unsigned" directamente contra Cloudinary: el navegador
 * solo conoce el nombre de la nube y el preset (que son públicos por
 * diseño). Las credenciales del servidor NUNCA salen del backend.
 *
 * Si el flag `imagenesCloudinary` está apagado o faltan las variables
 * del `.env`, el componente se oculta y deja avisar al usuario.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
}

interface CloudinaryConfig {
  enabled: boolean;
  cloudName?: string;
  uploadPreset?: string;
  folder?: string;
  razon?: string;
}

export function ImagenProductoUpload({ value, onChange }: Props) {
  const [config, setConfig] = useState<CloudinaryConfig | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let viva = true;
    (async () => {
      try {
        const res = await fetch("/api/configuracion/cloudinary", { cache: "no-store" });
        const data = res.ok ? await res.json() : { enabled: false };
        if (viva) setConfig(data);
      } catch {
        if (viva) setConfig({ enabled: false, razon: "Sin conexión" });
      }
    })();
    return () => {
      viva = false;
    };
  }, []);

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo || !config?.cloudName || !config.uploadPreset) return;
    setError(null);

    if (!TIPOS.includes(archivo.type)) {
      setError("Formato no admitido (usa PNG, JPG, WEBP o GIF)");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError("La imagen supera los 5 MB");
      return;
    }

    setSubiendo(true);
    try {
      const body = new FormData();
      body.append("file", archivo);
      body.append("upload_preset", config.uploadPreset);
      if (config.folder) body.append("folder", config.folder);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
        { method: "POST", body }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.secure_url) {
        throw new Error(data?.error?.message || "Cloudinary rechazó la imagen");
      }
      onChange(data.secure_url as string);
    } catch (e: any) {
      setError(e?.message || "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Flag apagado o sin configuración: no se muestra el control.
  if (config && !config.enabled) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-muted">
        <ImageOff className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Imágenes de producto desactivadas. Actívalas en Configuración para usar
        Cloudinary.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs text-muted mb-1 block">Imagen del producto</span>

      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 rounded-xl border border-surface-500 bg-surface-700 overflow-hidden flex items-center justify-center">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Imagen del producto" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted" />
          )}
        </div>

        <div className="flex-1 space-y-1.5">
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS.join(",")}
            className="hidden"
            onChange={(e) => void elegirArchivo(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={subiendo || config?.enabled === false}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors",
                subiendo
                  ? "border-surface-500 bg-surface-700 text-muted"
                  : "border-acento/50 bg-acento/10 text-acento hover:bg-acento/20"
              )}
            >
              {subiendo ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Subiendo…
                </>
              ) : (
                <>
                  <ImagePlus className="h-3.5 w-3.5" />
                  {value ? "Reemplazar" : "Subir imagen"}
                </>
              )}
            </button>

            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-surface-500 bg-surface-700 px-3 py-1.5 text-xs text-muted hover:border-neon-red/50 hover:text-neon-red"
              >
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted">
            PNG, JPG, WEBP o GIF hasta 5 MB. Se guarda la URL de Cloudinary.
          </p>
          {error && (
            <p className="text-[11px] text-neon-red flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}