-- AlterTable
ALTER TABLE "configuracion_negocio" ADD COLUMN     "cobraImpuestos" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "eliminadoEn" TIMESTAMP(3);

