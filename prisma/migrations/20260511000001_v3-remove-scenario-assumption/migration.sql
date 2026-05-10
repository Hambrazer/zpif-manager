-- DropForeignKey
ALTER TABLE "ScenarioAssumption" DROP CONSTRAINT "ScenarioAssumption_propertyId_fkey";

-- DropTable
DROP TABLE "ScenarioAssumption";

-- DropEnum
DROP TYPE "ScenarioType";
