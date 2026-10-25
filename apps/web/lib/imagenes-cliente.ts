// ============================================================
// Imágenes en el navegador (Fase D): se reducen ANTES de subir, así una
// foto de celular de 12 MB queda en unos cientos de KB y no hay que
// limitar el tamaño del archivo original. Cloudinary guarda la versión
// ligera; sin Cloudinary, el logo cabe en la base de datos.
// ============================================================

export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Límite de Cloudinary (plan gratuito) para una imagen ya reducida. */
export const MAX_SUBIDA_BYTES = 10 * 1024 * 1024;

export interface ConfigCloudinary {
  enabled: boolean;
  cloudName?: string;
  uploadPreset?: string;
  folder?: string;
  razon?: string;
}

function cargarImagen(archivo: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/**
 * Reduce la imagen a `maxLado` píxeles por lado y la recomprime (WebP; si el
 * navegador no puede, JPEG). Los GIF animados y las imágenes ya pequeñas se
 * dejan como están.
 */
export async function reducirImagen(archivo: File, maxLado = 1600, calidad = 0.85): Promise<Blob> {
  if (archivo.type === "image/gif") return archivo;
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
  if (escala === 1 && archivo.size < 600 * 1024) return archivo;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return archivo;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", calidad));
  const final = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", calidad));
  return final && final.size < archivo.size ? final : archivo;
}

export async function leerConfigCloudinary(): Promise<ConfigCloudinary> {
  try {
    const res = await fetch("/api/configuracion/cloudinary", { cache: "no-store" });
    return res.ok ? await res.json() : { enabled: false };
  } catch {
    return { enabled: false, razon: "Sin conexión" };
  }
}

/** Sube (ya reducida) a Cloudinary y devuelve la URL segura. */
export async function subirACloudinary(archivo: File, config: ConfigCloudinary, carpeta?: string): Promise<string> {
  if (!config.cloudName || !config.uploadPreset) throw new Error("Cloudinary no está configurado");
  if (!TIPOS_IMAGEN.includes(archivo.type)) throw new Error("Formato no admitido (usa PNG, JPG, WEBP o GIF)");
  const ligera = await reducirImagen(archivo);
  if (ligera.size > MAX_SUBIDA_BYTES) throw new Error("La imagen sigue pesando más de 10 MB después de reducirla");
  const body = new FormData();
  body.append("file", ligera, archivo.name);
  body.append("upload_preset", config.uploadPreset);
  const folder = [config.folder, carpeta].filter(Boolean).join("/");
  if (folder) body.append("folder", folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || "Cloudinary rechazó la imagen");
  return data.secure_url as string;
}

/** Imagen → data URL reducida (para guardar sin Cloudinary, p. ej. el logo). */
export async function aDataUrlReducida(archivo: File, maxLado = 512): Promise<string> {
  const ligera = await reducirImagen(archivo, maxLado, 0.9);
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => (typeof lector.result === "string" ? resolve(lector.result) : reject(new Error("Lectura fallida")));
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.readAsDataURL(ligera);
  });
}
