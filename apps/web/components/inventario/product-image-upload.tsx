"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Trash2, Loader2, AlertTriangle } from "lucide-react";

interface Props {
  codigo: string;
  imagenMime?: string | null;
  imagenBase64?: string | null;
  onUpdated?: (imagen: { imagenMime: string | null; imagenBase64: string | null }) => void;
  size?: number;
}

// Redimensiona/comprime en cliente para no saturar la BD (máx 800px, JPEG 0.82).
async function comprimirImagen(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 800;
  const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function ProductImageUpload({
  codigo,
  imagenMime,
  imagenBase64,
  onUpdated,
  size = 72,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(
    imagenBase64 ? `data:${imagenMime};base64,${imagenBase64}` : null
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.type)) {
      setError("Formato no permitido (png, jpg, webp)");
      return;
    }
    try {
      setGuardando(true);
      const dataUrl = await comprimirImagen(file);
      setPreview(dataUrl);
      const res = await fetch(`/api/productos/${encodeURIComponent(codigo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar imagen");
      onUpdated?.({ imagenMime: data.imagenMime, imagenBase64: data.imagenBase64 });
    } catch (e: any) {
      setError(e.message);
      setPreview(imagenBase64 ? `data:${imagenMime};base64,${imagenBase64}` : null);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(codigo)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64: null }),
      });
      if (!res.ok) throw new Error("Error al eliminar imagen");
      setPreview(null);
      onUpdated?.({ imagenMime: null, imagenBase64: null });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={() => inputRef.current?.click()}
        disabled={guardando}
        style={{ width: size, height: size }}
        className="relative rounded-xl bg-surface-700 border border-surface-500 overflow-hidden flex items-center justify-center hover:border-neon-green transition-colors"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={codigo} className="w-full h-full object-cover" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted" />
        )}
        {guardando && (
          <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="h-4 w-4 text-neon-green animate-spin" />
          </span>
        )}
      </motion.button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-[10px] text-muted hover:text-neon-green transition-colors"
        >
          {preview ? "Cambiar" : "Subir imagen"}
        </button>
        {preview && (
          <button
            type="button"
            onClick={eliminar}
            className="text-[10px] text-muted hover:text-neon-red transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" /> Quitar
          </button>
        )}
      </div>

      {error && (
        <span className="text-[10px] text-neon-red flex items-center gap-1 max-w-[120px]">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {error}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}