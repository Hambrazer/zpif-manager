import type { MonthlyCashflow, MonthlyCashRoll, TenantCashflow, MonthlyPeriod } from '@/lib/types'

export type AggregationPeriod = 'monthly' | 'quarterly' | 'annual'

// V4.7.1: режим для annual-агрегации.
//   'calendar' (default) — группировка по календарным годам (Jan–Dec).
//   'ltm'                — окна по 12 месяцев, заканчивающиеся в referenceDate
//                          и идущие назад. Окна не пересекаются.
export type YearMode = 'calendar' | 'ltm'

export type AggregateOptions = {
  yearMode?: YearMode
  referenceDate?: Date
  range?: { from?: Date | null; to?: Date | null }
}

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

// V4.7.1: разница в месяцах от refDate до period (refDate >= period → ≥ 0).
function monthsBack(refDate: Date, period: MonthlyPeriod): number {
  const refY = refDate.getFullYear()
  const refM = refDate.getMonth() + 1
  return (refY - period.year) * 12 + (refM - period.month)
}

// V4.7.1: для annual+ltm возвращает { key, endPeriod } LTM-окна, в которое
// попадает period. Возвращает null, если period > refDate (вне окон).
function ltmBucket(
  period: MonthlyPeriod,
  refDate: Date,
): { key: string; endPeriod: MonthlyPeriod } | null {
  const back = monthsBack(refDate, period)
  if (back < 0) return null
  const idx = Math.floor(back / 12)
  // Конец окна = refDate − idx*12 месяцев (с точностью до месяца).
  const refY = refDate.getFullYear()
  const refM = refDate.getMonth() + 1
  const totalMonthsFromY0 = refY * 12 + (refM - 1) - idx * 12
  const endYear = Math.floor(totalMonthsFromY0 / 12)
  const endMonth = (totalMonthsFromY0 % 12) + 1
  return {
    key: `LTM-${idx}`,
    endPeriod: { year: endYear, month: endMonth },
  }
}

function lastPeriodAsDate(items: { period: MonthlyPeriod }[]): Date | null {
  if (items.length === 0) return null
  // Берём ПОСЛЕДНИЙ период по календарному порядку.
  let max = items[0]!.period
  for (const it of items) {
    if (it.period.year > max.year || (it.period.year === max.year && it.period.month > max.month)) {
      max = it.period
    }
  }
  return new Date(max.year, max.month - 1, 1)
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
 * V4.7.2: options.yearMode для annual — 'calendar' (default) или 'ltm'.
 *
 * Числовые поля MonthlyCashflow суммируются в пределах окна. Tenants внутри
 * окна сворачиваются по `tenantId` (rentIncome/opexReimbursement суммируются,
 * tenantName берётся из первой записи).
 */
export function aggregateCashflows(
  cashflows: MonthlyCashflow[],
  mode: AggregationPeriod,
  options: AggregateOptions = {},
): AggregatedCashflow[] {
  const from = options.range?.from ?? null
  const to = options.range?.to ?? null
  const yearMode: YearMode = options.yearMode ?? 'calendar'

  // Для LTM нужна reference date — либо из options, либо последний месяц cashflows.
  const refDate: Date | null = mode === 'annual' && yearMode === 'ltm'
    ? (options.referenceDate ?? lastPeriodAsDate(cashflows))
    : null

  const buckets = new Map<string, AggregatedCashflow>()
  const tenantBuckets = new Map<string, Map<string, TenantCashflow>>()

  for (const cf of cashflows) {
    if (!isInRange(cf.period, from, to)) continue

    let key: string
    let endPeriod: MonthlyPeriod
    if (mode === 'annual' && yearMode === 'ltm' && refDate) {
      const bucket = ltmBucket(cf.period, refDate)
      if (!bucket) continue
      key = bucket.key
      endPeriod = bucket.endPeriod
    } else {
      key = periodBucketKey(cf.period, mode)
      endPeriod = bucketEndPeriod(cf.period, mode)
    }

    let agg = buckets.get(key)
    if (!agg) {
      agg = emptyAggregate(endPeriod)
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

  for (const [key, agg] of buckets) {
    agg.tenants = Array.from(tenantBuckets.get(key)!.values())
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.period.year !== b.period.year) return a.period.year - b.period.year
    return a.period.month - b.period.month
  })
}

// ─── Агрегация ОДДС фонда (V3.9.2 + V4.7.1) ───────────────────────────────────

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
    redemptionOutflow: 0,
    investorCashflow: 0,
    cashEnd: 0,
  }
}

/**
 * Агрегация помесячного кэш-ролла фонда по периодичности.
 *
 * V4.7.1: options.yearMode для annual — 'calendar' (default) или 'ltm'.
 *
 * Притоки и оттоки внутри окна суммируются. `cashBegin` берётся из ПЕРВОГО
 * месяца окна, `cashEnd` — из ПОСЛЕДНЕГО (чтобы сохранить корректное состояние
 * кэша по границам периода).
 */
export function aggregateFundCashRoll(
  cashRoll: MonthlyCashRoll[],
  mode: AggregationPeriod,
  options: AggregateOptions = {},
): AggregatedCashRoll[] {
  const from = options.range?.from ?? null
  const to = options.range?.to ?? null
  const yearMode: YearMode = options.yearMode ?? 'calendar'

  const refDate: Date | null = mode === 'annual' && yearMode === 'ltm'
    ? (options.referenceDate ?? lastPeriodAsDate(cashRoll))
    : null

  const buckets = new Map<string, AggregatedCashRoll>()
  const bucketBoundaries = new Map<string, { firstCashBegin: number; lastCashEnd: number }>()

  for (const r of cashRoll) {
    if (!isInRange(r.period, from, to)) continue

    let key: string
    let endPeriod: MonthlyPeriod
    if (mode === 'annual' && yearMode === 'ltm' && refDate) {
      const bucket = ltmBucket(r.period, refDate)
      if (!bucket) continue
      key = bucket.key
      endPeriod = bucket.endPeriod
    } else {
      key = periodBucketKey(r.period, mode)
      endPeriod = bucketEndPeriod(r.period, mode)
    }

    let agg = buckets.get(key)
    if (!agg) {
      agg = emptyCashRoll(endPeriod)
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
    agg.redemptionOutflow += r.redemptionOutflow
    agg.investorCashflow += r.investorCashflow
  }

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
