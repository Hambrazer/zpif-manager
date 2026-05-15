import type {
  FundInput,
  MonthlyCashflow,
  MonthlyCashRoll,
  MonthlyPeriod,
  DistributionPeriodicity,
  DebtInput,
} from '../types'
import { calcDebtSchedule } from './amortization'

/** Метаданные объекта + его помесячный денежный поток для расчёта кэш-ролла фонда.
 *  V3.8.5: ownershipPct — доля владения фонда в объекте (0; 100]. Все денежные
 *  потоки от объекта (NOI, покупка, продажа, оценка стоимости) масштабируются на
 *  ownershipPct/100. Если поле не задано — считается 100% (обратная совместимость). */
export type PropertyCFInput = {
  acquisitionPrice: number | null
  purchaseDate: Date | null
  saleDate: Date | null
  exitCapRate: number | null
  cashflows: MonthlyCashflow[]
  ownershipPct?: number
}

function periodKey(p: MonthlyPeriod): string {
  return `${p.year}-${p.month}`
}

function isSamePeriod(date: Date, period: MonthlyPeriod): boolean {
  return date.getFullYear() === period.year && date.getMonth() + 1 === period.month
}

export function generatePeriods(startDate: Date, endDate: Date): MonthlyPeriod[] {
  const periods: MonthlyPeriod[] = []
  let y = startDate.getFullYear()
  let m = startDate.getMonth() + 1
  const endY = endDate.getFullYear()
  const endM = endDate.getMonth() + 1
  while (y < endY || (y === endY && m <= endM)) {
    periods.push({ year: y, month: m })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return periods
}

// ─── Формульные функции ───────────────────────────────────────────────────────

/**
 * Upfront fee = upfrontFeeRate × totalEmission / (1 − upfrontFeeRate)
 * Разовый отток в t=0.
 */
export function calcUpfrontFee(totalEmission: number, upfrontFeeRate: number): number {
  if (upfrontFeeRate <= 0 || upfrontFeeRate >= 1) return 0
  return (upfrontFeeRate * totalEmission) / (1 - upfrontFeeRate)
}

/**
 * Management fee (помесячно) = managementFeeRate × nav / 12
 */
export function calcManagementFee(nav: number, managementFeeRate: number): number {
  return (nav * managementFeeRate) / 12
}

/**
 * Fund expenses (помесячно) = fundExpensesRate × nav / 12
 */
export function calcFundExpenses(nav: number, fundExpensesRate: number): number {
  return (nav * fundExpensesRate) / 12
}

/**
 * Success fee operational = rate × distributions
 * Начисляется в момент выплаты пайщикам.
 */
export function calcSuccessFeeOperational(distributions: number, rate: number): number {
  return distributions * rate
}

/**
 * Success fee exit = rate × max(navEnd − navStart, 0)
 * Разовый платёж в дату endDate фонда, только при росте СЧА.
 */
export function calcSuccessFeeExit(navEnd: number, navStart: number, rate: number): number {
  return Math.max(navEnd - navStart, 0) * rate
}

/**
 * Выплаты пайщикам в текущем периоде.
 * MONTHLY  — каждый месяц
 * QUARTERLY — в конце квартала (месяцы 3, 6, 9, 12)
 * ANNUAL   — в декабре
 * Если FCF отрицательный — выплат нет.
 */
export function calcDistributions(
  fcfBeforeDistribution: number,
  periodicity: DistributionPeriodicity,
  currentPeriod: MonthlyPeriod
): number {
  if (fcfBeforeDistribution <= 0) return 0
  const m = currentPeriod.month
  switch (periodicity) {
    case 'MONTHLY':
      return fcfBeforeDistribution
    case 'QUARTERLY':
      return m % 3 === 0 ? fcfBeforeDistribution : 0
    case 'ANNUAL':
      return m === 12 ? fcfBeforeDistribution : 0
  }
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function isPropertyActiveInPeriod(prop: PropertyCFInput, period: MonthlyPeriod): boolean {
  if (prop.purchaseDate) {
    const py = prop.purchaseDate.getFullYear()
    const pm = prop.purchaseDate.getMonth() + 1
    if (period.year < py || (period.year === py && period.month < pm)) return false
  }
  if (prop.saleDate) {
    const sy = prop.saleDate.getFullYear()
    const sm = prop.saleDate.getMonth() + 1
    if (period.year > sy || (period.year === sy && period.month > sm)) return false
  }
  return true
}

/** Доля владения фонда в объекте, в долях (0; 1]. По умолчанию 100% (=1). */
function ownershipShare(prop: PropertyCFInput): number {
  const pct = prop.ownershipPct ?? 100
  return pct / 100
}

/** NOI следующих 12 месяцев после указанного периода */
function calcNextYearNOI(cashflows: MonthlyCashflow[], period: MonthlyPeriod): number {
  const idx = cashflows.findIndex(
    cf => cf.period.year === period.year && cf.period.month === period.month
  )
  if (idx === -1) return 0
  return cashflows.slice(idx + 1, idx + 13).reduce((s, cf) => s + cf.noi, 0)
}

/** Стоимость объекта = NOI_12мес / exitCapRate × доля владения */
function getPropertyValue(prop: PropertyCFInput, period: MonthlyPeriod): number {
  if (!prop.exitCapRate || prop.exitCapRate === 0) return 0
  return (calcNextYearNOI(prop.cashflows, period) / prop.exitCapRate) * ownershipShare(prop)
}

/** Выручка от продажи = NOI_12мес_после_saleDate / exitCapRate × доля владения */
function getSaleProceeds(prop: PropertyCFInput): number {
  if (!prop.saleDate || !prop.exitCapRate || prop.exitCapRate === 0) return 0
  const salePeriod: MonthlyPeriod = {
    year: prop.saleDate.getFullYear(),
    month: prop.saleDate.getMonth() + 1,
  }
  return (calcNextYearNOI(prop.cashflows, salePeriod) / prop.exitCapRate) * ownershipShare(prop)
}

function buildDebtServiceMap(fundDebts: DebtInput[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const debt of fundDebts) {
    for (const payment of calcDebtSchedule(debt)) {
      const k = periodKey(payment.period)
      map.set(k, (map.get(k) ?? 0) + payment.total)
    }
  }
  return map
}

function buildDebtBalanceMap(
  fundDebts: DebtInput[],
  periods: MonthlyPeriod[]
): Map<string, number> {
  const map = new Map<string, number>(periods.map(p => [periodKey(p), 0]))
  for (const debt of fundDebts) {
    const schedule = calcDebtSchedule(debt)
    const schedMap = new Map(schedule.map(s => [periodKey(s.period), s.remainingBalance]))
    for (const period of periods) {
      const k = periodKey(period)
      const pDate = new Date(period.year, period.month - 1, 1)
      let bal: number
      if (schedMap.has(k)) {
        bal = schedMap.get(k)!
      } else if (pDate <= debt.startDate) {
        bal = debt.principalAmount
      } else {
        bal = 0
      }
      map.set(k, (map.get(k) ?? 0) + bal)
    }
  }
  return map
}

// ─── Кэш-ролл фонда ──────────────────────────────────────────────────────────

/**
 * Помесячный кэш-ролл фонда за горизонт fund.startDate — fund.endDate.
 *
 * propertyCashflows[i] должен соответствовать i-му объекту фонда.
 * fundDebts — долги фонда для расчёта графика погашения.
 *
 * Алгоритм (для каждого периода):
 *   1. Притоки: totalEmission (t=0), NOI, выручка от продаж объектов
 *   2. Оттоки: upfrontFee (t=0), покупки объектов, долг, комиссии, выплаты
 *   3. Management fee и Fund expenses считаются от NAV начала периода (cashBegin + propertyValues − debt)
 *   4. FCF до выплат = NOI − managementFee − fundExpenses − debtService
 *   5. Distributions = fcf (если период выплаты), иначе 0
 *   6. Success fee exit — разово в последнем периоде при росте СЧА
 */
export function calcFundCashRoll(
  fund: FundInput,
  propertyCashflows: PropertyCFInput[],
  fundDebts: DebtInput[]
): MonthlyCashRoll[] {
  const periods = generatePeriods(fund.startDate, fund.endDate)
  if (periods.length === 0) return []

  const debtServiceMap = buildDebtServiceMap(fundDebts)
  const debtBalanceMap = buildDebtBalanceMap(fundDebts, periods)

  const upfrontFee = calcUpfrontFee(fund.totalEmission, fund.upfrontFeeRate)
  // navStart = капитал фонда после upfront fee (базис для success fee exit)
  const navStart = fund.totalEmission - upfrontFee

  const lastPeriod = periods[periods.length - 1]!
  const result: MonthlyCashRoll[] = []
  let cashBegin = 0

  for (const period of periods) {
    const k = periodKey(period)
    const isStartPeriod = isSamePeriod(fund.startDate, period)
    const isEndPeriod = period.year === lastPeriod.year && period.month === lastPeriod.month

    // ─── Притоки ────────────────────────────────────────────────────────────
    const emissionInflow = isStartPeriod ? fund.totalEmission : 0

    let noiInflow = 0
    for (const prop of propertyCashflows) {
      if (!isPropertyActiveInPeriod(prop, period)) continue
      const cf = prop.cashflows.find(c => c.period.year === period.year && c.period.month === period.month)
      noiInflow += (cf?.noi ?? 0) * ownershipShare(prop)
    }

    let disposalInflow = 0
    for (const prop of propertyCashflows) {
      if (prop.saleDate && isSamePeriod(prop.saleDate, period)) {
        disposalInflow += getSaleProceeds(prop)
      }
    }

    // ─── Оттоки ─────────────────────────────────────────────────────────────
    const upfrontFeeOutflow = isStartPeriod ? upfrontFee : 0

    let acquisitionOutflow = 0
    for (const prop of propertyCashflows) {
      if (prop.purchaseDate && isSamePeriod(prop.purchaseDate, period)) {
        acquisitionOutflow += (prop.acquisitionPrice ?? 0) * ownershipShare(prop)
      }
    }

    const debtServiceOutflow = debtServiceMap.get(k) ?? 0

    // NAV начала периода для расчёта комиссий (cashBegin + стоимость объектов − долг)
    const debtBalance = debtBalanceMap.get(k) ?? 0
    let propValAtPeriod = 0
    for (const prop of propertyCashflows) {
      if (isPropertyActiveInPeriod(prop, period)) {
        propValAtPeriod += getPropertyValue(prop, period)
      }
    }
    const navBegin = Math.max(0, cashBegin + propValAtPeriod - debtBalance)

    const managementFeeOutflow = calcManagementFee(navBegin, fund.managementFeeRate)
    const fundExpensesOutflow = calcFundExpenses(navBegin, fund.fundExpensesRate)

    // FCF до выплат = NOI − комиссии − долг (покупки/продажи не учитываются)
    const fcfBeforeDistribution = noiInflow - managementFeeOutflow - fundExpensesOutflow - debtServiceOutflow

    const distributionOutflow = calcDistributions(fcfBeforeDistribution, fund.distributionPeriodicity, period)
    const successFeeOperationalOutflow = calcSuccessFeeOperational(distributionOutflow, fund.successFeeOperational)

    // Success fee exit — разово в последнем периоде при росте СЧА
    let successFeeExitOutflow = 0
    if (isEndPeriod && fund.successFeeExit > 0) {
      const cashEndEst = cashBegin
        + emissionInflow + noiInflow + disposalInflow
        - acquisitionOutflow - upfrontFeeOutflow
        - managementFeeOutflow - fundExpensesOutflow
        - debtServiceOutflow - distributionOutflow - successFeeOperationalOutflow
      const navEnd = Math.max(0, cashEndEst + propValAtPeriod - 0) // долг погашен к концу
      successFeeExitOutflow = calcSuccessFeeExit(navEnd, navStart, fund.successFeeExit)
    }

    // ─── Итог ────────────────────────────────────────────────────────────────
    const cashEnd = cashBegin
      + emissionInflow + noiInflow + disposalInflow
      - acquisitionOutflow - upfrontFeeOutflow
      - managementFeeOutflow - fundExpensesOutflow
      - debtServiceOutflow - distributionOutflow
      - successFeeOperationalOutflow - successFeeExitOutflow

    result.push({
      period,
      cashBegin,
      noiInflow,
      disposalInflow,
      emissionInflow,
      acquisitionOutflow,
      upfrontFeeOutflow,
      managementFeeOutflow,
      fundExpensesOutflow,
      successFeeOperationalOutflow,
      successFeeExitOutflow,
      debtServiceOutflow,
      distributionOutflow,
      cashEnd,
    })

    cashBegin = cashEnd
  }

  return result
}
