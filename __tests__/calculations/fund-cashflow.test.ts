import {
  calcUpfrontFee,
  calcManagementFee,
  calcFundExpenses,
  calcSuccessFeeOperational,
  calcSuccessFeeExit,
  calcDistributions,
  calcFundCashRoll,
  type PropertyCFInput,
} from '../../lib/calculations/fund-cashflow'
import type { FundInput, MonthlyCashflow } from '../../lib/types'

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function makeCF(year: number, month: number, noi: number): MonthlyCashflow {
  return {
    period: { year, month },
    totalIncome: 0,
    opexReimbursementTotal: 0,
    opex: 0, propertyTax: 0, landTax: 0, maintenance: 0,
    capex: 0, noi, fcf: noi,
    tenants: [],
  }
}

function makeMinimalFund(overrides: Partial<FundInput> = {}): FundInput {
  return {
    id: 'f1',
    startDate: new Date(2024, 0, 1),  // Jan 2024
    endDate: new Date(2024, 2, 31),   // Mar 2024
    totalEmission: 10_000_000,
    nominalUnitPrice: 1_000,
    totalUnits: 10_000,
    managementFeeRate: 0,
    fundExpensesRate: 0,
    upfrontFeeRate: 0,
    successFeeOperational: 0,
    successFeeExit: 0,
    distributionPeriodicity: 'MONTHLY',
    properties: [],
    fundDebts: [],
    ...overrides,
  }
}

function makePropCF(overrides: Partial<PropertyCFInput> = {}): PropertyCFInput {
  return {
    acquisitionPrice: null,
    purchaseDate: null,
    saleDate: null,
    exitCapRate: null,
    cashflows: [],
    ...overrides,
  }
}

// ─── calcUpfrontFee ───────────────────────────────────────────────────────────

describe('calcUpfrontFee', () => {
  it('обычный случай: emission=1 000 000, rate=3% → ~30 928', () => {
    // 0.03 × 1_000_000 / 0.97 = 30_927.83...
    expect(calcUpfrontFee(1_000_000, 0.03)).toBeCloseTo(30_928, 0)
  })

  it('rate=0 → 0', () => {
    expect(calcUpfrontFee(1_000_000, 0)).toBe(0)
  })

  it('rate >= 1 → 0 (защита)', () => {
    expect(calcUpfrontFee(1_000_000, 1)).toBe(0)
    expect(calcUpfrontFee(1_000_000, 1.5)).toBe(0)
  })

  it('emission=10 000 000, rate=2% → 204 082', () => {
    // 0.02 × 10_000_000 / 0.98 = 204_081.63...
    expect(calcUpfrontFee(10_000_000, 0.02)).toBeCloseTo(204_082, 0)
  })
})

// ─── calcManagementFee ────────────────────────────────────────────────────────

describe('calcManagementFee', () => {
  it('nav=12 000 000, rate=1%/год → 10 000/мес', () => {
    // 12_000_000 × 0.01 / 12 = 10_000
    expect(calcManagementFee(12_000_000, 0.01)).toBeCloseTo(10_000, 2)
  })

  it('nav=0 → 0', () => {
    expect(calcManagementFee(0, 0.01)).toBe(0)
  })

  it('rate=0 → 0', () => {
    expect(calcManagementFee(12_000_000, 0)).toBe(0)
  })
})

// ─── calcFundExpenses ─────────────────────────────────────────────────────────

describe('calcFundExpenses', () => {
  it('nav=12 000 000, rate=0.5%/год → 5 000/мес', () => {
    // 12_000_000 × 0.005 / 12 = 5_000
    expect(calcFundExpenses(12_000_000, 0.005)).toBeCloseTo(5_000, 2)
  })

  it('nav=0 → 0', () => {
    expect(calcFundExpenses(0, 0.005)).toBe(0)
  })
})

// ─── calcSuccessFeeOperational ────────────────────────────────────────────────

