-- AlterTable
ALTER TABLE "items_pedido_proveedor" ADD COLUMN     "piezasPorUnidad" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "piezasPorUnidad" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unidadCompra" TEXT,
ADD COLUMN     "unidadVenta" TEXT;


-- Fase D · mayoreo unificado: el precio de mayoreo clásico se vuelve una
-- escala "Mayoreo desde 12 piezas" (solo si el producto no tenía escalas y
-- el precio es menor al de menudeo). El interruptor "Precio mayorista" del
-- cobro sigue aplicando la escala más baja sin importar la cantidad.
UPDATE "productos"
SET "escalasPrecio" = jsonb_build_array(
      jsonb_build_object('desde', 12, 'precio', ROUND("precioMayoreo", 2)::float, 'nombre', 'Mayoreo')
    )
WHERE "precioMayoreo" > 0
  AND "precioMayoreo" < "precioUnitario"
  AND ("escalasPrecio" IS NULL OR jsonb_typeof("escalasPrecio") <> 'array' OR jsonb_array_length("escalasPrecio") = 0);

UPDATE "productos" SET "precioMayoreo" = NULL WHERE "precioMayoreo" IS NOT NULL;
