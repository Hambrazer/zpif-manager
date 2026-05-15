import {
  calcPropertyValue,
  calcNAV,
  calcRSP,
  calcNAVTimeSeries,
} from '../../lib/calculations/nav'
import type {
  MonthlyCashflow,
  MonthlyCashRoll,
  DebtInput,
} from '../../lib/types'

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

function makeCashRoll(year: number, month: number, cashEnd: number): MonthlyCashRoll {
  return {
    period: { year, month },
    cashBegin: 0,
    noiInflow: 0, disposalInflow: 0, emissionInflow: 0,
    acquisitionOutflow: 0, upfrontFeeOutflow: 0,
    managementFeeOutflow: 0, fundExpensesOutflow: 0,
    successFeeOperationalOutflow: 0, successFeeExitOutflow: 0,
    debtServiceOutflow: 0, distributionOutflow: 0,
    redemptionOutflow: 0,
    cashEnd,
  }
}

function makeBulletDebt(
  principalAmount: number,
  interestRate: number,
  startDate: Date,
  endDate: Date
): DebtInput {
  return { id: 'd1', principalAmount, interestRate, startDate, endDate, amortizationType: 'BULLET' }
}

// ─── calcPropertyValue ────────────────────────────────────────────────────────

describe('calcPropertyValue', () => {
  it('NOI=1 200 000, exitCapRate=10% → 12 000 000', () => {
    // Ручной расчёт: 1_200_000 / 0.10 = 12_000_000
    expect(calcPropertyValue({ exitCapRate: 0.10 }, 1_200_000)).toBeCloseTo(12_000_000, 0)
  })

  it('exitCapRate=null → 0', () => {
    expect(calcPropertyValue({ exitCapRate: null }, 1_200_000)).toBe(0)
  })

  it('exitCapRate=0 → 0', () => {
    expect(calcPropertyValue({ exitCapRate: 0 }, 1_200_000)).toBe(0)
  })

  it('NOI=600 000, exitCapRate=8% → 7 500 000', () => {
    // 600_000 / 0.08 = 7_500_000
    expect(calcPropertyValue({ exitCapRate: 0.08 }, 600_000)).toBeCloseTo(7_500_000, 0)
  })

  it('NOI=0 → стоимость=0', () => {
    expect(calcPropertyValue({ exitCapRate: 0.10 }, 0)).toBe(0)
  })
})

// ─── calcNAV ─────────────────────────────────────────────────────────────────

describe('calcNAV', () => {
  it('базовый: cash=500k, objects=[10M, 2M], debt=4M → NAV=8 500 000', () => {
    // Активы = 500_000 + 12_000_000 = 12_500_000
    // NAV = 12_500_000 − 4_000_000 = 8_500_000
    expect(calcNAV(500_000, [10_000_000, 2_000_000], 4_000_000)).toBeCloseTo(8_500_000, 0)
  })

  it('с дополнительными активами и обязательствами', () => {
    // Активы = 500_000 + 12_000_000 + 500_000 = 13_000_000
    // Обязательства = 4_000_000 + 200_000 = 4_200_000
    // NAV = 8_800_000
    expect(
      calcNAV(500_000, [10_000_000, 2_000_000], 4_000_000, 500_000, 200_000)
    ).toBeCloseTo(8_800_000, 0)
  })

  it('пустой список объектов', () => {
    expect(calcNAV(1_000_000, [], 500_000)).toBeCloseTo(500_000, 0)
  })

  it('долг превышает активы → NAV отрицательный', () => {
    expect(calcNAV(100_000, [500_000], 1_000_000)).toBeCloseTo(-400_000, 0)
  })

  it('нет долга → NAV = cash + objects', () => {
    expect(calcNAV(200_000, [800_000], 0)).toBeCloseTo(1_000_000, 0)
  })
})

// ─── calcRSP ─────────────────────────────────────────────────────────────────

describe('calcRSP', () => {
  it('NAV=8 500 000, units=1000 → РСП=8 500', () => {
    // 8_500_000 / 1000 = 8_500
    expect(calcRSP(8_500_000, 1000)).toBeCloseTo(8_500, 2)
  })

  it('totalUnits=0 → 0 (защита от деления на ноль)', () => {
    expect(calcRSP(8_500_000, 0)).toBe(0)
  })

  it('NAV=0 → РСП=0', () => {
    expect(calcRSP(0, 1000)).toBe(0)
  })

  it('NAV отрицательный → РСП отрицательный', () => {
    expect(calcRSP(-1_000_000, 1000)).toBeCloseTo(-1_000, 2)
  })
})

