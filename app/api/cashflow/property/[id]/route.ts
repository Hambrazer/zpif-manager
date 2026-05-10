import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import type {
  LeaseInput,
  CapexInput,
  ScenarioInput,
  MonthlyPeriod,
  ScenarioType,
  IndexationType,
} from '@/lib/types'

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)

  const scenarioParam = (searchParams.get('scenario') ?? 'BASE').toUpperCase()
  const scenarioType: ScenarioType =
    scenarioParam === 'BULL' ? 'BULL' : scenarioParam === 'BEAR' ? 'BEAR' : 'BASE'

  const now = new Date()
  const startYear = parseInt(searchParams.get('startYear') ?? String(now.getFullYear()), 10)
  const startMonth = parseInt(searchParams.get('startMonth') ?? String(now.getMonth() + 1), 10)

  try {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        leaseContracts: true,
        capexItems: true,
        scenarioAssumptions: true,
      },
    })

    const scenarioRaw = property.scenarioAssumptions.find(
      (s) => s.scenarioType === scenarioType
    )
    if (!scenarioRaw) {
      return Response.json(
        { error: `Сценарий ${scenarioType} не найден для объекта` },
        { status: 404 }
      )
    }

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

    const scenario: ScenarioInput = {
      scenarioType: scenarioRaw.scenarioType as ScenarioType,
      vacancyRate: scenarioRaw.vacancyRate,
      rentGrowthRate: scenarioRaw.rentGrowthRate,
      opexGrowthRate: scenarioRaw.opexGrowthRate,
      discountRate: property.wacc,
      cpiRate: scenarioRaw.cpiRate,
      terminalType: scenarioRaw.terminalType as 'EXIT_CAP_RATE' | 'GORDON',
      exitCapRate: scenarioRaw.exitCapRate,
      gordonGrowthRate: scenarioRaw.gordonGrowthRate,
      projectionYears: scenarioRaw.projectionYears,
    }

    const totalMonths = scenarioRaw.projectionYears * 12
    const periods: MonthlyPeriod[] = Array.from({ length: totalMonths }, (_, i) => {
      const totalMonth = startMonth - 1 + i
      return {
        year: startYear + Math.floor(totalMonth / 12),
        month: (totalMonth % 12) + 1,
      }
    })

    const cashflows = calcPropertyCashflow(propertyInput, leases, capexItems, scenario, periods)

    return Response.json({ data: cashflows })
  } catch {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
  }
}
