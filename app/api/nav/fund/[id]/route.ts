import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import { calcFundCashRoll, generatePeriods, type PropertyCFInput } from '@/lib/calculations/fund-cashflow'
import { calcNAVTimeSeries, type PropertyValueInput } from '@/lib/calculations/nav'
import type {
  LeaseInput,
  CapexInput,
  CapexReserveInput,
  DebtInput,
  FundInput,
  DistributionPeriodicity,
  IndexationType,
  AmortizationType,
} from '@/lib/types'

type Params = { params: { id: string } }

const DEFAULT_CPI_RATE = 0.07

export async function GET(_req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  try {
    const fund = await prisma.fund.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        properties: {
          include: {
            property: {
              include: {
                leaseContracts: { include: { stepRents: true } },
                capexItems: true,
                capexReserve: true,
              },
            },
          },
        },
        fundDebts: true,
      },
    })

    const periods = generatePeriods(fund.startDate, fund.endDate)

    const propertyCFInputs: PropertyCFInput[] = []
    const propertyValueInputs: PropertyValueInput[] = []

    for (const fp of fund.properties) {
      const property = fp.property
      const propertyInput: PropertyExpenseInput = {
        rentableArea: property.rentableArea,
        opexRate: property.opexRate,
        maintenanceRate: property.maintenanceRate,
        cadastralValue: property.cadastralValue,
        landCadastralValue: property.landCadastralValue,
        propertyTaxRate: property.propertyTaxRate,
        landTaxRate: property.landTaxRate,
        cpiRate: DEFAULT_CPI_RATE,
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

      const capexReserve: CapexReserveInput | null = property.capexReserve
        ? {
            ratePerSqm: property.capexReserve.ratePerSqm,
            startDate: property.capexReserve.startDate,
            indexationType: property.capexReserve.indexationType as IndexationType,
            indexationRate: property.capexReserve.indexationRate,
          }
        : null

      const cashflows = calcPropertyCashflow(propertyInput, leases, capexItems, periods, capexReserve)

      propertyCFInputs.push({
        acquisitionPrice: property.acquisitionPrice,
        purchaseDate: property.purchaseDate,
        saleDate: property.saleDate,
        exitCapRate: property.exitCapRate,
        cashflows,
        ownershipPct: fp.ownershipPct,
      })

      propertyValueInputs.push({
        exitCapRate: property.exitCapRate,
        cashflows,
        ownershipPct: fp.ownershipPct,
      })
    }

    const fundInput: FundInput = {
      id: fund.id,
      startDate: fund.startDate,
      endDate: fund.endDate,
      totalEmission: fund.totalEmission,
      nominalUnitPrice: fund.nominalUnitPrice,
      totalUnits: fund.totalUnits,
      managementFeeRate: fund.managementFeeRate,
      fundExpensesRate: fund.fundExpensesRate,
      upfrontFeeRate: fund.upfrontFeeRate,
      successFeeOperational: fund.successFeeOperational,
      successFeeExit: fund.successFeeExit,
      distributionPeriodicity: fund.distributionPeriodicity as DistributionPeriodicity,
      properties: [],
      fundDebts: [],
    }

    const fundDebts: DebtInput[] = fund.fundDebts.map((d) => ({
      id: d.id,
      principalAmount: d.principalAmount,
      interestRate: d.interestRate,
      startDate: d.startDate,
      endDate: d.endDate,
      amortizationType: d.amortizationType as AmortizationType,
    }))

    const cashRoll = calcFundCashRoll(fundInput, propertyCFInputs, fundDebts)
    const navSeries = calcNAVTimeSeries(cashRoll, propertyValueInputs, fundDebts, fund.totalUnits)

    return Response.json({ data: navSeries })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}
