import type {
  LeaseInput,
  CapexInput,
  MonthlyPeriod,
  MonthlyCashflow,
  TenantCashflow,
} from '../types'
import { calcIndexedRent } from './indexation'

// Поля объекта, необходимые для расчёта денежного потока
export type PropertyExpenseInput = {
  rentableArea: number
  opexRate: number               // ₽/м²/год — фиксированная ставка, без индексации
  maintenanceRate: number        // эксплуатационные расходы, ₽/м²/год — фиксированная ставка
  cadastralValue: number | null  // кадастровая стоимость здания, ₽
  landCadastralValue: number | null
  propertyTaxRate: number        // в долях (0.022 = 2.2%)
  landTaxRate: number            // в долях
  cpiRate: number                // ИПЦ в долях (0.07 = 7%) — для CPI-индексации договоров
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
 * Рассчитывает помесячный денежный поток объекта недвижимости.
 *
 * Доходы считаются по факту активных договоров — без вакансии.
 *   rentIncome = Σ активных lease: area × calcIndexedRent(lease, period) / 12
 *   opexReimbTotal = Σ активных lease: area × calcIndexedOpexReimb(lease, period) / 12
 *
 * Расходы объекта — фиксированные ставки, без индексации:
 *   opex        = opexRate × rentableArea / 12
 *   maintenance = maintenanceRate × rentableArea / 12
 *   propertyTax = cadastralValue × propertyTaxRate / 12
 *   landTax     = landCadastralValue × landTaxRate / 12
 *
 * NOI = (nri + opexReimbTotal) − opex − propertyTax − landTax − maintenance
 * FCF = NOI − CAPEX
 */
export function calcPropertyCashflow(
  property: PropertyExpenseInput,
  leases: LeaseInput[],
  capexItems: CapexInput[],
  periods: MonthlyPeriod[]
): MonthlyCashflow[] {
  if (periods.length === 0) return []

  const firstPeriod = periods[0]!
  const lastPeriod = periods[periods.length - 1]!

  const cpiValues: Record<number, number> = {}
  for (let y = firstPeriod.year - 1; y <= lastPeriod.year + 2; y++) {
    cpiValues[y] = property.cpiRate
  }

  const capexMap = new Map<string, number>()
  for (const capex of capexItems) {
    const y = capex.plannedDate.getFullYear()
    const m = capex.plannedDate.getMonth() + 1
    capexMap.set(`${y}-${m}`, (capexMap.get(`${y}-${m}`) ?? 0) + capex.amount)
  }

  // Фиксированные расходы одинаковы для всех периодов
  const opex = (property.opexRate * property.rentableArea) / 12
  const maintenance = (property.maintenanceRate * property.rentableArea) / 12
  const propertyTax = ((property.cadastralValue ?? 0) * property.propertyTaxRate) / 12
  const landTax = ((property.landCadastralValue ?? 0) * property.landTaxRate) / 12

  return periods.map((period) => {
    const key = periodKey(period)
    const periodEnd = lastDayOfMonth(period)

    let gri = 0
    let opexReimbursementTotal = 0
    const tenants: TenantCashflow[] = []

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
      const rentIncome = (lease.area * indexedRent) / 12
      gri += rentIncome

      const indexedOpexReimb = calcIndexedRent(
        lease.opexReimbursementRate,
        lease.startDate,
        periodEnd,
        lease.opexReimbursementIndexationType,
        lease.opexReimbursementIndexationRate,
        cpiValues
      )
      const opexReimbursement = (lease.area * indexedOpexReimb) / 12
      opexReimbursementTotal += opexReimbursement

      tenants.push({
        tenantId: lease.id,
        tenantName: lease.tenantName,
        rentIncome,
        opexReimbursement,
      })
    }

    const vacancy = 0
    const nri = gri
    const noi = nri + opexReimbursementTotal - opex - propertyTax - landTax - maintenance
    const capexAmount = capexMap.get(key) ?? 0
    const fcf = noi - capexAmount

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
      capex: capexAmount,
      noi,
      fcf,
      tenants,
    }
  })
}
