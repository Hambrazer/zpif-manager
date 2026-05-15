import type { MonthlyCashflow, MonthlyCashRoll, TenantCashflow, MonthlyPeriod } from '@/lib/types'

export type AggregationPeriod = 'monthly' | 'quarterly' | 'annual'

/**
 * V3.9.1: агрегированный денежный поток объекта.
 *
 * Структурно совместим с MonthlyCashflow — `period` указывает на ПОСЛЕДНИЙ месяц
 * окна агрегации (для quarterly — 3/6/9/12, для annual — 12). Это позволяет
 * напрямую переиспользовать CashflowTable для отрисовки.
 */
export type AggregatedCashflow = MonthlyCashflow

function periodBucketKey(p: MonthlyPeriod, mode: AggregationPeriod): string {
  switch (mode) {
    case 'monthly':   return `${p.year}-${p.month}`
    case 'quarterly': return `${p.year}-Q${Math.ceil(p.month / 3)}`
    case 'annual':    return `${p.year}`
  }
}

function bucketEndPeriod(p: MonthlyPeriod, mode: AggregationPeriod): MonthlyPeriod {
  switch (mode) {
    case 'monthly':   return { year: p.year, month: p.month }
    case 'quarterly': return { year: p.year, month: Math.ceil(p.month / 3) * 3 }
    case 'annual':    return { year: p.year, month: 12 }
  }
}

function isInRange(p: MonthlyPeriod, from: Date | null, to: Date | null): boolean {
  const ts = new Date(p.year, p.month - 1, 1).getTime()
  if (from && ts < from.getTime()) return false
  if (to && ts > to.getTime()) return false
  return true
}

function emptyAggregate(period: MonthlyPeriod): AggregatedCashflow {
  return {
    period,
    totalIncome: 0,
    opexReimbursementTotal: 0,
    opex: 0,
    propertyTax: 0,
    landTax: 0,
    maintenance: 0,
    capex: 0,
    noi: 0,
    fcf: 0,
    tenants: [],
  }
}

/**
 * Агрегирует помесячный денежный поток по выбранной периодичности.
 *
 * Суммирует числовые поля MonthlyCashflow в пределах окна (месяц/квартал/год).
 * Tenants внутри окна сворачиваются по `tenantId`: суммируются `rentIncome` и
 * `opexReimbursement`, `tenantName` берётся из первой записи.
 *
 * Опциональный `range` фильтрует месяцы, попадающие в окно — границы по `period`
 * (первое число месяца).
 */
export function aggregateCashflows(
  cashflows: MonthlyCashflow[],
  mode: AggregationPeriod,
  range: { from?: Date | null; to?: Date | null } = {},
): AggregatedCashflow[] {
  const from = range.from ?? null
  const to = range.to ?? null

  const buckets = new Map<string, AggregatedCashflow>()
  const tenantBuckets = new Map<string, Map<string, TenantCashflow>>() // bucketKey → tenantId → tenant

  for (const cf of cashflows) {
    if (!isInRange(cf.period, from, to)) continue

    const key = periodBucketKey(cf.period, mode)
    let agg = buckets.get(key)
    if (!agg) {
      agg = emptyAggregate(bucketEndPeriod(cf.period, mode))
      buckets.set(key, agg)
      tenantBuckets.set(key, new Map())
    }

    agg.totalIncome += cf.totalIncome
    agg.opexReimbursementTotal += cf.opexReimbursementTotal
    agg.opex += cf.opex
    agg.propertyTax += cf.propertyTax
    agg.landTax += cf.landTax
    agg.maintenance += cf.maintenance
    agg.capex += cf.capex
    agg.noi += cf.noi
    agg.fcf += cf.fcf

    const tMap = tenantBuckets.get(key)!
    for (const t of cf.tenants) {
      const existing = tMap.get(t.tenantId)
      if (existing) {
        existing.rentIncome += t.rentIncome
        existing.opexReimbursement += t.opexReimbursement
      } else {
        tMap.set(t.tenantId, {
          tenantId: t.tenantId,
          tenantName: t.tenantName,
          rentIncome: t.rentIncome,
          opexReimbursement: t.opexReimbursement,
        })
      }
    }
  }

  // Сворачиваем tenants в массивы и сортируем результат по периоду
  for (const [key, agg] of buckets) {
    agg.tenants = Array.from(tenantBuckets.get(key)!.values())
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year
    return a.period.month - b.period.month
  })
}

// ─── Агрегация ОДДС фонда (V3.9.2) ────────────────────────────────────────────

export type AggregatedCashRoll = MonthlyCashRoll

function emptyCashRoll(period: MonthlyPeriod): AggregatedCashRoll {
  return {
    period,
    cashBegin: 0,
    noiInflow: 0,
    disposalInflow: 0,
    emissionInflow: 0,
    acquisitionOutflow: 0,
    upfrontFeeOutflow: 0,
    managementFeeOutflow: 0,
    fundExpensesOutflow: 0,
    successFeeOperationalOutflow: 0,
    successFeeExitOutflow: 0,
    debtServiceOutflow: 0,
    distributionOutflow: 0,
    cashEnd: 0,
  }
}

/**
 * Агрегация помесячного кэш-ролла фонда по периодичности.
 *
 * Притоки и оттоки внутри окна суммируются. `cashBegin` берётся из ПЕРВОГО месяца
 * окна, `cashEnd` — из ПОСЛЕДНЕГО (чтобы сохранить корректное состояние кэша по
 * границам периода). Если фильтр диапазона убирает часть месяцев — границы окна
 * рассчитываются по тому, что осталось.
 */
export function aggregateFundCashRoll(
  cashRoll: MonthlyCashRoll[],
  mode: AggregationPeriod,
  range: { from?: Date | null; to?: Date | null } = {},
): AggregatedCashRoll[] {
  const from = range.from ?? null
  const to = range.to ?? null

  const buckets = new Map<string, AggregatedCashRoll>()
  const bucketBoundaries = new Map<string, { firstCashBegin: number; lastCashEnd: number }>()

  for (const r of cashRoll) {
    if (!isInRange(r.period, from, to)) continue

    const key = periodBucketKey(r.period, mode)
    let agg = buckets.get(key)
    if (!agg) {
      agg = emptyCashRoll(bucketEndPeriod(r.period, mode))
      buckets.set(key, agg)
      bucketBoundaries.set(key, { firstCashBegin: r.cashBegin, lastCashEnd: r.cashEnd })
    } else {
      const b = bucketBoundaries.get(key)!
      b.lastCashEnd = r.cashEnd
    }

    agg.noiInflow += r.noiInflow
    agg.disposalInflow += r.disposalInflow
    agg.emissionInflow += r.emissionInflow
    agg.acquisitionOutflow += r.acquisitionOutflow
    agg.upfrontFeeOutflow += r.upfrontFeeOutflow
    agg.managementFeeOutflow += r.managementFeeOutflow
    agg.fundExpensesOutflow += r.fundExpensesOutflow
    agg.successFeeOperationalOutflow += r.successFeeOperationalOutflow
    agg.successFeeExitOutflow += r.successFeeExitOutflow
    agg.debtServiceOutflow += r.debtServiceOutflow
    agg.distributionOutflow += r.distributionOutflow
  }

  // Финализируем cashBegin/cashEnd окна
  for (const [key, agg] of buckets) {
    const b = bucketBoundaries.get(key)!
    agg.cashBegin = b.firstCashBegin
    agg.cashEnd = b.lastCashEnd
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year
    return a.period.month - b.period.month
  })
}
