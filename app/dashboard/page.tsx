import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { type FundStatus } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FundsDashboard, type FundStatusFilter } from './FundsDashboard'
import type { FundSummary } from './FundsDashboard'
import { calcPropertyCashflow, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import { calcFundCashflow, calcNAV, calcNAVPerUnit, calcInvestorIRR } from '@/lib/calculations/metrics'
import { calcFundCashRoll, generatePeriods, type PropertyCFInput } from '@/lib/calculations/fund-cashflow'
import { calcDCF } from '@/lib/calculations/dcf'
import { MONTHS_PER_YEAR } from '@/lib/calculations/constants'
import type {
  LeaseInput,
  CapexInput,
  DebtInput,
  FundInput,
  MonthlyPeriod,
  MonthlyCashflow,
  IndexationType,
  AmortizationType,
  DistributionPeriodicity,
} from '@/lib/types'

const DEFAULT_YEARS = 10
const DEFAULT_CPI_RATE = 0.07

// V4.3.3: маппинг таблетки фильтра → список FundStatus для where.
const FILTER_TO_STATUSES: Record<FundStatusFilter, FundStatus[]> = {
  active:   ['ACTIVE'],
  closed:   ['CLOSED'],
  archived: ['ARCHIVED'],
  all:      ['ACTIVE', 'CLOSED', 'ARCHIVED'],
}

function parseFilter(raw: string | string[] | undefined): FundStatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === 'closed' || value === 'archived' || value === 'all') return value
  return 'active'
}

type PageProps = {
  searchParams?: { status?: string | string[] }
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const filter = parseFilter(searchParams?.status)
  const statuses = FILTER_TO_STATUSES[filter]

  const fundsRaw = await prisma.fund.findMany({
    where: { status: { in: statuses } },
    include: {
      _count: { select: { properties: true } },
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
    orderBy: { createdAt: 'asc' },
  })

  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1

  const funds: FundSummary[] = fundsRaw.map(fund => {
    const propertyCashflows: MonthlyCashflow[][] = []
    let totalAcquisitionPrice = 0
    let totalPropertyNPV = 0
    let totalRentableArea = 0
    let totalActiveLeaseArea = 0

    const totalMonths = DEFAULT_YEARS * MONTHS_PER_YEAR
    const periods: MonthlyPeriod[] = Array.from({ length: totalMonths }, (_, i) => {
      const m = startMonth - 1 + i
      return { year: startYear + Math.floor(m / 12), month: (m % 12) + 1 }
    })

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

      const leases: LeaseInput[] = property.leaseContracts.map(lc => ({
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

      const capexItems: CapexInput[] = property.capexItems.map(c => ({
        id: c.id,
        amount: c.amount,
        plannedDate: c.plannedDate,
      }))

      const propertyCF = calcPropertyCashflow(propertyInput, leases, capexItems, periods)
      propertyCashflows.push(propertyCF)

      const acquisitionPrice = property.acquisitionPrice ?? 0
      totalAcquisitionPrice += acquisitionPrice

      const dcfResult = calcDCF(propertyCF, property.wacc, property.exitCapRate, acquisitionPrice)
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
        status: fund.status,
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
      (sum, fp) => sum + (fp.property.acquisitionPrice ?? 0), 0
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

    // IRR инвестора: считается через cashRoll фонда на горизонте startDate–endDate
    const fundPeriods = generatePeriods(fund.startDate, fund.endDate)
    const propertyCFInputs: PropertyCFInput[] = fund.properties.map(fp => {
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
      const leases: LeaseInput[] = property.leaseContracts.map(lc => ({
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
      const capexItems: CapexInput[] = property.capexItems.map(c => ({
        id: c.id,
        amount: c.amount,
        plannedDate: c.plannedDate,
      }))
      return {
        acquisitionPrice: property.acquisitionPrice,
        purchaseDate: property.purchaseDate,
        saleDate: property.saleDate,
        exitCapRate: property.exitCapRate,
        cashflows: calcPropertyCashflow(propertyInput, leases, capexItems, fundPeriods),
        ownershipPct: fp.ownershipPct,
      }
    })

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

    const cashRoll = calcFundCashRoll(fundInput, propertyCFInputs, fundDebts)
    const irrAnnual = calcInvestorIRR(cashRoll)
    const irr: number | null = irrAnnual === 0 ? null : irrAnnual

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
      status: fund.status,
      totalUnits: fund.totalUnits,
      propertyCount: fund._count.properties,
      annualNOI,
      irr,
      nav,
      navPerUnit,
      occupancy,
    }
  })

  return <FundsDashboard funds={funds} currentFilter={filter} />
}