// ─── calcNAVTimeSeries ────────────────────────────────────────────────────────

describe('calcNAVTimeSeries', () => {
  it('пустой кэш-ролл → пустой результат', () => {
    expect(calcNAVTimeSeries([], [], [], 1000)).toHaveLength(0)
  })

  it('один период, один объект, без долга', () => {
    // Объект: NOI=100_000/мес, exitCapRate=10%
    // Кэш-ролл: Jan 2024, cashEnd=500_000
    // Следующие 12 мес (Feb 2024 – Jan 2025): 12 × 100_000 = 1_200_000
    // Стоимость объекта = 1_200_000 / 0.10 = 12_000_000
    // NAV = 500_000 + 12_000_000 − 0 = 12_500_000
    // RSP = 12_500_000 / 1000 = 12_500

    const cashflows = Array.from({ length: 14 }, (_, i) =>
      makeCF(2024, i + 1, 100_000)
    )
    const cashRoll = [makeCashRoll(2024, 1, 500_000)]
    const properties = [{ exitCapRate: 0.10, cashflows }]

    const result = calcNAVTimeSeries(cashRoll, properties, [], 1000)

    expect(result).toHaveLength(1)
    const row = result[0]!
    expect(row.period).toEqual({ year: 2024, month: 1 })
    expect(row.cash).toBeCloseTo(500_000, 0)
    expect(row.propertyValue).toBeCloseTo(12_000_000, 0)
    expect(row.totalAssets).toBeCloseTo(12_500_000, 0)
    expect(row.debtBalance).toBe(0)
    expect(row.nav).toBeCloseTo(12_500_000, 0)
    expect(row.rsp).toBeCloseTo(12_500, 2)
  })

  it('один период, один объект, с долгом BULLET', () => {
    // Долг: 3_000_000, 12% годовых, BULLET, Dec 2023 – Dec 2024
    // В Jan 2024 (первый платёж, не последний) → remainingBalance = 3_000_000
    // NAV = 12_500_000 − 3_000_000 = 9_500_000
    // RSP = 9_500 / 1000 = 9_500

    const cashflows = Array.from({ length: 14 }, (_, i) =>
      makeCF(2024, i + 1, 100_000)
    )
    const cashRoll = [makeCashRoll(2024, 1, 500_000)]
    const properties = [{ exitCapRate: 0.10, cashflows }]
    const debt = makeBulletDebt(
      3_000_000, 0.12,
      new Date(2023, 11, 1),  // Dec 2023
      new Date(2024, 11, 1)   // Dec 2024
    )

    const result = calcNAVTimeSeries(cashRoll, properties, [debt], 1000)
    const row = result[0]!

    expect(row.debtBalance).toBeCloseTo(3_000_000, 0)
    expect(row.nav).toBeCloseTo(9_500_000, 0)
    expect(row.rsp).toBeCloseTo(9_500, 2)
  })

  it('долг гасится: в последнем месяце остаток = 0', () => {
    // Долг BULLET Dec 2023 – Dec 2024, последний платёж = Dec 2024 → remainingBalance = 0

    const cashflows = Array.from({ length: 14 }, (_, i) =>
      makeCF(2024, i + 1, 100_000)
    )
    const cashRoll = [makeCashRoll(2024, 12, 500_000)]
    const properties = [{ exitCapRate: 0.10, cashflows }]
    const debt = makeBulletDebt(
      3_000_000, 0.12,
      new Date(2023, 11, 1),
      new Date(2024, 11, 1)
    )

    const result = calcNAVTimeSeries(cashRoll, properties, [debt], 1000)
    expect(result[0]!.debtBalance).toBeCloseTo(0, 0)
  })

  it('период ДО начала долга → остаток = principalAmount', () => {
    // Долг начинается Feb 2024, проверяем Jan 2024 — до первого платежа
    // pDate (Jan 1, 2024) <= debt.startDate (Feb 1, 2024) → principalAmount

    const cashflows = [makeCF(2024, 1, 0)]
    const cashRoll = [makeCashRoll(2024, 1, 0)]
    const properties = [{ exitCapRate: 0.10, cashflows }]
    const debt = makeBulletDebt(
      5_000_000, 0.12,
      new Date(2024, 1, 1),  // Feb 2024
      new Date(2025, 1, 1)   // Feb 2025
    )

    const result = calcNAVTimeSeries(cashRoll, properties, [debt], 1000)
    expect(result[0]!.debtBalance).toBeCloseTo(5_000_000, 0)
  })

  it('три периода: NAV растёт при накоплении кэша', () => {
    // Объект приносит NOI=100_000/мес, exitCapRate=10%
    // Следующие 12 мес от Jan/Feb/Mar всегда ~1_200_000 (14 месяцев в массиве)
    // propertyValue ~12_000_000 в каждом периоде
    // Кэш растёт: 300_000 / 600_000 / 900_000

    const cashflows = Array.from({ length: 16 }, (_, i) =>
      makeCF(2024, i + 1, 100_000)
    )
    const cashRoll = [
      makeCashRoll(2024, 1, 300_000),
      makeCashRoll(2024, 2, 600_000),
      makeCashRoll(2024, 3, 900_000),
    ]
    const properties = [{ exitCapRate: 0.10, cashflows }]

    const result = calcNAVTimeSeries(cashRoll, properties, [], 1000)

    expect(result).toHaveLength(3)
    expect(result[0]!.nav).toBeLessThan(result[1]!.nav)
    expect(result[1]!.nav).toBeLessThan(result[2]!.nav)
  })

  it('нет следующих 12 мес (конец горизонта) → NOI=0, propertyValue=0', () => {
    // Если период — последний в массиве cashflows, следующих строк нет → NOI_12=0
    const cashflows = [makeCF(2024, 1, 100_000)]  // только 1 период
    const cashRoll = [makeCashRoll(2024, 1, 500_000)]
    const properties = [{ exitCapRate: 0.10, cashflows }]

    const result = calcNAVTimeSeries(cashRoll, properties, [], 1000)
    expect(result[0]!.propertyValue).toBe(0)
    expect(result[0]!.nav).toBeCloseTo(500_000, 0)
  })

  // ─── V4.2.4: стоимость объекта в last месяц фонда из собств. CF ───────────────
  it('стоимость объекта в last месяц фонда считается по 12 forward месяцам собственного CF (за пределами фонда)', () => {
    // Сценарий: фонд закрывается в Dec 2024 (последний месяц).
    // CF объекта тянется до Dec 2026 (24 месяца), NOI=100k/мес, exitCapRate=10%.
    // Стоимость на Dec 2024 = NOI(Jan2025..Dec2025) / 0.10 = 1.2M / 0.10 = 12M.
    // Эти 12 месяцев — за пределами endDate фонда (Dec 2024), но в пределах CF объекта.
    const cashflows = Array.from({ length: 24 }, (_, i) => {
      const totalMonth = i
      return makeCF(
        2024 + Math.floor(totalMonth / 12),
        (totalMonth % 12) + 1,
        100_000,
      )
    })
    const cashRoll = [makeCashRoll(2024, 12, 0)]   // last месяц фонда
    const properties = [{ exitCapRate: 0.10, cashflows }]

    const result = calcNAVTimeSeries(cashRoll, properties, [], 1000)

    expect(result[0]!.period).toEqual({ year: 2024, month: 12 })
    expect(result[0]!.propertyValue).toBeCloseTo(12_000_000, 0)
  })

  it('два объекта — стоимости суммируются', () => {
    // Объект A: NOI=100_000/мес, exitCapRate=10% → 12_000_000
    // Объект B: NOI=50_000/мес,  exitCapRate=8%  → 600_000 / 0.08 = 7_500_000
    // Итого propertyValue = 19_500_000

    const cfA = Array.from({ length: 14 }, (_, i) => makeCF(2024, i + 1, 100_000))
    const cfB = Array.from({ length: 14 }, (_, i) => makeCF(2024, i + 1, 50_000))
    const cashRoll = [makeCashRoll(2024, 1, 0)]
    const properties = [
      { exitCapRate: 0.10, cashflows: cfA },
      { exitCapRate: 0.08, cashflows: cfB },
    ]

    const result = calcNAVTimeSeries(cashRoll, properties, [], 1000)
    expect(result[0]!.propertyValue).toBeCloseTo(19_500_000, 0)
  })
})
