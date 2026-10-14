"use client";

import { guardarCatalogoLocal, leerCatalogoLocal } from "@/lib/offline/idb";
import type { ProductoCatalogo } from "@/lib/offline/catalogo";
import { useInventoryStore } from "@/store/inventory";

// ============================================================
// Copia local del catálogo (Paso 8): se descarga con red y alimenta el
// espejo de inventario offline. Se refresca cada 10 minutos como máximo.
// ============================================================

const CLAVE_FECHA = "papeleria-catalogo-actualizado";
const CADA_MS = 10 * 60_000;
let cache: ProductoCatalogo[] | null = null;

export async function actualizarCatalogo(forzar = false): Promise<void> {
  try {
    const ultima = Number(localStorage.getItem(CLAVE_FECHA) ?? 0);
    if (!forzar && Date.now() - ultima < CADA_MS && cache) return;
  } catch {
    /* almacenamiento no disponible */
  }
  const res = await fetch("/api/productos/catalogo", { cache: "no-store" });
  if (!res.ok) return;
  const data = await res.json();
  const productos: ProductoCatalogo[] = data.productos ?? [];
  cache = productos;
  await guardarCatalogoLocal(productos);
  useInventoryStore.getState().setMany(
    productos
      .filter((p) => !p.esServicio)
      .map((p) => ({
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: p.precioUnitario,
        stockActual: p.stockActual,
        stockMinimo: p.stockMinimo,
      }))
  );
  try {
    localStorage.setItem(CLAVE_FECHA, String(Date.now()));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Catálogo local (memoria → IndexedDB). Vacío si nunca se descargó. */
export async function catalogoLocal(): Promise<ProductoCatalogo[]> {
  if (cache) return cache;
  try {
    cache = await leerCatalogoLocal();
  } catch {
    cache = [];
  }
  return cache;
}
