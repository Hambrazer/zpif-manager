import type {
  LeaseInput,
  CapexInput,
  ScenarioInput,
  MonthlyPeriod,
  MonthlyCashflow,
  TenantCashflow,
} from '../types'
import { calcIndexedRent } from './indexation'

// Поля объекта, необходимые для расчёта денежного потока
export type PropertyExpenseInput = {
  rentableArea: number
  opexRate: number               // ₽/м²/год (индексируется на ИПЦ)
  maintenanceRate: number        // эксплуатационные расходы, ₽/м²/год (индексируется на ИПЦ)
  cadastralValue: number | null  // кадастровая стоимость здания, ₽
  landCadastralValue: number | null
  propertyTaxRate: number        // в долях (0.022 = 2.2%)
  landTaxRate: number            // в долях
}

function lastDayOfMonth(period: MonthlyPeriod): Date {
  return new Date(period.year, period.month, 0)
}

function periodKey(p: MonthlyPeriod): string {
  return `${p.year}-${p.month}`
}

function isLeaseActiveInPeriod(lease: LeaseInput, period: MonthlyPeriod): boolean {
  if (lease.status === 'EXPIRED') return false
  const periodStart = new Date(period.year, period.month - 1, 1)
  const periodEnd = lastDayOfMonth(period)
  return lease.startDate <= periodEnd && lease.endDate >= periodStart
}

/**
 * Рассчитывает помесячный денежный поток объекта недвижимости (v2).
 *
 * Доходы:
 *   GRI  = Σ active leases: area × indexedBaseRent × rentGrowthFactor / 12
 *   opexReimbursementTotal = Σ active leases: area × indexedOpexReimbursementRate / 12
 *   Оба потока умножаются на (1 − vacancyRate)
 *
 * Расходы объекта:
 *   opex        = opexRate × rentableArea / 12 × CPI^t × opexGrowthFactor
 *   maintenance = maintenanceRate × rentableArea / 12 × CPI^t × opexGrowthFactor
 *   propertyTax = cadastralValue × propertyTaxRate / 12
 *   landTax     = landCadastralValue × landTaxRate / 12
 *
 * NOI = (nri + opexReimbursementTotal) − opex − propertyTax − landTax − maintenance
 * FCF = NOI − CAPEX
 * debtService = 0 (долг только на уровне фонда)
 */
export function calcPropertyCashflow(
  property: PropertyExpenseInput,
  leases: LeaseInput[],
  capexItems: CapexInput[],
  scenario: ScenarioInput,
  periods: MonthlyPeriod[]
): MonthlyCashflow[] {
  if (periods.length === 0) return []

  const firstPeriod = periods[0]!

  const cpiValues: Record<number, number> = {}
  for (let y = firstPeriod.year - 1; y <= firstPeriod.year + scenario.projectionYears + 2; y++) {
    cpiValues[y] = scenario.cpiRate
  }

  const capexMap = new Map<string, number>()
  for (const capex of capexItems) {
    const y = capex.plannedDate.getFullYear()
    const m = capex.plannedDate.getMonth() + 1
    capexMap.set(`${y}-${m}`, (capexMap.get(`${y}-${m}`) ?? 0) + capex.amount)
  }

  // Виртуальный startDate для индексации OPEX/maintenance = начало первого периода
  const opexVirtualStart = new Date(firstPeriod.year, firstPeriod.month - 1, 1)

  return periods.map((period) => {
    const key = periodKey(period)
    const periodEnd = lastDayOfMonth(period)
    const monthOffset =
      (period.year - firstPeriod.year) * 12 + (period.month - firstPeriod.month)
    const yearOffset = Math.floor(monthOffset / 12)
    const rentGrowthFactor = Math.pow(1 + scenario.rentGrowthRate, yearOffset)
    const opexGrowthFactor = Math.pow(1 + scenario.opexGrowthRate, yearOffset)

    // Считаем доходы по каждому арендатору
    type TenantRaw = { lease: LeaseInput; rentGross: number; opexReimbGross: number }
    const activeTenants: TenantRaw[] = []
    let gri = 0
    let opexReimbursementGross = 0

    for (const lease of leases) {
      if (!isLeaseActiveInPeriod(lease, period)) continue

      const indexedRent = calcIndexedRent(
        lease.baseRent,
        lease.startDate,
        periodEnd,
        lease.indexationType,
        lease.indexationRate,
        cpiValues
      )
      const rentGross = (lease.area * indexedRent * rentGrowthFactor) / 12
      gri += rentGross

      const indexedOpexReimb = calcIndexedRent(
        lease.opexReimbursementRate,
        lease.startDate,
        periodEnd,
        lease.opexReimbursementIndexationType,
        lease.opexReimbursementIndexationRate,
        cpiValues
      )
      const opexReimbGross = (lease.area * indexedOpexReimb) / 12
      opexReimbursementGross += opexReimbGross

      activeTenants.push({ lease, rentGross, opexReimbGross })
    }

    const vacancy = gri * scenario.vacancyRate
    const nri = gri - vacancy
    const occupancyFactor = 1 - scenario.vacancyRate
    const opexReimbursementTotal = opexReimbursementGross * occupancyFactor

    const tenants: TenantCashflow[] = activeTenants.map(({ lease, rentGross, opexReimbGross }) => ({
      tenantId: lease.id,
      tenantName: lease.tenantName,
      rentIncome: rentGross * occupancyFactor,
      opexReimbursement: opexReimbGross * occupancyFactor,
    }))

    // Расходы объекта
    const opexIndexed = calcIndexedRent(
      property.opexRate,
      opexVirtualStart,
      periodEnd,
      'CPI',
      null,
      cpiValues
    )
    const opex = (opexIndexed * property.rentableArea) / 12 * opexGrowthFactor

    const maintenanceIndexed = calcIndexedRent(
      property.maintenanceRate,
      opexVirtualStart,
      periodEnd,
      'CPI',
      null,
      cpiValues
    )
    const maintenance = (maintenanceIndexed * property.rentableArea) / 12 * opexGrowthFactor

    const propertyTax = ((property.cadastralValue ?? 0) * property.propertyTaxRate) / 12
    const landTax = ((property.landCadastralValue ?? 0) * property.landTaxRate) / 12

    const capex = capexMap.get(key) ?? 0
    const noi = nri + opexReimbursementTotal - opex - propertyTax - landTax - maintenance
    const fcf = noi - capex

    return {
      period,
      gri,
      vacancy,
      nri,
      opexReimbursementTotal,
      opex,
      propertyTax,
      landTax,
      maintenance,
      capex,
      noi,
      debtService: 0,
      fcf,
      tenants,
    }
  })
}
