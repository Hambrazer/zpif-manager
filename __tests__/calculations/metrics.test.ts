import {
  calcFundCashflow,
  calcCapRate,
  calcWAULT,
  calcNAV,
  calcNAVPerUnit,
  calcInvestorIRR,
  calcCashOnCash,
  calcCapitalGain,
} from '../../lib/calculations/metrics'
import type { MonthlyCashflow, MonthlyPeriod, LeaseInput, DebtInput } from '../../lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCF(
  year: number, month: number,
  noi: number, fcf: number,
): MonthlyCashflow {
  const opex = noi < 0 ? -noi : 0
  return {
    period: { year, month },
    gri: noi + opex, vacancy: 0, nri: noi + opex,
    opexReimbursementTotal: 0,
    opex, propertyTax: 0, landTax: 0, maintenance: 0,
    capex: 0, noi, fcf,
    tenants: [],
  }
}

function makeLease(
  area: number,
  endDate: Date,
  status: LeaseInput['status'] = 'ACTIVE',
): LeaseInput {
  return {
    id: `l-${Math.random()}`,
    tenantName: 'Арендатор',
    area,
    baseRent: 10_000,
    startDate: new Date('2020-01-01'),
    endDate,
    indexationType: 'NONE',
    indexationRate: null,
    opexReimbursementRate: 0,
    opexReimbursementIndexationType: 'NONE',
    opexReimbursementIndexationRate: null,
    status,
  }
}

const jan2024: MonthlyPeriod = { year: 2024, month: 1 }
const feb2024: MonthlyPeriod = { year: 2024, month: 2 }

// ─── calcFundCashflow ─────────────────────────────────────────────────────────

describe('calcFundCashflow', () => {
  it('пустые периоды → пустой массив', () => {
    expect(calcFundCashflow([], 0, [], [])).toHaveLength(0)
  })

  it('нет объектов, нет долгов, нет расходов → нулевые потоки', () => {
    const result = calcFundCashflow([], 0, [], [jan2024])
    expect(result).toHaveLength(1)
    expect(result[0]!.noi).toBe(0)
    expect(result[0]!.fcf).toBe(0)
  })

  it('один объект, нет расходов фонда → NOI агрегируется, fcf = noi − capex', () => {
    const propCF: MonthlyCashflow[] = [makeCF(2024, 1, 10_000, 10_000)]
    const result = calcFundCashflow([propCF], 0, [], [jan2024])
    expect(result[0]!.noi).toBeCloseTo(10_000, 2)
    expect(result[0]!.fcf).toBeCloseTo(10_000, 2)
  })

  it('два объекта — NOI суммируется', () => {
    const prop1: MonthlyCashflow[] = [makeCF(2024, 1, 10_000, 10_000)]
    const prop2: MonthlyCashflow[] = [makeCF(2024, 1, 6_000, 6_000)]
    const result = calcFundCashflow([prop1, prop2], 0, [], [jan2024])
    expect(result[0]!.noi).toBeCloseTo(16_000, 2)
    expect(result[0]!.fcf).toBeCloseTo(16_000, 2)
  })

  it('расходы фонда 12 000 ₽/год → 1 000 ₽/мес уменьшает fcf', () => {
    const propCF: MonthlyCashflow[] = [makeCF(2024, 1, 10_000, 10_000)]
    const result = calcFundCashflow([propCF], 12_000, [], [jan2024])
    expect(result[0]!.fcf).toBeCloseTo(9_000, 2)
  })

  it('долг фонда (BULLET) → проценты уменьшают fcf', () => {
    const fundDebt: DebtInput = {
      id: 'd1',
      principalAmount: 1_200_000,
      interestRate: 0.12,          // 12% годовых → 1% мес → 12 000/мес
      startDate: new Date('2023-12-01'),
      endDate: new Date('2024-06-01'),
      amortizationType: 'BULLET',
    }
    const propCF: MonthlyCashflow[] = [makeCF(2024, 1, 20_000, 20_000)]
    const result = calcFundCashflow([propCF], 0, [fundDebt], [jan2024])
    // BULLET: проценты = 1 200 000 × 0.12 / 12 = 12 000 → fcf = 20 000 − 12 000
    expect(result[0]!.fcf).toBeCloseTo(8_000, 0)
  })

  it('несколько периодов — результат совпадает по количеству', () => {
    const propCF: MonthlyCashflow[] = [
      makeCF(2024, 1, 5_000, 5_000),
      makeCF(2024, 2, 5_000, 5_000),
    ]
    const result = calcFundCashflow([propCF], 0, [], [jan2024, feb2024])
    expect(result).toHaveLength(2)
    expect(result[0]!.period).toEqual(jan2024)
    expect(result[1]!.period).toEqual(feb2024)
  })

  it('GRI, vacancy, NRI, opex, capex агрегируются из двух объектов', () => {
    const cf1: MonthlyCashflow = {
      period: jan2024, gri: 100, vacancy: 10, nri: 90,
      opexReimbursementTotal: 0, opex: 20, propertyTax: 0, landTax: 0, maintenance: 0,
      capex: 5, noi: 65, fcf: 65, tenants: [],
    }
    const cf2: MonthlyCashflow = {
      period: jan2024, gri: 200, vacancy: 0, nri: 200,
      opexReimbursementTotal: 0, opex: 30, propertyTax: 0, landTax: 0, maintenance: 0,
      capex: 0, noi: 170, fcf: 170, tenants: [],
    }
    const result = calcFundCashflow([[cf1], [cf2]], 0, [], [jan2024])
    expect(result[0]!.gri).toBeCloseTo(300, 2)
    expect(result[0]!.vacancy).toBeCloseTo(10, 2)
    expect(result[0]!.nri).toBeCloseTo(290, 2)
    expect(result[0]!.opex).toBeCloseTo(50, 2)
    expect(result[0]!.capex).toBeCloseTo(5, 2)
    expect(result[0]!.noi).toBeCloseTo(235, 2)
  })
})

