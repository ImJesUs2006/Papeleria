-- AlterTable
ALTER TABLE "apartado_lineas" ADD COLUMN     "iepsLinea" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ivaLinea" DECIMAL(10,2),
ADD COLUMN     "tasaIva" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "preciosIncluyenIva" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "devoluciones" ADD COLUMN     "ieps" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "lineas_detalle_venta" ADD COLUMN     "iepsLinea" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ivaLinea" DECIMAL(10,2),
ADD COLUMN     "tasaIva" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "productos" ADD COLUMN     "exentoIva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tasaIeps" DECIMAL(5,2),
ADD COLUMN     "tasaIva" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "ventas" ADD COLUMN     "ieps" DECIMAL(10,2) NOT NULL DEFAULT 0;
