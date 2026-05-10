-- CreateEnum
CREATE TYPE "DistributionPeriodicity" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- DropForeignKey
ALTER TABLE "OpexItem" DROP CONSTRAINT "OpexItem_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "PropertyDebt" DROP CONSTRAINT "PropertyDebt_propertyId_fkey";

-- AlterTable
ALTER TABLE "Fund" DROP COLUMN "depositaryFee",
DROP COLUMN "managementFee",
DROP COLUMN "otherFundExpenses",
ADD COLUMN     "distributionPeriodicity" "DistributionPeriodicity" NOT NULL,
ADD COLUMN     "endDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fundExpensesRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "hasDebt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managementFeeRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "nominalUnitPrice" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "successFeeExit" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "successFeeOperational" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "totalEmission" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "upfrontFeeRate" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "LeaseContract" ADD COLUMN     "opexReimbursementIndexationRate" DOUBLE PRECISION,
ADD COLUMN     "opexReimbursementIndexationType" "IndexationType" NOT NULL,
ADD COLUMN     "opexReimbursementRate" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "acquisitionDate",
ADD COLUMN     "exitCapRate" DOUBLE PRECISION,
ADD COLUMN     "landCadastralValue" DOUBLE PRECISION,
ADD COLUMN     "landTaxRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "maintenanceRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "opexRate" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "purchaseDate" TIMESTAMP(3),
ADD COLUMN     "saleDate" TIMESTAMP(3),
ADD COLUMN     "wacc" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "ScenarioAssumption" DROP COLUMN "discountRate";

-- DropTable
DROP TABLE "OpexItem";

-- DropTable
DROP TABLE "PropertyDebt";

-- DropEnum
DROP TYPE "Periodicity";