// ─── calcCapRate ──────────────────────────────────────────────────────────────

describe('calcCapRate', () => {
  it('NOI=1 200 000, стоимость=10 000 000 → Cap Rate=12%', () => {
    expect(calcCapRate(1_200_000, 10_000_000)).toBeCloseTo(0.12, 6)
  })

  it('totalPropertyValue=0 → 0 (защита от деления на ноль)', () => {
    expect(calcCapRate(1_000_000, 0)).toBe(0)
  })

  it('NOI=0 → Cap Rate=0', () => {
    expect(calcCapRate(0, 10_000_000)).toBeCloseTo(0, 6)
  })
})

// ─── calcWAULT ────────────────────────────────────────────────────────────────

describe('calcWAULT', () => {
  const ref = new Date('2024-01-01')

  it('нет активных договоров → 0', () => {
    expect(calcWAULT([], ref)).toBe(0)
  })

  it('только неактивные договоры → 0', () => {
    const leases = [
      makeLease(100, new Date('2026-01-01'), 'EXPIRED'),
      makeLease(200, new Date('2025-06-01'), 'TERMINATING'),
    ]
    expect(calcWAULT(leases, ref)).toBe(0)
  })

  it('один договор, истекает ровно через 1 год → WAULT ≈ 1.0', () => {
    // endDate = ref + 365.25 дней (один год по MS_PER_YEAR)
    const endDate = new Date(ref.getTime() + 365.25 * 24 * 60 * 60 * 1000)
    const leases = [makeLease(100, endDate)]
    expect(calcWAULT(leases, ref)).toBeCloseTo(1.0, 4)
  })

  it('два равных договора: 1 год и 3 года → WAULT=2 года', () => {
    const end1 = new Date(ref.getTime() + 1 * 365.25 * 24 * 60 * 60 * 1000)
    const end3 = new Date(ref.getTime() + 3 * 365.25 * 24 * 60 * 60 * 1000)
    const leases = [makeLease(100, end1), makeLease(100, end3)]
    expect(calcWAULT(leases, ref)).toBeCloseTo(2.0, 4)
  })

  it('взвешивание по площади: 200 м² × 1 год + 100 м² × 3 года → WAULT ≈ 1.667', () => {
    const end1 = new Date(ref.getTime() + 1 * 365.25 * 24 * 60 * 60 * 1000)
    const end3 = new Date(ref.getTime() + 3 * 365.25 * 24 * 60 * 60 * 1000)
    // (200×1 + 100×3) / (200+100) = 500/300 = 1.667
    const leases = [makeLease(200, end1), makeLease(100, end3)]
    expect(calcWAULT(leases, ref)).toBeCloseTo(5 / 3, 4)
  })

  it('договор уже истёк → вносит 0 лет', () => {
    const expired = new Date('2023-01-01')   // до ref
    const future  = new Date(ref.getTime() + 2 * 365.25 * 24 * 60 * 60 * 1000)
    // area=100 каждый; (100×0 + 100×2) / 200 = 1.0
    const leases = [
      makeLease(100, expired, 'ACTIVE'),   // status=ACTIVE но дата прошла
      makeLease(100, future),
    ]
    expect(calcWAULT(leases, ref)).toBeCloseTo(1.0, 4)
  })

  it('EXPIRED и ACTIVE с одной площадью: только ACTIVE учитывается', () => {
    const future = new Date(ref.getTime() + 2 * 365.25 * 24 * 60 * 60 * 1000)
    const leases = [
      makeLease(100, future, 'EXPIRED'),
      makeLease(100, future, 'ACTIVE'),
    ]
    // только второй договор → WAULT = 2
    expect(calcWAULT(leases, ref)).toBeCloseTo(2.0, 4)
  })
})

