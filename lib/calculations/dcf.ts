import type { MonthlyCashflow, DCFResult, Trace, TraceOperand } from '../types'
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
 * Возвращает IRR за период (не годовой), флоу для отображения и trace.
 *
 * V4.5.5: возвращает не просто число, а структуру с потоком и раскладкой —
 * чтобы UI мог показать, какой поток лёг в основу расчёта.
 *
 * Если поток не имеет смены знака — value = NaN, trace.value тоже NaN.
 */
export function calcIRR(cashflows: number[]): {
  value: number
  flow: number[]
  trace: Trace
} {
  const flow = cashflows.slice()
  const operands: TraceOperand[] = flow.map((cf, t) => ({
    label: `t=${t}`,
    value: cf,
    unit: '₽',
  }))

  const hasNeg = flow.some((cf) => cf < 0)
  const hasPos = flow.some((cf) => cf > 0)
  if (!hasNeg || !hasPos) {
    return {
      value: NaN,
      flow,
      trace: {
        formula: 'IRR не определён: в потоке нет смены знака',
        operands,
        value: NaN,
      },
    }
  }

  let r = 0.1
  for (let i = 0; i < IRR_MAX_ITERATIONS; i++) {
    if (r <= -1) r = -0.9

    let f = 0
    let df = 0
    for (let t = 0; t < flow.length; t++) {
      const cf = flow[t]!
      const disc = Math.pow(1 + r, t)
      f  += cf / disc
      df -= (t * cf) / (disc * (1 + r))
    }

    if (Math.abs(df) < 1e-10) break
    const delta = f / df
    r -= delta
    if (Math.abs(delta) < IRR_PRECISION) {
      return {
        value: r,
        flow,
        trace: {
          formula: 'IRR такая, что Σ CF_t / (1+IRR)^t = 0',
          operands,
          value: r,
        },
      }
    }
  }
  return {
    value: r,
    flow,
    trace: {
      formula: 'IRR такая, что Σ CF_t / (1+IRR)^t = 0 (макс. итераций)',
      operands,
      value: r,
    },
  }
}

/**
 * Терминальная стоимость объекта методом Exit Cap Rate.
 * lastNOI — суммарный NOI последнего года прогноза.
 */
export function calcTerminalValue(
  lastNOI: number,
  exitCapRate: number | null
): number {
  if (!exitCapRate || exitCapRate === 0) return 0
  return lastNOI / exitCapRate
}

/**
 * Полная DCF-модель объекта.
 *
 * NPV = Σ FCF_t / (1 + r/12)^t  + TV / (1 + r/12)^n,  t = 1..n
 * IRR (если acquisitionPrice > 0): из потока [-acquisitionPrice, FCF_1, ..., FCF_n + TV],
 * аннуализированный.
 */
export function calcDCF(
  propertyCashflows: MonthlyCashflow[],
  discountRate: number,
  exitCapRate: number | null,
  acquisitionPrice = 0
): DCFResult {
  if (propertyCashflows.length === 0) {
    return { cashflows: [], terminalValue: 0, npv: 0, irr: 0, discountRate }
  }

  const r = discountRate / MONTHS_PER_YEAR
  const n = propertyCashflows.length

  const lastYearFlows = propertyCashflows.slice(-MONTHS_PER_YEAR)
  const lastNOI = lastYearFlows.reduce((sum, cf) => sum + cf.noi, 0)
  const terminalValue = calcTerminalValue(lastNOI, exitCapRate)

  // V4.5.5: trace терминальной стоимости.
  const terminalValueTrace: Trace = {
    formula: 'NOI последнего года прогноза / exitCapRate',
    operands: [
      { label: 'NOI последнего года',  value: lastNOI,            unit: '₽' },
      { label: 'Exit Cap Rate',        value: exitCapRate ?? 0,   unit: '%' },
    ],
    value: terminalValue,
  }

  let npv = 0
  const npvOperands: TraceOperand[] = []
  for (let t = 0; t < n; t++) {
    const cf = propertyCashflows[t]!
    const tv = t === n - 1 ? terminalValue : 0
    const disc = Math.pow(1 + r, t + 1)
    const contribution = (cf.fcf + tv) / disc
    npv += contribution
    // Сокращаем размер trace: для длинных горизонтов оставляем только итоги
    // годового среза (12, 24, ... месяцы) + последний месяц с TV.
    const isYearEnd = (t + 1) % MONTHS_PER_YEAR === 0
    const isLast = t === n - 1
    if (isYearEnd || isLast) {
      npvOperands.push({
        label: `t=${t + 1}: дисконтированный FCF${tv > 0 ? ' + TV' : ''}`,
        value: contribution,
        unit: '₽',
      })
    }
  }
  const npvTrace: Trace = {
    formula: 'Σ FCF_t / (1 + r_monthly)^t + TV_дисконт',
    operands: [
      { label: 'Ставка дисконтирования (год)', value: discountRate, unit: '%' },
      { label: 'Терминальная стоимость',       value: terminalValue, unit: '₽', trace: terminalValueTrace },
      ...npvOperands,
    ],
    value: npv,
  }

  let irr = 0
  let irrFlow: number[] | undefined
  let irrTrace: Trace | undefined
  if (acquisitionPrice > 0) {
    const flows: number[] = propertyCashflows.map((cf, i) =>
      i === n - 1 ? cf.fcf + terminalValue : cf.fcf
    )
    flows.unshift(-acquisitionPrice)
    const irrResult = calcIRR(flows)
    irr = isNaN(irrResult.value) ? 0 : Math.pow(1 + irrResult.value, MONTHS_PER_YEAR) - 1
    irrFlow = irrResult.flow
    irrTrace = {
      formula: 'irr_annual = (1 + IRR_monthly)^12 − 1, где IRR_monthly из calcIRR',
      operands: [
        { label: 'IRR помесячный', value: irrResult.value, unit: '%', trace: irrResult.trace },
        { label: 'Месяцев в году', value: MONTHS_PER_YEAR },
      ],
      value: irr,
    }
  }

  return {
    cashflows: propertyCashflows,
    terminalValue,
    npv,
    irr,
    discountRate,
    npvTrace,
    terminalValueTrace,
    ...(irrFlow !== undefined ? { irrFlow } : {}),
    ...(irrTrace !== undefined ? { irrTrace } : {}),
  }
}
