-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('OFFICE', 'WAREHOUSE', 'RETAIL', 'MIXED', 'RESIDENTIAL');

-- CreateEnum
CREATE TYPE "IndexationType" AS ENUM ('CPI', 'FIXED', 'NONE');

-- CreateEnum
CREATE TYPE "LeaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATING');

-- CreateEnum
CREATE TYPE "Periodicity" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "AmortizationType" AS ENUM ('ANNUITY', 'BULLET', 'LINEAR');

-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('BASE', 'BULL', 'BEAR');

-- CreateEnum
CREATE TYPE "TerminalType" AS ENUM ('EXIT_CAP_RATE', 'GORDON');

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "totalUnits" DOUBLE PRECISION NOT NULL,
    "managementFee" DOUBLE PRECISION NOT NULL,
    "depositaryFee" DOUBLE PRECISION NOT NULL,
    "otherFundExpenses" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL,
    "address" TEXT NOT NULL,
    "totalArea" DOUBLE PRECISION NOT NULL,
    "rentableArea" DOUBLE PRECISION NOT NULL,
    "cadastralValue" DOUBLE PRECISION,
    "acquisitionPrice" DOUBLE PRECISION,
    "acquisitionDate" TIMESTAMP(3),
    "propertyTaxRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseContract" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantName" TEXT NOT NULL,
    "area" DOUBLE PRECISION NOT NULL,
    "baseRent" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "indexationType" "IndexationType" NOT NULL,
    "indexationRate" DOUBLE PRECISION,
    "securityDeposit" DOUBLE PRECISION,
    "status" "LeaseStatus" NOT NULL,
    "renewalOption" BOOLEAN NOT NULL DEFAULT false,
    "breakOption" BOOLEAN NOT NULL DEFAULT false,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpexItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "periodicity" "Periodicity" NOT NULL,
    "indexationType" "IndexationType" NOT NULL,
    "indexationRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpexItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapexItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CapexItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyDebt" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "amortizationType" "AmortizationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundDebt" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "principalAmount" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "amortizationType" "AmortizationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioAssumption" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "scenarioType" "ScenarioType" NOT NULL,
    "vacancyRate" DOUBLE PRECISION NOT NULL,
    "rentGrowthRate" DOUBLE PRECISION NOT NULL,
    "opexGrowthRate" DOUBLE PRECISION NOT NULL,
    "discountRate" DOUBLE PRECISION NOT NULL,
    "cpiRate" DOUBLE PRECISION NOT NULL,
    "terminalType" "TerminalType" NOT NULL,
    "exitCapRate" DOUBLE PRECISION,
    "gordonGrowthRate" DOUBLE PRECISION,
    "projectionYears" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScenarioAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioAssumption_propertyId_scenarioType_key" ON "ScenarioAssumption"("propertyId", "scenarioType");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseContract" ADD CONSTRAINT "LeaseContract_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpexItem" ADD CONSTRAINT "OpexItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapexItem" ADD CONSTRAINT "CapexItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyDebt" ADD CONSTRAINT "PropertyDebt_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundDebt" ADD CONSTRAINT "FundDebt_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioAssumption" ADD CONSTRAINT "ScenarioAssumption_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