// ─── calcNAV ─────────────────────────────────────────────────────────────────

describe('calcNAV', () => {
  it('активы − обязательства', () => {
    // 10M NPV + 1M cash − 3M долг = 8M
    expect(calcNAV(10_000_000, 1_000_000, 3_000_000)).toBeCloseTo(8_000_000, 0)
  })

  it('cash=0, liabilities=0 → NAV = propertyValue', () => {
    expect(calcNAV(5_000_000, 0, 0)).toBeCloseTo(5_000_000, 0)
  })

  it('долги превышают активы → отрицательный NAV', () => {
    expect(calcNAV(1_000_000, 0, 5_000_000)).toBeCloseTo(-4_000_000, 0)
  })
})

// ─── calcNAVPerUnit ───────────────────────────────────────────────────────────

describe('calcNAVPerUnit', () => {
  it('NAV=10 000 000, паёв=1000 → 10 000 ₽/пай', () => {
    expect(calcNAVPerUnit(10_000_000, 1_000)).toBeCloseTo(10_000, 2)
  })

  it('totalUnits=0 → 0 (защита от деления на ноль)', () => {
    expect(calcNAVPerUnit(10_000_000, 0)).toBe(0)
  })

  it('отрицательный NAV → отрицательная стоимость пая', () => {
    expect(calcNAVPerUnit(-1_000_000, 1_000)).toBeCloseTo(-1_000, 2)
  })
})

// ─── calcInvestorIRR ──────────────────────────────────────────────────────────

