-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "gordonGrowthRate" DOUBLE PRECISION,
ADD COLUMN     "projectionYears" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "terminalType" "TerminalType" NOT NULL DEFAULT 'EXIT_CAP_RATE';

