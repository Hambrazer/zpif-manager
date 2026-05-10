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
  ApiResponse,
} from '@/lib/types'

export type PropertyMetrics = {
  id: string
  annualNOI: number
  occupancy: number    // 0..1, Σ active area / rentableArea
  capRate: number | null
  exitCapRate: number | null
}

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const scenarioParam = (searchParams.get('scenario') ?? 'BASE').toUpperCase()
  const scenarioType: ScenarioType =
    scenarioParam === 'BULL' ? 'BULL' : scenarioParam === 'BEAR' ? 'BEAR' : 'BASE'

  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1

  const periods: MonthlyPeriod[] = Array.from({ length: 12 }, (_, i) => {
    const totalMonth = startMonth - 1 + i
    return {
      year: startYear + Math.floor(totalMonth / 12),
      month: (totalMonth % 12) + 1,
    }
  })

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

    const result: PropertyMetrics[] = fund.properties.map((property) => {
      const activeArea = property.leaseContracts
        .filter((lc) => lc.status === 'ACTIVE')
        .reduce((s, lc) => s + lc.area, 0)
      const occupancy = property.rentableArea > 0 ? activeArea / property.rentableArea : 0

      const scenarioRaw =
        property.scenarioAssumptions.find((sa) => sa.scenarioType === scenarioType) ??
        property.scenarioAssumptions.find((sa) => sa.scenarioType === 'BASE')

      if (!scenarioRaw) {
        return { id: property.id, annualNOI: 0, occupancy, capRate: null, exitCapRate: null }
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

      const cashflows = calcPropertyCashflow(propertyInput, leases, capexItems, scenario, periods)
      const annualNOI = cashflows.reduce((s, cf) => s + cf.noi, 0)
      const capRate =
        property.acquisitionPrice && property.acquisitionPrice > 0
          ? annualNOI / property.acquisitionPrice
          : null

      return { id: property.id, annualNOI, occupancy, capRate, exitCapRate: scenarioRaw.exitCapRate }
    })

    return Response.json({ data: result } satisfies ApiResponse<PropertyMetrics[]>)
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}
