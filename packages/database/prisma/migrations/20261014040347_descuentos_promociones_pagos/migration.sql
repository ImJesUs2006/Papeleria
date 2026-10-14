-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "descuentoMaxCajera" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "lineas_detalle_venta" ADD COLUMN     "promocion" TEXT;

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "descuentoTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "idAutorizoDescuento" TEXT;

-- CreateTable
CREATE TABLE "promociones" (
    "idPromocion" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(5,2),
    "llevaN" INTEGER,
    "pagaM" INTEGER,
    "codigoItem" TEXT,
    "idCategoria" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("idPromocion")
);

-- CreateTable
CREATE TABLE "pagos_venta" (
    "idPago" TEXT NOT NULL,
    "idNegocio" TEXT NOT NULL DEFAULT 'default',
    "folioVenta" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "referencia" TEXT,
    "puntos" INTEGER,

    CONSTRAINT "pagos_venta_pkey" PRIMARY KEY ("idPago")
);

-- CreateIndex
CREATE INDEX "promociones_idNegocio_activa_idx" ON "promociones"("idNegocio", "activa");

-- CreateIndex
CREATE INDEX "pagos_venta_idNegocio_idx" ON "pagos_venta"("idNegocio");

-- CreateIndex
CREATE INDEX "pagos_venta_folioVenta_idx" ON "pagos_venta"("folioVenta");

-- AddForeignKey
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_idNegocio_fkey" FOREIGN KEY ("idNegocio") REFERENCES "negocios"("idNegocio") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_venta" ADD CONSTRAINT "pagos_venta_folioVenta_fkey" FOREIGN KEY ("folioVenta") REFERENCES "ventas"("folioVenta") ON DELETE RESTRICT ON UPDATE CASCADE;
