-- DropForeignKey
ALTER TABLE "apartado_lineas" DROP CONSTRAINT "apartado_lineas_codigoItem_fkey";

-- DropForeignKey
ALTER TABLE "devolucion_lineas" DROP CONSTRAINT "devolucion_lineas_codigoItem_fkey";

-- DropForeignKey
ALTER TABLE "items_pedido_proveedor" DROP CONSTRAINT "items_pedido_proveedor_codigoItem_fkey";

-- DropForeignKey
ALTER TABLE "lineas_detalle_venta" DROP CONSTRAINT "lineas_detalle_venta_codigoItem_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_kardex" DROP CONSTRAINT "movimientos_kardex_codigoItem_fkey";

-- DropIndex
DROP INDEX "productos_codigoBarras_key";

-- DropIndex
DROP INDEX "sesiones_caja_folioCaja_key";

-- DropIndex
DROP INDEX "usuarios_username_key";

-- AlterTable
ALTER TABLE "apartado_lineas" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "apartados" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "bitacora_logs" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "configuracion_negocio" DROP CONSTRAINT "configuracion_negocio_pkey",
DROP COLUMN "id",
ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default',
ADD CONSTRAINT "configuracion_negocio_pkey" PRIMARY KEY ("idNegocio");

-- AlterTable
ALTER TABLE "devolucion_lineas" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "devoluciones" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "items_pedido_proveedor" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "lineas_detalle_venta" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "movimientos_kardex" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "pagos_proveedor" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "pedidos_proveedor" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "productos" DROP CONSTRAINT "productos_pkey",
ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default',
ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("idNegocio", "codigoItem");

-- AlterTable
ALTER TABLE "proveedores" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "retiros_efectivo" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "sesiones_caja" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "snapshots_seguridad" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "idNegocio" TEXT NOT NULL DEFAULT 'default';

-- CreateTable
CREATE TABLE "negocios" (
    "idNegocio" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("idNegocio")
);

-- Backfill: los datos existentes pasan a pertenecer al negocio "default"
-- (todas las columnas idNegocio nuevas nacen con DEFAULT 'default').
INSERT INTO "negocios" ("idNegocio", "codigo", "nombre")
VALUES (
  'default',
  'default',
  COALESCE((SELECT "nombreNegocio" FROM "configuracion_negocio" LIMIT 1), 'Mi Negocio')
);


-- CreateIndex
CREATE UNIQUE INDEX "negocios_codigo_key" ON "negocios"("codigo");

-- CreateIndex
CREATE INDEX "apartado_lineas_idNegocio_idx" ON "apartado_lineas"("idNegocio");

-- CreateIndex
CREATE INDEX "apartados_idNegocio_idx" ON "apartados"("idNegocio");

-- CreateIndex
CREATE INDEX "bitacora_logs_idNegocio_idx" ON "bitacora_logs"("idNegocio");

-- CreateIndex
CREATE INDEX "clientes_idNegocio_idx" ON "clientes"("idNegocio");

-- CreateIndex
CREATE INDEX "devolucion_lineas_idNegocio_idx" ON "devolucion_lineas"("idNegocio");

-- CreateIndex
CREATE INDEX "devoluciones_idNegocio_idx" ON "devoluciones"("idNegocio");

-- CreateIndex
CREATE INDEX "facturas_idNegocio_idx" ON "facturas"("idNegocio");

-- CreateIndex
CREATE INDEX "items_pedido_proveedor_idNegocio_idx" ON "items_pedido_proveedor"("idNegocio");

-- CreateIndex
CREATE INDEX "lineas_detalle_venta_idNegocio_idx" ON "lineas_detalle_venta"("idNegocio");

-- CreateIndex
CREATE INDEX "movimientos_kardex_idNegocio_idx" ON "movimientos_kardex"("idNegocio");

-- CreateIndex
CREATE INDEX "pagos_proveedor_idNegocio_idx" ON "pagos_proveedor"("idNegocio");

-- CreateIndex
CREATE INDEX "pedidos_proveedor_idNegocio_idx" ON "pedidos_proveedor"("idNegocio");

-- CreateIndex
CREATE INDEX "productos_idNegocio_idx" ON "productos"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "productos_idNegocio_codigoBarras_key" ON "productos"("idNegocio", "codigoBarras");

-- CreateIndex
CREATE INDEX "proveedores_idNegocio_idx" ON "proveedores"("idNegocio");

-- CreateIndex
CREATE INDEX "retiros_efectivo_idNegocio_idx" ON "retiros_efectivo"("idNegocio");

-- CreateIndex
CREATE INDEX "sesiones_caja_idNegocio_idx" ON "sesiones_caja"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_caja_idNegocio_folioCaja_key" ON "sesiones_caja"("idNegocio", "folioCaja");

-- CreateIndex
CREATE INDEX "snapshots_seguridad_idNegocio_idx" ON "snapshots_seguridad"("idNegocio");

-- CreateIndex
CREATE INDEX "usuarios_idNegocio_idx" ON "usuarios"("idNegocio");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_idNegocio_username_key" ON "usuarios"("idNegocio", "username");

-- CreateIndex
CREATE INDEX "ventas_idNegocio_idx" ON "ventas"("idNegocio");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_proveedor" ADD CONSTRAINT "pedidos_proveedor_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_pedido_proveedor" ADD CONSTRAINT "items_pedido_proveedor_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineas_detalle_venta" ADD CONSTRAINT "lineas_detalle_venta_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones_caja" ADD CONSTRAINT "sesiones_caja_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_negocio" ADD CONSTRAINT "configuracion_negocio_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snapshots_seguridad" ADD CONSTRAINT "snapshots_seguridad_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_logs" ADD CONSTRAINT "bitacora_logs_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devoluciones" ADD CONSTRAINT "devoluciones_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devolucion_lineas" ADD CONSTRAINT "devolucion_lineas_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_proveedor" ADD CONSTRAINT "pagos_proveedor_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartados" ADD CONSTRAINT "apartados_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apartado_lineas" ADD CONSTRAINT "apartado_lineas_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_kardex" ADD CONSTRAINT "movimientos_kardex_idNegocio_codigoItem_fkey" FOREIGN KEY ("idNegocio", "codigoItem") REFERENCES "productos"("idNegocio", "codigoItem") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiros_efectivo" ADD CONSTRAINT "retiros_efectivo_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

