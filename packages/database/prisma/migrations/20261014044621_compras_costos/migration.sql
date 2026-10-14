-- AlterTable
ALTER TABLE "items_pedido_proveedor" ADD COLUMN     "cantidadRecibida" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "lineas_detalle_venta" ADD COLUMN     "costoUnitario" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "costoPromedio" DECIMAL(12,4);

-- Backfill (Paso 7): el costo promedio arranca en el último costo conocido
-- y los pedidos ya entregados se marcan como recibidos completos.
UPDATE "productos" SET "costoPromedio" = "precioCompra" WHERE "precioCompra" IS NOT NULL;
UPDATE "items_pedido_proveedor" i SET "cantidadRecibida" = i."cantidad"
FROM "pedidos_proveedor" p WHERE p."idPedido" = i."idPedido" AND p."estado" = 'ENTREGADO';
