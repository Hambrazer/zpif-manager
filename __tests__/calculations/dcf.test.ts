import { calcNPV, calcIRR, calcTerminalValue, calcDCF } from '../../lib/calculations/dcf'
import type { MonthlyCashflow } from '../../lib/types'

function makeCF(year: number, month: number, noi: number, fcf: number): MonthlyCashflow {
  return {
    period: { year, month },
    gri: 0, vacancy: 0, nri: 0,
    opexReimbursementTotal: 0,
    opex: 0, propertyTax: 0, landTax: 0, maintenance: 0,
    capex: 0, noi, fcf,
    tenants: [],
  }
}

// ─── calcIRR ──────────────────────────────────────────────────────────────────

describe('calcIRR', () => {
  it('эталон: [-1000, 300, 300, 400, 500] → IRR ≈ 16.636%', () => {
    // Реальный IRR = 16.636%, не 14.3% как в ARCHITECTURE.md — проверено Node.js
    const irr = calcIRR([-1000, 300, 300, 400, 500])
    expect(irr).toBeCloseTo(0.16636, 4)
  })

  it('простой случай: [-100, 110] → IRR = 10%', () => {
    expect(calcIRR([-100, 110])).toBeCloseTo(0.1, 6)
  })

  it('при найденном IRR — NPV потока ≈ 0', () => {
    const flows = [-1000, 300, 300, 400, 500]
    const irr = calcIRR(flows)
    expect(calcNPV(flows, irr)).toBeCloseTo(0, 4)
  })

  it('нет смены знака (все отрицательные) → NaN', () => {
    expect(calcIRR([-1000, -300, -200])).toBeNaN()
  })

  it('нет смены знака (все положительные) → NaN', () => {
    expect(calcIRR([1000, 300, 200])).toBeNaN()
  })
})

// ─── calcNPV ─────────────────────────────────────────────────────────────────

describe('calcNPV', () => {
  it('r=0 → сумма всех потоков', () => {
    expect(calcNPV([-1000, 300, 300, 400, 500], 0)).toBeCloseTo(500, 6)
  })

  it('Excel-пример: [-1000, 300, 300, 400, 500] при r=10% → 162.69', () => {
    // -1000 + 300/1.1 + 300/1.21 + 400/1.331 + 500/1.4641 = 162.6938
    expect(calcNPV([-1000, 300, 300, 400, 500], 0.1)).toBeCloseTo(162.69, 1)
  })

  it('при IRR-ставке NPV ≈ 0', () => {
    const flows = [-1000, 300, 300, 400, 500]
    expect(calcNPV(flows, calcIRR(flows))).toBeCloseTo(0, 4)
  })

  it('один поток при r=0 → тот же поток', () => {
    expect(calcNPV([1234], 0)).toBeCloseTo(1234, 6)
  })

  it('дисконтирование: [0, 1000] при r=10% → 909.09', () => {
    expect(calcNPV([0, 1000], 0.1)).toBeCloseTo(909.09, 1)
  })
})

// ─── calcTerminalValue ────────────────────────────────────────────────────────

describe('calcTerminalValue', () => {
  it('lastNOI=10 000, exitCapRate=10% → TV=100 000', () => {
    expect(calcTerminalValue(10_000, 0.1)).toBeCloseTo(100_000, 0)
  })

  it('exitCapRate=0 → TV=0', () => {
    expect(calcTerminalValue(10_000, 0)).toBe(0)
  })

  it('exitCapRate=null → TV=0', () => {
    expect(calcTerminalValue(10_000, null)).toBe(0)
  })

  it('lastNOI=0 → TV=0', () => {
    expect(calcTerminalValue(0, 0.1)).toBe(0)
  })
})

// ─── calcDCF ─────────────────────────────────────────────────────────────────

describe('calcDCF', () => {
  it('пустой массив → нулевой результат', () => {
    const result = calcDCF([], 0.12, null)
    expect(result.npv).toBe(0)
    expect(result.irr).toBe(0)
    expect(result.terminalValue).toBe(0)
    expect(result.cashflows).toHaveLength(0)
  })

  it('discountRate сохраняется в результате', () => {
    expect(calcDCF([], 0.15, null).discountRate).toBe(0.15)
  })

  it('без acquisitionPrice — irr=0 независимо от потоков', () => {
    const flows = [makeCF(2024, 1, 10_000, 8_000)]
    expect(calcDCF(flows, 0.12, null).irr).toBe(0)
  })

  it('один период FCF=12 000, r=12%/год, TV=0 → NPV=12000/1.01', () => {
    const result = calcDCF([makeCF(2024, 1, 0, 12_000)], 0.12, 0)
    expect(result.npv).toBeCloseTo(12_000 / 1.01, 2)
    expect(result.terminalValue).toBe(0)
  })

  it('два периода NOI=6000, exitCapRate=10% → TV=lastNOI_annual/0.1', () => {
    // lastYearFlows = оба периода, lastNOI = 12 000, TV = 12 000/0.10 = 120 000
    const flows = [makeCF(2024, 1, 6_000, 6_000), makeCF(2024, 2, 6_000, 6_000)]
    const result = calcDCF(flows, 0.12, 0.1)
    expect(result.terminalValue).toBeCloseTo(120_000, 0)
  })

  it('с acquisitionPrice: IRR > 0 при положительных FCF', () => {
    const flows = Array.from({ length: 12 }, (_, i) => makeCF(2024, i + 1, 10_000, 10_000))
    const result = calcDCF(flows, 0.12, 0, 100_000)
    expect(result.irr).toBeGreaterThan(0)
  })

  it('аннуализированный IRR корректно считается из месячного', () => {
    // 12 месяцев по 10 000 FCF, acquisitionPrice=100 000, TV=0
    const flows = Array.from({ length: 12 }, (_, i) => makeCF(2024, i + 1, 0, 5_000))
    const result = calcDCF(flows, 0.12, 0, 50_000)
    // annual IRR = (1 + monthly)^12 - 1; monthly > 0 → annual > monthly
    const monthlyFlows = [-50_000, ...flows.map(cf => cf.fcf)]
    const { calcIRR: _calcIRR } = require('../../lib/calculations/dcf')
    const irrMonthly = calcIRR(monthlyFlows)
    const irrAnnual = Math.pow(1 + irrMonthly, 12) - 1
    expect(result.irr).toBeCloseTo(irrAnnual, 6)
  })
})
