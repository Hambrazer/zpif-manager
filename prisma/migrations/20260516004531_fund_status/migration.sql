-- CreateEnum
CREATE TYPE "FundStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Fund" ADD COLUMN     "status" "FundStatus" NOT NULL DEFAULT 'ACTIVE';
