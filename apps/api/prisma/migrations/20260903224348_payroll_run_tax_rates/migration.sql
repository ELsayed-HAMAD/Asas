-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "credential" TEXT;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "taxRates" JSONB;
