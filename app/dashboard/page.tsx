import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { type FundStatus } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FundsDashboard, type FundStatusFilter } from './FundsDashboard'
import type { FundSummary } from './FundsDashboard'
import { calcPropertyCashflow, buildPropertyPeriods, type PropertyExpenseInput } from '@/lib/calculations/cashflow'
import { calcInvestorIRR, getReferencePoint } from '@/lib/calculations/metrics'
import { calcFundCashRoll, type PropertyCFInput } from '@/lib/calculations/fund-cashflow'
import { calcNAVTimeSeries, type PropertyValueInput } from '@/lib/calculations/nav'
import type {
  LeaseInput,
  CapexInput,
  CapexReserveInput,
  DebtInput,
  FundInput,
  MonthlyCashRoll,
  IndexationType,
  AmortizationType,
  DistributionPeriodicity,
  ReferencePoint,
} from '@/lib/types'

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

function findIndexByDate(items: { period: { year: number; month: number } }[], date: Date): number {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return items.findIndex(it => it.period.year === y && it.period.month === m)
}

// V4.4.3: окно NOI на 12 месяцев в зависимости от reference status.
function noiWindowSum(cashRoll: MonthlyCashRoll[], refIdx: number, ref: ReferencePoint): number | null {
  if (refIdx === -1) return null
  if (ref.status === 'active') {
    const window = cashRoll.slice(refIdx + 1, refIdx + 13)
    return window.length > 0 ? window.reduce((s, r) => s + r.noiInflow, 0) : null
  }
  if (ref.status === 'closed') {
    const window = cashRoll.slice(Math.max(0, refIdx - 11), refIdx + 1)
    return window.length > 0 ? window.reduce((s, r) => s + r.noiInflow, 0) : null
  }
  return null
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

  const today = new Date()

  const funds: FundSummary[] = fundsRaw.map(fund => {
    const ref = getReferencePoint(fund, today)

    let totalRentableArea = 0
    let totalActiveLeaseArea = 0

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

      const capexReserve: CapexReserveInput | null = property.capexReserve
        ? {
            ratePerSqm: property.capexReserve.ratePerSqm,
            startDate: property.capexReserve.startDate,
            indexationType: property.capexReserve.indexationType as IndexationType,
            indexationRate: property.capexReserve.indexationRate,
          }
        : null

      // V4.2.2: полный CF объекта на projectionYears (не урезается фондом).
      const periods = buildPropertyPeriods(property.purchaseDate, property.projectionYears)
      const cashflows = calcPropertyCashflow(propertyInput, leases, capexItems, periods, capexReserve)

      propertyCFInputs.push({
        acquisitionPrice: property.acquisitionPrice,
        purchaseDate: property.purchaseDate,
        saleDate: property.saleDate,
        exitCapRate: property.exitCapRate,
        cashflows,
        ownershipPct: fp.ownershipPct,
        propertyName: property.name,                 // V4.5.7
      })
      propertyValueInputs.push({
        exitCapRate: property.exitCapRate,
        cashflows,
        ownershipPct: fp.ownershipPct,
        propertyId: property.id,                     // V4.5.7
        propertyName: property.name,
      })

      totalRentableArea += property.rentableArea
      totalActiveLeaseArea += leases
        .filter(l => l.status === 'ACTIVE')
        .reduce((sum, l) => sum + l.area, 0)
    }

    const occupancy = totalRentableArea > 0
      ? totalActiveLeaseArea / totalRentableArea
      : null

    if (propertyCFInputs.length === 0 || ref.status === 'not_started') {
      return {
        id: fund.id,
        name: fund.name,
        registrationNumber: fund.registrationNumber,
        status: fund.status,
        referenceStatus: ref.status,
        totalUnits: fund.totalUnits,
        propertyCount: fund._count.properties,
        annualNOI: null,
        irr: null,
        nav: null,
        navPerUnit: null,
        occupancy,
      }
    }

    const fundDebts: DebtInput[] = fund.fundDebts.map(d => ({
      id: d.id,
      principalAmount: d.principalAmount,
      interestRate: d.interestRate,
      startDate: d.startDate,
      endDate: d.endDate,
      amortizationType: d.amortizationType as AmortizationType,
    }))

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
    const navSeries = calcNAVTimeSeries(cashRoll, propertyValueInputs, fundDebts, fund.totalUnits)

    const refIdx = findIndexByDate(cashRoll, ref.date)

    const annualNOI = noiWindowSum(cashRoll, refIdx, ref)
    const refNav = refIdx !== -1 ? navSeries[refIdx] ?? null : null
    const nav = refNav?.nav ?? null
    const navPerUnit = refNav?.rsp ?? null

    let irr: number | null = null
    if (refIdx !== -1) {
      const sliced = cashRoll.slice(0, refIdx + 1)
      const irrAnnual = sliced.length > 0 ? calcInvestorIRR(sliced).value : 0
      irr = irrAnnual === 0 ? null : irrAnnual
    }

    return {
      id: fund.id,
      name: fund.name,
      registrationNumber: fund.registrationNumber,
      status: fund.status,
      referenceStatus: ref.status,
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
