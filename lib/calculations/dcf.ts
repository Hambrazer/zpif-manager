import type { MonthlyCashflow, ScenarioInput, DCFResult } from '../types'
import { MONTHS_PER_YEAR, IRR_PRECISION, IRR_MAX_ITERATIONS } from './constants'

/**
 * Чистая приведённая стоимость потока cashflows[0..n].
 * cashflows[0] — вложение (t=0, не дисконтируется).
 * discountRate — ставка за период (не годовая).
 */
export function calcNPV(cashflows: number[], discountRate: number): number {
  return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + discountRate, t), 0)
}

/**
 * Внутренняя норма доходности — метод Ньютона-Рафсона.
 * Возвращает IRR за период (не годовой).
 * Возвращает NaN если поток не имеет смены знака (нет вещественного решения).
 */
export function calcIRR(cashflows: number[]): number {
  const hasNeg = cashflows.some((cf) => cf < 0)
  const hasPos = cashflows.some((cf) => cf > 0)
  if (!hasNeg || !hasPos) return NaN

  let r = 0.1
  for (let i = 0; i < IRR_MAX_ITERATIONS; i++) {
    // Guard: (1+r) → 0 leads to division by zero
    if (r <= -1) r = -0.9

    let f = 0
    let df = 0
    for (let t = 0; t < cashflows.length; t++) {
      const cf = cashflows[t]!
      const disc = Math.pow(1 + r, t)
      f  += cf / disc
      df -= (t * cf) / (disc * (1 + r))
    }

    if (Math.abs(df) < 1e-10) break
    const delta = f / df
    r -= delta
    if (Math.abs(delta) < IRR_PRECISION) return r
  }
  return r
}

/**
 * Терминальная стоимость объекта в конце горизонта прогноза.
 * lastNOI, lastFCF — суммарные годовые NOI/FCF последнего года прогноза.
 * Метод выбирается из scenario.terminalType.
 */
export function calcTerminalValue(
  lastNOI: number,
  lastFCF: number,
  scenario: ScenarioInput
): number {
  if (scenario.terminalType === 'EXIT_CAP_RATE') {
    if (scenario.exitCapRate === null || scenario.exitCapRate === 0) return 0
    return lastNOI / scenario.exitCapRate
  }

  // GORDON: TV = FCF_last × (1 + g) / (r − g)
  if (scenario.gordonGrowthRate === null) return 0
  const denom = scenario.discountRate - scenario.gordonGrowthRate
  // denominator must be strictly positive
  if (denom <= 0) return 0
  return (lastFCF * (1 + scenario.gordonGrowthRate)) / denom
}

/**
 * Полная DCF-модель объекта.
 *
 * NPV = Σ FCF_t / (1 + r/12)^t  + TV / (1 + r/12)^n,  t = 1..n
 * (формула без вычитания цены приобретения — это «стоимость» актива)
 *
 * IRR (если передан acquisitionPrice > 0):
 *   месячный IRR из потока [-acquisitionPrice, FCF_1, ..., FCF_n + TV],
 *   аннуализированный: irr_annual = (1 + irr_monthly)^12 − 1
 */
export function calcDCF(
  propertyCashflows: MonthlyCashflow[],
  scenario: ScenarioInput,
  acquisitionPrice = 0
): DCFResult {
  if (propertyCashflows.length === 0) {
    return { cashflows: [], terminalValue: 0, npv: 0, irr: 0, discountRate: scenario.discountRate }
  }

  const r = scenario.discountRate / MONTHS_PER_YEAR
  const n = propertyCashflows.length

  // Годовые NOI/FCF = сумма последних 12 месяцев (или всего периода если < 12)
  const lastYearFlows = propertyCashflows.slice(-MONTHS_PER_YEAR)
  const lastNOI = lastYearFlows.reduce((sum, cf) => sum + cf.noi, 0)
  const lastFCF = lastYearFlows.reduce((sum, cf) => sum + cf.fcf, 0)
  const terminalValue = calcTerminalValue(lastNOI, lastFCF, scenario)

  // NPV: дисконтирование с t=1..n, TV добавляется к последнему периоду
  let npv = 0
  for (let t = 0; t < n; t++) {
    const cf = propertyCashflows[t]!
    const tv = t === n - 1 ? terminalValue : 0
    npv += (cf.fcf + tv) / Math.pow(1 + r, t + 1)
  }

  // IRR: аннуализированный месячный IRR (только если известна цена приобретения)
  let irr = 0
  if (acquisitionPrice > 0) {
    const flows: number[] = propertyCashflows.map((cf, i) =>
      i === n - 1 ? cf.fcf + terminalValue : cf.fcf
    )
    flows.unshift(-acquisitionPrice)
    const irrMonthly = calcIRR(flows)
    irr = isNaN(irrMonthly) ? 0 : Math.pow(1 + irrMonthly, MONTHS_PER_YEAR) - 1
  }

  return { cashflows: propertyCashflows, terminalValue, npv, irr, discountRate: scenario.discountRate }
}