describe('calcSuccessFeeOperational', () => {
  it('distributions=1 000 000, rate=5% → 50 000', () => {
    expect(calcSuccessFeeOperational(1_000_000, 0.05)).toBeCloseTo(50_000, 2)
  })

  it('distributions=0 → 0', () => {
    expect(calcSuccessFeeOperational(0, 0.05)).toBe(0)
  })

  it('rate=0 → 0', () => {
    expect(calcSuccessFeeOperational(1_000_000, 0)).toBe(0)
  })
})

// ─── calcSuccessFeeExit ───────────────────────────────────────────────────────

describe('calcSuccessFeeExit', () => {
  it('navEnd=15M, navStart=10M, rate=20% → 1 000 000', () => {
    // (15M − 10M) × 0.20 = 1_000_000
    expect(calcSuccessFeeExit(15_000_000, 10_000_000, 0.20)).toBeCloseTo(1_000_000, 0)
  })

  it('navEnd < navStart → 0 (СЧА не выросла)', () => {
    expect(calcSuccessFeeExit(8_000_000, 10_000_000, 0.20)).toBe(0)
  })

  it('navEnd = navStart → 0', () => {
    expect(calcSuccessFeeExit(10_000_000, 10_000_000, 0.20)).toBe(0)
  })

  it('rate=0 → 0', () => {
    expect(calcSuccessFeeExit(15_000_000, 10_000_000, 0)).toBe(0)
  })
})

// ─── calcDistributions ────────────────────────────────────────────────────────

describe('calcDistributions', () => {
  describe('MONTHLY', () => {
    it('любой месяц → возвращает FCF', () => {
      expect(calcDistributions(100_000, 'MONTHLY', { year: 2024, month: 5 })).toBe(100_000)
      expect(calcDistributions(100_000, 'MONTHLY', { year: 2024, month: 1 })).toBe(100_000)
    })
  })

  describe('QUARTERLY', () => {
    it('конец квартала (3, 6, 9, 12) → возвращает FCF', () => {
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 3 })).toBe(100_000)
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 6 })).toBe(100_000)
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 9 })).toBe(100_000)
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 12 })).toBe(100_000)
    })

    it('не конец квартала (1, 2, 4, 5, …) → 0', () => {
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 1 })).toBe(0)
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 5 })).toBe(0)
      expect(calcDistributions(100_000, 'QUARTERLY', { year: 2024, month: 11 })).toBe(0)
    })
  })

  describe('ANNUAL', () => {
    it('декабрь → возвращает FCF', () => {
      expect(calcDistributions(100_000, 'ANNUAL', { year: 2024, month: 12 })).toBe(100_000)
    })

    it('не декабрь → 0', () => {
      expect(calcDistributions(100_000, 'ANNUAL', { year: 2024, month: 6 })).toBe(0)
      expect(calcDistributions(100_000, 'ANNUAL', { year: 2024, month: 1 })).toBe(0)
    })
  })

  it('отрицательный FCF → 0 для всех типов', () => {
    expect(calcDistributions(-50_000, 'MONTHLY', { year: 2024, month: 3 })).toBe(0)
    expect(calcDistributions(-50_000, 'QUARTERLY', { year: 2024, month: 3 })).toBe(0)
    expect(calcDistributions(-50_000, 'ANNUAL', { year: 2024, month: 12 })).toBe(0)
  })
})

// ─── calcFundCashRoll ─────────────────────────────────────────────────────────

