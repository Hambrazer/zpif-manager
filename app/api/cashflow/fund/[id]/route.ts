import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/utils/auth'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import { calcFundCashRoll, generatePeriods, type PropertyCFInput } from '@/lib/calculations/fund-cashflow'
import type {
  LeaseInput,
  CapexInput,
  DebtInput,
  ScenarioInput,
  FundInput,
  DistributionPeriodicity,
  ScenarioType,
  IndexationType,
  AmortizationType,
} from '@/lib/types'

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const authError = await requireAuth()
  if (authError) return authError

  const { searchParams } = new URL(req.url)

  const scenarioParam = (searchParams.get('scenario') ?? 'BASE').toUpperCase()
  const scenarioType: ScenarioType =
    scenarioParam === 'BULL' ? 'BULL' : scenarioParam === 'BEAR' ? 'BEAR' : 'BASE'

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
        fundDebts: true,
      },
    })

    const periods = generatePeriods(fund.startDate, fund.endDate)

    const propertyCashflowMap: Record<string, ReturnType<typeof calcPropertyCashflow>> = {}
    const propertyCFInputs: PropertyCFInput[] = []

    for (const property of fund.properties) {
      const scenarioRaw =
        property.scenarioAssumptions.find((sa) => sa.scenarioType === scenarioType) ??
        property.scenarioAssumptions.find((sa) => sa.scenarioType === 'BASE')

      if (!scenarioRaw) continue

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
      propertyCashflowMap[property.id] = cashflows

      propertyCFInputs.push({
        acquisitionPrice: property.acquisitionPrice,
        purchaseDate: property.purchaseDate,
        saleDate: property.saleDate,
        exitCapRate: property.exitCapRate,
        cashflows,
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

    return Response.json({ data: { cashRoll, propertyCashflows: propertyCashflowMap } })
  } catch {
    return Response.json({ error: 'Фонд не найден' }, { status: 404 })
  }
}
