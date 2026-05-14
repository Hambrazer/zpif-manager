import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import { calcDCF } from '@/lib/calculations/dcf'
import type { LeaseInput, CapexInput, MonthlyPeriod, IndexationType } from '@/lib/types'

export type DCFSummary = {
  npv: number
  irr: number           // годовой IRR в долях (0.14 = 14%), 0 если нет acquisitionPrice
  terminalValue: number
  discountRate: number  // WACC в долях
  projectionYears: number
}

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)

  const now = new Date()
  const startYear  = parseInt(searchParams.get('startYear')  ?? String(now.getFullYear()),  10)
  const startMonth = parseInt(searchParams.get('startMonth') ?? String(now.getMonth() + 1), 10)
  const projectionYears = parseInt(searchParams.get('projectionYears') ?? '10', 10)
  const cpiRate = parseFloat(searchParams.get('cpiRate') ?? '0.07')

  try {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        leaseContracts: { include: { stepRents: true } },
        capexItems:     true,
      },
    })

    const propertyInput: PropertyExpenseInput = {
      rentableArea:       property.rentableArea,
      opexRate:           property.opexRate,
      maintenanceRate:    property.maintenanceRate,
      cadastralValue:     property.cadastralValue,
      landCadastralValue: property.landCadastralValue,
      propertyTaxRate:    property.propertyTaxRate,
      landTaxRate:        property.landTaxRate,
      cpiRate,
    }

    const leases: LeaseInput[] = property.leaseContracts.map((lc) => ({
      id:                              lc.id,
      tenantName:                      lc.tenantName,
      area:                            lc.area,
      baseRent:                        lc.baseRent,
      startDate:                       lc.startDate,
      endDate:                         lc.endDate,
      indexationType:                  lc.indexationType as IndexationType,
      indexationRate:                  lc.indexationRate,
      firstIndexationDate:             lc.firstIndexationDate,
      indexationFrequency:             lc.indexationFrequency,
      opexReimbursementRate:           lc.opexReimbursementRate,
      opexReimbursementIndexationType: lc.opexReimbursementIndexationType as IndexationType,
      opexReimbursementIndexationRate: lc.opexReimbursementIndexationRate,
      opexFirstIndexationDate:         lc.opexFirstIndexationDate,
      opexIndexationFrequency:         lc.opexIndexationFrequency,
      stepRents:                       lc.stepRents.map(s => ({
        startDate:     s.startDate,
        endDate:       s.endDate,
        rentRate:      s.rentRate,
        indexAfterEnd: s.indexAfterEnd,
      })),
      status:                          lc.status as 'ACTIVE' | 'EXPIRED' | 'TERMINATING',
    }))

    const capexItems: CapexInput[] = property.capexItems.map((c) => ({
      id:          c.id,
      amount:      c.amount,
      plannedDate: c.plannedDate,
    }))

    const totalMonths = projectionYears * 12
    const periods: MonthlyPeriod[] = Array.from({ length: totalMonths }, (_, i) => {
      const totalMonth = startMonth - 1 + i
      return {
        year:  startYear + Math.floor(totalMonth / 12),
        month: (totalMonth % 12) + 1,
      }
    })

    const cashflows = calcPropertyCashflow(propertyInput, leases, capexItems, periods)
    const acquisitionPrice = property.acquisitionPrice ?? 0
    const dcf = calcDCF(cashflows, property.wacc, property.exitCapRate, acquisitionPrice)

    const summary: DCFSummary = {
      npv:             dcf.npv,
      irr:             dcf.irr,
      terminalValue:   dcf.terminalValue,
      discountRate:    property.wacc,
      projectionYears,
    }

    return Response.json({ data: summary })
  } catch {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
  }
}