describe('calcFundCashRoll', () => {
  it('пустой период (start > end) → пустой результат', () => {
    const fund = makeMinimalFund({
      startDate: new Date(2024, 2, 1),
      endDate: new Date(2024, 0, 1),
    })
    expect(calcFundCashRoll(fund, [], [])).toHaveLength(0)
  })

  it('один месяц: emission + NOI, нулевые комиссии, MONTHLY → правильный cashEnd', () => {
    // Fund Jan 2024 – Jan 2024 (1 период)
    // totalEmission=10M, NOI=100k, distributions=MONTHLY (100k)
    // cashEnd = 0 + 10M + 100k - 100k = 10M

    const fund = makeMinimalFund({
      startDate: new Date(2024, 0, 1),
      endDate: new Date(2024, 0, 31),
    })
    const cashflows = Array.from({ length: 14 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({ cashflows })

    const result = calcFundCashRoll(fund, [prop], [])

    expect(result).toHaveLength(1)
    const row = result[0]!
    expect(row.emissionInflow).toBe(10_000_000)
    expect(row.noiInflow).toBeCloseTo(100_000, 0)
    expect(row.distributionOutflow).toBeCloseTo(100_000, 0)
    expect(row.cashEnd).toBeCloseTo(10_000_000, 0)
    expect(row.cashBegin).toBe(0)
  })

  it('три месяца: кэш стабилен при ежемесячном распределении NOI', () => {
    // Emission 10M в Jan, NOI=100k/мес, MONTHLY distributions → cashEnd всегда 10M

    const fund = makeMinimalFund()
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({ cashflows })

    const result = calcFundCashRoll(fund, [prop], [])

    expect(result).toHaveLength(3)
    // Первый период: emission - distribution = 10M
    expect(result[0]!.cashEnd).toBeCloseTo(10_000_000, 0)
    // Второй и третий: cashBegin=10M, NOI distributed → cashEnd остаётся 10M
    expect(result[1]!.cashEnd).toBeCloseTo(10_000_000, 0)
    expect(result[2]!.cashEnd).toBeCloseTo(10_000_000, 0)
  })

  it('QUARTERLY: NOI накапливается 2 месяца, выплачивается в 3-м', () => {
    // Fund Jan–Mar 2024, QUARTERLY, NOI=100k/мес, нулевые комиссии
    // Jan: fcf=100k, не квартальный → distribution=0, cashEnd=10.1M
    // Feb: fcf=100k, не квартальный → distribution=0, cashEnd=10.2M
    // Mar: fcf=100k, квартальный (m%3=0) → distribution=100k, cashEnd=10.2M

    const fund = makeMinimalFund({ distributionPeriodicity: 'QUARTERLY' })
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({ cashflows })

    const result = calcFundCashRoll(fund, [prop], [])

    expect(result[0]!.distributionOutflow).toBe(0)  // Jan — не квартальный
    expect(result[1]!.distributionOutflow).toBe(0)  // Feb — не квартальный
    expect(result[2]!.distributionOutflow).toBeCloseTo(100_000, 0)  // Mar — распределение
    // Кэш копится первые 2 месяца
    expect(result[1]!.cashEnd).toBeCloseTo(result[0]!.cashEnd + 100_000, 0)
  })

  it('upfront fee вычитается в первом периоде', () => {
    // upfrontFeeRate=2%, totalEmission=10M
    // upfrontFee = 0.02 × 10M / 0.98 = 204_082
    // cashEnd ≈ 10M - 204_082 + NOI - distribution

    const fund = makeMinimalFund({ upfrontFeeRate: 0.02 })
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({ cashflows })

    const result = calcFundCashRoll(fund, [prop], [])

    const expectedFee = (0.02 * 10_000_000) / 0.98
    expect(result[0]!.upfrontFeeOutflow).toBeCloseTo(expectedFee, 0)
    expect(result[1]!.upfrontFeeOutflow).toBe(0)
    expect(result[2]!.upfrontFeeOutflow).toBe(0)
  })

  it('объект с purchaseDate: NOI не включается до покупки', () => {
    // Fund Jan–Mar 2024, объект куплен в Feb 2024
    // Jan: noiInflow=0; Feb+Mar: noiInflow=100k

    const fund = makeMinimalFund()
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({
      cashflows,
      purchaseDate: new Date(2024, 1, 1),  // Feb 2024
      acquisitionPrice: 5_000_000,
    })

    const result = calcFundCashRoll(fund, [prop], [])

    expect(result[0]!.noiInflow).toBe(0)            // Jan — до покупки
    expect(result[0]!.acquisitionOutflow).toBe(0)
    expect(result[1]!.noiInflow).toBeCloseTo(100_000, 0)   // Feb — куплен
    expect(result[1]!.acquisitionOutflow).toBeCloseTo(5_000_000, 0)
    expect(result[2]!.noiInflow).toBeCloseTo(100_000, 0)   // Mar — активен
  })

  it('объект с saleDate: disposalInflow в месяц продажи', () => {
    // Fund Jan–Mar 2024, объект продаётся в Feb 2024
    // exitCapRate=10%, NOI следующих 12 мес после Feb = 12 × 100k = 1.2M → proceeds=12M

    const fund = makeMinimalFund()
    // Нужно 14 месяцев после Feb (Feb + 12) = месяц 3..14
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({
      cashflows,
      saleDate: new Date(2024, 1, 1),  // Feb 2024
      exitCapRate: 0.10,
    })

    const result = calcFundCashRoll(fund, [prop], [])

    // Feb: disposalInflow ≈ 1_200_000 / 0.10 = 12M
    expect(result[1]!.disposalInflow).toBeCloseTo(12_000_000, 0)
    // Mar: объект продан — нет NOI, нет disposalInflow
    expect(result[2]!.noiInflow).toBe(0)
    expect(result[2]!.disposalInflow).toBe(0)
  })

  it('management fee считается от navBegin (cashBegin + стоимость объектов)', () => {
    // Fund Jan–Mar 2024, managementFeeRate=0.12/год, ANNUAL (без выплат)
    // Объект: NOI=100k/мес, exitCapRate=10%
    // propValue(Jan) = NOI_12мес(Feb-Jan+1) / 0.10 = 1_200_000 / 0.10 = 12_000_000
    // navBegin(Jan) = cashBegin=0 + 12M − 0 = 12M
    // managementFee(Jan) = 12M × 0.12 / 12 = 120_000
    // navBegin(Feb) = cashEnd(Jan) + propVal(Feb) ≈ (10M + 100k − 120k) + 12M ≈ 21.98M
    // Проверяем что fee в первом периоде вычислен от стоимости объекта

    const fund = makeMinimalFund({ managementFeeRate: 0.12, distributionPeriodicity: 'ANNUAL' })
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({ cashflows, exitCapRate: 0.10 })

    const result = calcFundCashRoll(fund, [prop], [])

    // navBegin(Jan) = 0 + 1_200_000/0.10 = 12M → fee = 12M × 0.12 / 12 = 120_000
    expect(result[0]!.managementFeeOutflow).toBeCloseTo(120_000, 0)
    // В последующих периодах: cashBegin > 0 → navBegin > 12M → fee > 120k
    expect(result[1]!.managementFeeOutflow).toBeGreaterThan(120_000)
  })

  it('success fee operational = rate × distribution', () => {
    // successFeeOperational=5%, NOI=1M/мес, MONTHLY
    // distribution=1M → successFeeOp=50k

    const fund = makeMinimalFund({
      totalEmission: 100_000_000,
      successFeeOperational: 0.05,
    })
    const cashflows = Array.from({ length: 6 }, (_, i) => makeCF(2024, i + 1, 1_000_000))
    const prop = makePropCF({ cashflows })

    const result = calcFundCashRoll(fund, [prop], [])

    // Первый период: NOI=1M, distribution=1M, successFeeOp=5%*1M=50k
    expect(result[0]!.successFeeOperationalOutflow).toBeCloseTo(50_000, 0)
  })

  it('нет объектов: только emission и нулевые потоки', () => {
    const fund = makeMinimalFund()
    const result = calcFundCashRoll(fund, [], [])

    expect(result).toHaveLength(3)
    expect(result[0]!.emissionInflow).toBe(10_000_000)
    expect(result[0]!.noiInflow).toBe(0)
    expect(result[0]!.cashEnd).toBeCloseTo(10_000_000, 0)
    // Кэш не меняется без NOI
    expect(result[1]!.cashEnd).toBeCloseTo(10_000_000, 0)
    expect(result[2]!.cashEnd).toBeCloseTo(10_000_000, 0)
  })

  it('cashBegin каждого периода = cashEnd предыдущего', () => {
    const fund = makeMinimalFund()
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({ cashflows })
    const result = calcFundCashRoll(fund, [prop], [])

    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.cashBegin).toBeCloseTo(result[i - 1]!.cashEnd, 2)
    }
  })

  // ─── V3.8.5: масштабирование на ownershipPct ────────────────────────────────
  it('ownershipPct=50: NOI, покупка, продажа масштабируются на 0.5', () => {
    // Fund Jan–Mar 2024, объект куплен в Feb за 5M, продан в Mar.
    // NOI=100k/мес, exitCapRate=10%, ownershipPct=50%.
    // Ожидается: NOI(Feb)=50k, NOI(Mar)=50k, acquisition(Feb)=2.5M,
    //            disposal(Mar) = (NOI_12мес_после_Mar × 0.5) / 0.1
    //              = (12 × 100k × 0.5) / 0.1 = 600k / 0.1 = 6M
    const fund = makeMinimalFund()
    const cashflows = Array.from({ length: 18 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const prop = makePropCF({
      cashflows,
      purchaseDate: new Date(2024, 1, 1),
      saleDate: new Date(2024, 2, 1),
      acquisitionPrice: 5_000_000,
      exitCapRate: 0.10,
      ownershipPct: 50,
    })

    const result = calcFundCashRoll(fund, [prop], [])

    expect(result[0]!.noiInflow).toBe(0)                            // Jan — до покупки
    expect(result[1]!.noiInflow).toBeCloseTo(50_000, 0)              // Feb — 100k × 0.5
    expect(result[1]!.acquisitionOutflow).toBeCloseTo(2_500_000, 0)  // Feb — 5M × 0.5
    expect(result[2]!.noiInflow).toBeCloseTo(50_000, 0)              // Mar — 100k × 0.5
    expect(result[2]!.disposalInflow).toBeCloseTo(6_000_000, 0)      // Mar — 12M × 0.5
  })

  it('ownershipPct по умолчанию 100% — поведение не меняется', () => {
    // Без явного ownershipPct результат должен совпадать с явным 100%.
    const fund = makeMinimalFund()
    const cashflows = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const propA = makePropCF({ cashflows, exitCapRate: 0.10 })
    const propB = makePropCF({ cashflows, exitCapRate: 0.10, ownershipPct: 100 })

    const rA = calcFundCashRoll(fund, [propA], [])
    const rB = calcFundCashRoll(fund, [propB], [])

    for (let i = 0; i < rA.length; i++) {
      expect(rB[i]!.noiInflow).toBeCloseTo(rA[i]!.noiInflow, 2)
      expect(rB[i]!.cashEnd).toBeCloseTo(rA[i]!.cashEnd, 2)
    }
  })

  it('два объекта с разными долями: вклады складываются', () => {
    // Объект A: NOI=100k/мес, ownership=100% → вклад 100k
    // Объект B: NOI=200k/мес, ownership=25%  → вклад 50k
    // Суммарный NOI фонда = 150k/мес
    const fund = makeMinimalFund()
    const cashflowsA = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const cashflowsB = Array.from({ length: 16 }, (_, i) => makeCF(2024, i + 1, 200_000))
    const propA = makePropCF({ cashflows: cashflowsA })
    const propB = makePropCF({ cashflows: cashflowsB, ownershipPct: 25 })

    const result = calcFundCashRoll(fund, [propA, propB], [])

    expect(result[0]!.noiInflow).toBeCloseTo(150_000, 0)
  })
})
