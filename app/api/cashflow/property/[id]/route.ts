import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import type { LeaseInput, CapexInput, CapexReserveInput, MonthlyPeriod, IndexationType } from '@/lib/types'

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)

  const now = new Date()
  const startYear = parseInt(searchParams.get('startYear') ?? String(now.getFullYear()), 10)
  const startMonth = parseInt(searchParams.get('startMonth') ?? String(now.getMonth() + 1), 10)
  const projectionYears = parseInt(searchParams.get('projectionYears') ?? '10', 10)
  const cpiRate = parseFloat(searchParams.get('cpiRate') ?? '0.07')

  try {
    const property = await prisma.property.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        leaseContracts: { include: { stepRents: true } },
        capexItems: true,
        capexReserve: true,
      },
    })

    const propertyInput: PropertyExpenseInput = {
      rentableArea: property.rentableArea,
      opexRate: property.opexRate,
      maintenanceRate: property.maintenanceRate,
      cadastralValue: property.cadastralValue,
      landCadastralValue: property.landCadastralValue,
      propertyTaxRate: property.propertyTaxRate,
      landTaxRate: property.landTaxRate,
      cpiRate,
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
      firstIndexationDate: lc.firstIndexationDate,
      indexationFrequency: lc.indexationFrequency,
      opexReimbursementRate: lc.opexReimbursementRate,
      opexReimbursementIndexationType: lc.opexReimbursementIndexationType as IndexationType,
      opexReimbursementIndexationRate: lc.opexReimbursementIndexationRate,
      opexFirstIndexationDate: lc.opexFirstIndexationDate,
      opexIndexationFrequency: lc.opexIndexationFrequency,
      stepRents: lc.stepRents.map(s => ({
        startDate: s.startDate,
        endDate: s.endDate,
        rentRate: s.rentRate,
        indexAfterEnd: s.indexAfterEnd,
      })),
      status: lc.status as 'ACTIVE' | 'EXPIRED' | 'TERMINATING',
    }))

    const capexItems: CapexInput[] = property.capexItems.map((c) => ({
      id: c.id,
      amount: c.amount,
      plannedDate: c.plannedDate,
    }))

    const totalMonths = projectionYears * 12
    const periods: MonthlyPeriod[] = Array.from({ length: totalMonths }, (_, i) => {
      const totalMonth = startMonth - 1 + i
      return {
        year: startYear + Math.floor(totalMonth / 12),
        month: (totalMonth % 12) + 1,
      }
    })

    const capexReserve: CapexReserveInput | null = property.capexReserve
      ? {
          ratePerSqm: property.capexReserve.ratePerSqm,
          startDate: property.capexReserve.startDate,
          indexationType: property.capexReserve.indexationType as IndexationType,
          indexationRate: property.capexReserve.indexationRate,
        }
      : null

    const cashflows = calcPropertyCashflow(propertyInput, leases, capexItems, periods, capexReserve)

    return Response.json({ data: cashflows })
  } catch {
    return Response.json({ error: 'Объект не найден' }, { status: 404 })
  }
}
