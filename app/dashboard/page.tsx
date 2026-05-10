import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FundsDashboard } from './FundsDashboard'
import type { FundSummary } from './FundsDashboard'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import { calcFundCashflow, calcNAV, calcNAVPerUnit } from '@/lib/calculations/metrics'
import { calcDCF, calcIRR } from '@/lib/calculations/dcf'
import { MONTHS_PER_YEAR } from '@/lib/calculations/constants'
import type {
  LeaseInput,
  CapexInput,
  DebtInput,
  ScenarioInput,
  MonthlyPeriod,
  MonthlyCashflow,
  IndexationType,
  AmortizationType,
  ScenarioType,
} from '@/lib/types'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const fundsRaw = await prisma.fund.findMany({
    include: {
      _count: { select: { properties: true } },
      properties: {
        include: {
          leaseContracts: true,
          capexItems: true,
          scenarioAssumptions: true,
        },
      },
      fundDebts: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1
  const DEFAULT_YEARS = 10

  const funds: FundSummary[] = fundsRaw.map(fund => {
    const propertyCashflows: MonthlyCashflow[][] = []
    let totalAcquisitionPrice = 0
    let totalPropertyNPV = 0
    let totalRentableArea = 0
    let totalActiveLeaseArea = 0

    let maxYears = DEFAULT_YEARS
    for (const p of fund.properties) {
      const s = p.scenarioAssumptions.find(sa => sa.scenarioType === 'BASE')
      if (s) maxYears = Math.max(maxYears, s.projectionYears)
    }

    const totalMonths = maxYears * MONTHS_PER_YEAR
    const periods: MonthlyPeriod[] = Array.from({ length: totalMonths }, (_, i) => {
      const m = startMonth - 1 + i
      return { year: startYear + Math.floor(m / 12), month: (m % 12) + 1 }
    })

    for (const property of fund.properties) {
      const scenarioRaw = property.scenarioAssumptions.find(
        sa => sa.scenarioType === 'BASE'
      )
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

      const leases: LeaseInput[] = property.leaseContracts.map(lc => ({
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

      const capexItems: CapexInput[] = property.capexItems.map(c => ({
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

      const propertyCF = calcPropertyCashflow(propertyInput, leases, capexItems, scenario, periods)
      propertyCashflows.push(propertyCF)

      const acquisitionPrice = property.acquisitionPrice ?? 0
      totalAcquisitionPrice += acquisitionPrice

      const dcfResult = calcDCF(propertyCF, scenario, acquisitionPrice)
      totalPropertyNPV += dcfResult.npv

      totalRentableArea += property.rentableArea
      totalActiveLeaseArea += leases
        .filter(l => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + l.area, 0)
    }

    if (propertyCashflows.length === 0) {
      return {
        id: fund.id,
        name: fund.name,
        registrationNumber: fund.registrationNumber,
        totalUnits: fund.totalUnits,
        propertyCount: fund._count.properties,
        annualNOI: null,
        irr: null,
        nav: null,
        navPerUnit: null,
        occupancy: null,
      }
    }

    const approxNAV = fund.properties.reduce(
      (sum, p) => sum + (p.acquisitionPrice ?? 0), 0
    )
    const annualFundExpenses = (fund.managementFeeRate + fund.fundExpensesRate) * approxNAV

    const fundDebts: DebtInput[] = fund.fundDebts.map(d => ({
      id: d.id,
      principalAmount: d.principalAmount,
      interestRate: d.interestRate,
      startDate: d.startDate,
      endDate: d.endDate,
      amortizationType: d.amortizationType as AmortizationType,
    }))

    const fundCF = calcFundCashflow(propertyCashflows, annualFundExpenses, fundDebts, periods)
    const annualNOI = fundCF.slice(0, 12).reduce((sum, cf) => sum + cf.noi, 0)

    let irr: number | null = null
    if (totalAcquisitionPrice > 0) {
      const irrFlows = [-totalAcquisitionPrice, ...fundCF.map(cf => cf.fcf)]
      const irrMonthly = calcIRR(irrFlows)
      irr = isNaN(irrMonthly) ? null : Math.pow(1 + irrMonthly, MONTHS_PER_YEAR) - 1
    }

    const totalFundDebtPrincipal = fund.fundDebts.reduce(
      (sum, d) => sum + d.principalAmount, 0
    )
    const nav = calcNAV(totalPropertyNPV, 0, totalFundDebtPrincipal)
    const navPerUnit = calcNAVPerUnit(nav, fund.totalUnits)

    const occupancy = totalRentableArea > 0
      ? totalActiveLeaseArea / totalRentableArea
      : null

    return {
      id: fund.id,
      name: fund.name,
      registrationNumber: fund.registrationNumber,
      totalUnits: fund.totalUnits,
      propertyCount: fund._count.properties,
      annualNOI,
      irr,
      nav,
      navPerUnit,
      occupancy,
    }
  })

  return <FundsDashboard funds={funds} />
}
