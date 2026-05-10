import type {
  MonthlyCashflow,
  MonthlyCashRoll,
  NAVResult,
  MonthlyPeriod,
  DebtInput,
} from '../types'
import { calcDebtSchedule } from './amortization'

function periodKey(p: MonthlyPeriod): string {
  return `${p.year}-${p.month}`
}

// ─── Вспомогательные типы ─────────────────────────────────────────────────────

/** Минимальный набор данных объекта для расчёта стоимости в СЧА */
export type PropertyValueInput = {
  exitCapRate: number | null
  cashflows: MonthlyCashflow[]
}

// ─── Стоимость объекта ────────────────────────────────────────────────────────

/**
 * Стоимость объекта для СЧА = NOI следующих 12 мес / exitCapRate.
 * Возвращает 0 если exitCapRate не задан или равен 0.
 */
export function calcPropertyValue(
  property: { exitCapRate: number | null },
  nextYearNOI: number
): number {
  if (!property.exitCapRate || property.exitCapRate === 0) return 0
  return nextYearNOI / property.exitCapRate
}

// ─── СЧА ─────────────────────────────────────────────────────────────────────

/**
 * СЧА = (Кэш + Σ стоимости объектов + Прочие активы) − (Остаток долга + Прочие обязательства)
 */
export function calcNAV(
  cash: number,
  propertyValues: number[],
  debtBalance: number,
  otherAssets = 0,
  otherLiabilities = 0
): number {
  const totalPropertyValue = propertyValues.reduce((s, v) => s + v, 0)
  const totalAssets = cash + totalPropertyValue + otherAssets
  const totalLiabilities = debtBalance + otherLiabilities
  return totalAssets - totalLiabilities
}

// ─── РСП ─────────────────────────────────────────────────────────────────────

/**
 * РСП (расчётная стоимость пая) = СЧА / количество паёв.
 * Возвращает 0 если паёв нет.
 */
export function calcRSP(nav: number, totalUnits: number): number {
  if (totalUnits === 0) return 0
  return nav / totalUnits
}

// ─── Вспомогательные функции ──────────────────────────────────────────────────

/**
 * NOI следующих 12 месяцев после указанного периода для одного объекта.
 * Ищет позицию period в массиве и суммирует NOI следующих 12 строк.
 */
function calcNextYearNOI(cashflows: MonthlyCashflow[], period: MonthlyPeriod): number {
  const idx = cashflows.findIndex(
    cf => cf.period.year === period.year && cf.period.month === period.month
  )
  if (idx === -1) return 0
  return cashflows
    .slice(idx + 1, idx + 13)
    .reduce((sum, cf) => sum + cf.noi, 0)
}

/**
 * Строит карту period → суммарный остаток долга по всем FundDebt.
 *
 * Для каждого периода и каждого долга:
 *   - период внутри графика → remainingBalance из scheduleMap
 *   - период до начала первого платежа → principalAmount (долг ещё не амортизируется)
 *   - период после последнего платежа → 0
 */
function buildDebtBalanceMap(
  fundDebts: DebtInput[],
  periods: MonthlyPeriod[]
): Map<string, number> {
  const totalBalance = new Map<string, number>(
    periods.map(p => [periodKey(p), 0])
  )

  for (const debt of fundDebts) {
    const schedule = calcDebtSchedule(debt)
    const schedMap = new Map(
      schedule.map(p => [periodKey(p.period), p.remainingBalance])
    )

    for (const period of periods) {
      const k = periodKey(period)
      const pDate = new Date(period.year, period.month - 1, 1)

      let bal: number
      if (schedMap.has(k)) {
        bal = schedMap.get(k)!
      } else if (pDate <= debt.startDate) {
        // Период до начала обслуживания долга — баланс равен номиналу
        bal = debt.principalAmount
      } else {
        // После полного погашения
        bal = 0
      }

      totalBalance.set(k, (totalBalance.get(k) ?? 0) + bal)
    }
  }

  return totalBalance
}

// ─── Временной ряд СЧА / РСП ─────────────────────────────────────────────────

/**
 * Временной ряд СЧА и РСП за горизонт фонда.
 *
 * Алгоритм для каждого периода:
 *   1. Кэш = fundCashRoll[period].cashEnd
 *   2. Стоимость объектов = Σ calcPropertyValue(prop, NOI_следующих_12_мес)
 *   3. Остаток долга = Σ remainingBalance по FundDebt
 *   4. СЧА = Кэш + Стоимость объектов − Остаток долга
 *   5. РСП = СЧА / totalUnits
 */
export function calcNAVTimeSeries(
  fundCashRoll: MonthlyCashRoll[],
  properties: PropertyValueInput[],
  fundDebts: DebtInput[],
  totalUnits: number
): NAVResult[] {
  if (fundCashRoll.length === 0) return []

  const periods = fundCashRoll.map(r => r.period)
  const debtBalanceMap = buildDebtBalanceMap(fundDebts, periods)
  const cashMap = new Map(fundCashRoll.map(r => [periodKey(r.period), r.cashEnd]))

  return periods.map(period => {
    const k = periodKey(period)
    const cash = cashMap.get(k) ?? 0
    const debtBalance = debtBalanceMap.get(k) ?? 0

    let propertyValue = 0
    for (const prop of properties) {
      const nextYearNOI = calcNextYearNOI(prop.cashflows, period)
      propertyValue += calcPropertyValue(prop, nextYearNOI)
    }

    const totalAssets = cash + propertyValue
    const nav = totalAssets - debtBalance
    const rsp = calcRSP(nav, totalUnits)

    return { period, propertyValue, cash, totalAssets, debtBalance, nav, rsp }
  })
}
