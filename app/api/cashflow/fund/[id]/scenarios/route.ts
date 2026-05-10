import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'
import { calcFundAllScenarios } from '@/lib/calculations/scenarios'
import type { PropertyExpenseInput } from '@/lib/calculations/cashflow'
import type {
  LeaseInput,
  CapexInput,
  ScenarioInput,
  MonthlyPeriod,
  IndexationType,
  ScenarioType,
} from '@/lib/types'
import type { PropertyInputs } from '@/lib/calculations/scenarios'

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)

  const now = new Date()
  const startYear = parseInt(searchParams.get('startYear') ?? String(now.getFullYear()), 10)
  const startMonth = parseInt(searchParams.get('startMonth') ?? String(now.getMonth() + 1), 10)

  try {
    const fund = await prisma.fund.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        properties: {
          include: {
            leaseContracts: true,
            capexItems: true,
            scenarioAssumptions: true,
          },
        },
      },
    })

    let maxProjectionYears = 10
    for (const property of fund.properties) {
      for (const s of property.scenarioAssumptions) {
        maxProjectionYears = Math.max(maxProjectionYears, s.projectionYears)
      }
    }

    const totalMonths = maxProjectionYears * 12
    const periods: MonthlyPeriod[] = Array.from({ length: totalMonths }, (_, i) => {
      const totalMonth = startMonth - 1 + i
      return {
        year: startYear + Math.floor(totalMonth / 12),
        month: (totalMonth % 12) + 1,
      }
    })

    const properties: PropertyInputs[] = fund.properties.map((property) => {
      const propertyInput: PropertyExpenseInput = {
        rentableArea: property.rentableArea,
        opexRate: property.opexRate,
        maintenanceRate: property.maintenanceRate,
        cadastralValue: property.cadastralValue,
        landCadastralValue: property.landCadastralValue,
        propertyTaxRate: property.propertyTaxRate,
        landTaxRate: property.landTaxRate,
      }

      const leases: LeaseInput[] = property.leaseContracts.map((lc) => ({
        id: lc.id,
        tenantName: lc.tenantName,
        area: lc.area,
        baseRent: lc.baseRent,
        startDate: lc.startDate,
        endDate: lc.endDate,
        indexationType: lc.indexationType as IndexationType,
        indexationRate: lc.indexationRate,
        opexReimbursementRate: lc.opexReimbursementRate,
        opexReimbursementIndexationType: lc.opexReimbursementIndexationType as IndexationType,
        opexReimbursementIndexationRate: lc.opexReimbursementIndexationRate,
        status: lc.status as 'ACTIVE' | 'EXPIRED' | 'TERMINATING',
      }))

      const capexItems: CapexInput[] = property.capexItems.map((c) => ({
        id: c.id,
        amount: c.amount,
        plannedDate: c.plannedDate,
      }))

      const scenarios: ScenarioInput[] = property.scenarioAssumptions.map((s) => ({
        scenarioType: s.scenarioType as ScenarioType,
        vacancyRate: s.vacancyRate,
        rentGrowthRate: s.rentGrowthRate,
        opexGrowthRate: s.opexGrowthRate,
        discountRate: property.wacc,
        cpiRate: s.cpiRate,
        terminalType: s.terminalType as 'EXIT_CAP_RATE' | 'GORDON',
        exitCapRate: s.exitCapRate,
        gordonGrowthRate: s.gordonGrowthRate,
        projectionYears: s.projectionYears,
      }))

      return { property: propertyInput, leases, capexItems, scenarios }
    })

    // Approximate annual fund expenses from v2 rate fields
    const approxNAV = fund.properties.reduce((sum, p) => sum + (p.acquisitionPrice ?? 0), 0)
    const annualFundExpenses = (fund.managementFeeRate + fund.fundExpensesRate) * approxNAV

    const data = calcFundAllScenarios(properties, annualFundExpenses, periods)

    return Response.json({ data })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}