describe('calcInvestorIRR', () => {
  it('без надбавки, 12 нулевых выплат + finalNAV=110% → IRR≈10% годовых', () => {
    // flows: [-100_000, 0×11, 110_000]
    // (1+r)^12 = 1.1 → IRR = 10%
    const distributions = Array<number>(12).fill(0)
    const irr = calcInvestorIRR(100_000, 0, distributions, 110_000)
    expect(irr).toBeCloseTo(0.10, 3)
  })

  it('надбавка 5% снижает IRR по сравнению с нулевой надбавкой', () => {
    const distributions = Array<number>(12).fill(0)
    const irrNoFee = calcInvestorIRR(100_000, 0,    distributions, 110_000)
    const irrFee   = calcInvestorIRR(100_000, 0.05, distributions, 110_000)
    expect(irrFee).toBeLessThan(irrNoFee)
  })

  it('нулевой finalNAV и нулевые выплаты → IRR=0 (нет смены знака)', () => {
    // нет положительных потоков → calcIRR вернёт NaN → 0
    const irr = calcInvestorIRR(100_000, 0, [0, 0], 0)
    expect(irr).toBe(0)
  })

  it('ежемесячные выплаты покрывают вложение полностью за 12 мес → IRR > 0', () => {
    // инвестор вложил 120_000, получает 10_000/мес × 12 = 120_000 → IRR > 0 (деньги вернулись без дисконта)
    const distributions = Array<number>(12).fill(10_000)
    const irr = calcInvestorIRR(120_000, 0, distributions, 0)
    expect(irr).toBeGreaterThanOrEqual(0)
  })

  it('upfrontFeeRate=0 и upfrontFeeRate=1 обрабатываются без ошибок', () => {
    const d = Array<number>(1).fill(0)
    expect(() => calcInvestorIRR(100_000, 0,   d, 100_000)).not.toThrow()
    expect(() => calcInvestorIRR(100_000, 1.0, d, 100_000)).not.toThrow()
  })
})

// ─── calcCashOnCash ───────────────────────────────────────────────────────────

describe('calcCashOnCash', () => {
  it('стандартный расчёт: выплаты по годам / капитал', () => {
    // [100k, 200k, 150k] / 1M = [0.10, 0.20, 0.15]
    const result = calcCashOnCash([100_000, 200_000, 150_000], 1_000_000)
    expect(result).toHaveLength(3)
    expect(result[0]).toBeCloseTo(0.10, 6)
    expect(result[1]).toBeCloseTo(0.20, 6)
    expect(result[2]).toBeCloseTo(0.15, 6)
  })

  it('attractedCapital=0 → все нули (защита от деления на ноль)', () => {
    const result = calcCashOnCash([100_000, 200_000], 0)
    expect(result).toEqual([0, 0])
  })

  it('пустой массив выплат → пустой результат', () => {
    expect(calcCashOnCash([], 1_000_000)).toHaveLength(0)
  })

  it('нулевые выплаты → нулевой Cash-on-Cash', () => {
    const result = calcCashOnCash([0, 0, 0], 1_000_000)
    expect(result).toEqual([0, 0, 0])
  })
})

// ─── calcCapitalGain ──────────────────────────────────────────────────────────

describe('calcCapitalGain', () => {
  it('стоимость растёт: [1.1M, 1.2M], entry=1M, capital=1M → [0.10, 0.20]', () => {
    const result = calcCapitalGain([1_100_000, 1_200_000], 1_000_000, 1_000_000)
    expect(result[0]).toBeCloseTo(0.10, 6)
    expect(result[1]).toBeCloseTo(0.20, 6)
  })

  it('стоимость снизилась → отрицательный прирост', () => {
    // entry=1M, EOY=800k, capital=1M → gain = -0.20
    const result = calcCapitalGain([800_000], 1_000_000, 1_000_000)
    expect(result[0]).toBeCloseTo(-0.20, 6)
  })

  it('стоимость равна стоимости входа → 0', () => {
    const result = calcCapitalGain([1_000_000, 1_000_000], 1_000_000, 1_000_000)
    expect(result).toEqual([0, 0])
  })

  it('attractedCapital=0 → все нули (защита от деления на ноль)', () => {
    const result = calcCapitalGain([1_500_000], 1_000_000, 0)
    expect(result).toEqual([0])
  })

  it('пустой массив → пустой результат', () => {
    expect(calcCapitalGain([], 1_000_000, 1_000_000)).toHaveLength(0)
  })
})
