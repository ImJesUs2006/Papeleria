-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "calle" TEXT,
ADD COLUMN     "colonia" TEXT,
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "municipio" TEXT,
ADD COLUMN     "numExt" TEXT,
ADD COLUMN     "numInt" TEXT;
-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "imprimirCorteAuto" BOOLEAN NOT NULL DEFAULT false;
