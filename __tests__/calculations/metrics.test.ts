import {
  calcFundCashflow,
  calcCapRate,
  calcWAULT,
  calcNAV,
  calcNAVPerUnit,
  calcInvestorIRR,
  calcCashOnCash,
  calcCapitalGain,
  getReferencePoint,
} from '../../lib/calculations/metrics'
import type {
  MonthlyCashflow, MonthlyCashRoll, MonthlyPeriod, LeaseInput, DebtInput,
} from '../../lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCF(
  year: number, month: number,
  noi: number, fcf: number,
): MonthlyCashflow {
  const opex = noi < 0 ? -noi : 0
  return {
    period: { year, month },
    totalIncome: noi + opex,
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

  it('totalIncome, opex, capex агрегируются из двух объектов', () => {
    const cf1: MonthlyCashflow = {
      period: jan2024, totalIncome: 90,
      opexReimbursementTotal: 0, opex: 20, propertyTax: 0, landTax: 0, maintenance: 0,
      capex: 5, noi: 65, fcf: 65, tenants: [],
    }
    const cf2: MonthlyCashflow = {
      period: jan2024, totalIncome: 200,
      opexReimbursementTotal: 0, opex: 30, propertyTax: 0, landTax: 0, maintenance: 0,
      capex: 0, noi: 170, fcf: 170, tenants: [],
    }
    const result = calcFundCashflow([[cf1], [cf2]], 0, [], [jan2024])
    expect(result[0]!.totalIncome).toBeCloseTo(290, 2)
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

function makeRoll(
  year: number, month: number,
  overrides: Partial<MonthlyCashRoll> = {},
): MonthlyCashRoll {
  return {
    period: { year, month },
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
    ...overrides,
  }
}

describe('calcInvestorIRR', () => {
  // Helper: построить кэш-ролл с N+1 периодами (N интервалов) из t=0 в t=N
  function makeRange(months: number): MonthlyCashRoll[] {
    const out: MonthlyCashRoll[] = []
    for (let i = 0; i <= months; i++) {
      const y = 2026 + Math.floor(i / 12)
      const m = (i % 12) + 1
      out.push(makeRoll(y, m))
    }
    return out
  }

  // V4.5.3: calcInvestorIRR теперь читает r.investorCashflow напрямую — это поле
  // должен заполнить calcFundCashRoll. В unit-тестах задаём его явно.
  it('emission 100k в t=0, redemption 110k через 12 интервалов → IRR≈10% годовых', () => {
    const roll = makeRange(12) // 13 периодов, 12 интервалов
    roll[0]  = makeRoll(2026, 1, { emissionInflow: 100_000, investorCashflow: -100_000 })
    roll[12] = makeRoll(2027, 1, { redemptionOutflow: 110_000, investorCashflow:  110_000 })
    expect(calcInvestorIRR(roll).value).toBeCloseTo(0.10, 3)
  })

  it('upfront fee увеличивает отток t=0 и снижает IRR', () => {
    const noFee = makeRange(12)
    noFee[0]  = makeRoll(2026, 1, { emissionInflow: 100_000, investorCashflow: -100_000 })
    noFee[12] = makeRoll(2027, 1, { redemptionOutflow: 110_000, investorCashflow: 110_000 })

    const withFee = makeRange(12)
    withFee[0]  = makeRoll(2026, 1, { emissionInflow: 100_000, upfrontFeeOutflow: 5_000, investorCashflow: -105_000 })
    withFee[12] = makeRoll(2027, 1, { redemptionOutflow: 110_000, investorCashflow: 110_000 })

    expect(calcInvestorIRR(withFee).value).toBeLessThan(calcInvestorIRR(noFee).value)
  })

  it('emission и redemption одинаковые, distributions=0 → IRR≈0', () => {
    const roll = makeRange(12)
    roll[0]  = makeRoll(2026, 1, { emissionInflow: 100_000, investorCashflow: -100_000 })
    roll[12] = makeRoll(2027, 1, { redemptionOutflow: 100_000, investorCashflow: 100_000 })
    expect(calcInvestorIRR(roll).value).toBeCloseTo(0, 5)
  })

  it('ежемесячные distributions суммарно равны emission → IRR ≥ 0', () => {
    const roll = makeRange(12)
    roll[0] = makeRoll(2026, 1, { emissionInflow: 120_000, investorCashflow: -120_000 })
    for (let i = 1; i <= 12; i++) {
      const period = roll[i]!.period
      roll[i] = makeRoll(period.year, period.month, {
        distributionOutflow: 10_000,
        investorCashflow:    10_000,
      })
    }
    expect(calcInvestorIRR(roll).value).toBeGreaterThanOrEqual(0)
  })

  it('пустой cashRoll → 0', () => {
    expect(calcInvestorIRR([]).value).toBe(0)
  })

  it('единственный период → 0 (нет смены знака для IRR)', () => {
    const roll: MonthlyCashRoll[] = [
      makeRoll(2026, 1, { emissionInflow: 100_000, redemptionOutflow: 100_000, investorCashflow: -100_000 }),
    ]
    // При одном периоде поток инвестора = −emission (как в calcFundCashRoll для t=0).
    // IRR не определён — нет смены знака.
    expect(calcInvestorIRR(roll).value).toBe(0)
  })

  // ─── V4.5.8: trace инварианты ────────────────────────────────────────────────
  it('trace: возвращает раскладку с операндами по каждому периоду', () => {
    const roll = makeRange(12)
    roll[0]  = makeRoll(2026, 1, { emissionInflow: 100_000, investorCashflow: -100_000 })
    roll[12] = makeRoll(2027, 1, { redemptionOutflow: 110_000, investorCashflow: 110_000 })

    const { value, trace } = calcInvestorIRR(roll)
    expect(trace.value).toBe(value)
    expect(trace.formula).toContain('IRR_monthly')

    // Операнды: IRR_monthly + Месяцев в году + 13 периодов
    const periodOperands = trace.operands.filter(o => o.label.startsWith('t='))
    expect(periodOperands).toHaveLength(13)
    expect(periodOperands[0]!.value).toBe(-100_000)
    expect(periodOperands[12]!.value).toBe(110_000)
  })

  it('trace: пустой cashRoll → "Пустой поток"', () => {
    const { value, trace } = calcInvestorIRR([])
    expect(value).toBe(0)
    expect(trace.formula).toBe('Пустой поток')
    expect(trace.operands).toEqual([])
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

// ─── getReferencePoint (V4.4.1) ───────────────────────────────────────────────

describe('getReferencePoint', () => {
  const fund = {
    startDate: new Date(2024, 0, 1),   // 1 Jan 2024
    endDate:   new Date(2026, 11, 31), // 31 Dec 2026
  }

  it('today до startDate → not_started', () => {
    const today = new Date(2023, 5, 15)
    expect(getReferencePoint(fund, today)).toEqual({ status: 'not_started' })
  })

  it('today сразу за день до startDate → not_started (граница)', () => {
    const today = new Date(2023, 11, 31)
    expect(getReferencePoint(fund, today)).toEqual({ status: 'not_started' })
  })

  it('today === startDate → active (refDate = конец предыдущего месяца)', () => {
    const today = new Date(2024, 0, 1)
    const ref = getReferencePoint(fund, today)
    expect(ref.status).toBe('active')
    if (ref.status === 'active') {
      expect(ref.date).toEqual(new Date(2023, 11, 31)) // 31 Dec 2023
    }
  })

  it('today в середине срока фонда → active с refDate = последний день предыдущего месяца', () => {
    const today = new Date(2025, 5, 15) // 15 Jun 2025
    const ref = getReferencePoint(fund, today)
    expect(ref.status).toBe('active')
    if (ref.status === 'active') {
      expect(ref.date).toEqual(new Date(2025, 4, 31)) // 31 May 2025
    }
  })

  it('today === endDate → active (граница: today не больше endDate)', () => {
    const today = new Date(2026, 11, 31)
    const ref = getReferencePoint(fund, today)
    expect(ref.status).toBe('active')
  })

  it('today после endDate → closed с date = fund.endDate', () => {
    const today = new Date(2027, 0, 5)
    const ref = getReferencePoint(fund, today)
    expect(ref.status).toBe('closed')
    if (ref.status === 'closed') {
      expect(ref.date).toEqual(fund.endDate)
    }
  })

  it('refDate в active корректно роллится через границу года (today в январе)', () => {
    // today = 10 Jan 2025 → refDate должен быть 31 Dec 2024
    const today = new Date(2025, 0, 10)
    const ref = getReferencePoint(fund, today)
    expect(ref.status).toBe('active')
    if (ref.status === 'active') {
      expect(ref.date).toEqual(new Date(2024, 11, 31))
    }
  })
})

// ─── Forward NOI на reference date — интеграционный smoke ─────────────────────

describe('forward 12M NOI от reference date', () => {
  // Этот тест проверяет, что на основе reference date можно правильно собрать
  // forward 12M NOI из массива MonthlyCashflow. Сама агрегация вынесена в
  // FundCashflowBlock (V4.4.2) и dashboard/page.tsx (V4.4.3) — здесь
  // фиксируем геометрию: refDate = end of prev month → forward window = next 12 months.
  it('refDate = 31.12.2024, NOI=100k каждый месяц → forward 12M = 1.2M', () => {
    const today = new Date(2025, 0, 15)
    const ref = getReferencePoint(
      { startDate: new Date(2024, 0, 1), endDate: new Date(2026, 11, 31) },
      today,
    )
    expect(ref.status).toBe('active')

    // Массив помесячного NOI на 24 месяца (Jan 2024 .. Dec 2025)
    const cashflows = Array.from({ length: 24 }, (_, i) =>
      makeCF(2024 + Math.floor(i / 12), (i % 12) + 1, 100_000, 100_000),
    )

    if (ref.status !== 'active') return
    const refY = ref.date.getFullYear()
    const refM = ref.date.getMonth() + 1
    const refIdx = cashflows.findIndex(cf => cf.period.year === refY && cf.period.month === refM)
    expect(refIdx).toBe(11) // Dec 2024 → 12-я строка

    const forward12 = cashflows.slice(refIdx + 1, refIdx + 13) // Jan..Dec 2025
    expect(forward12).toHaveLength(12)
    const sumNOI = forward12.reduce((s, cf) => s + cf.noi, 0)
    expect(sumNOI).toBeCloseTo(1_200_000, 0)
  })

  it('closed: trailing 12M до endDate включительно', () => {
    const fundLocal = { startDate: new Date(2024, 0, 1), endDate: new Date(2025, 11, 31) }
    const today = new Date(2026, 5, 1) // после endDate
    const ref = getReferencePoint(fundLocal, today)
    expect(ref.status).toBe('closed')
    if (ref.status !== 'closed') return

    const cashflows = Array.from({ length: 24 }, (_, i) =>
      makeCF(2024 + Math.floor(i / 12), (i % 12) + 1, 100_000, 100_000),
    )
    const refIdx = cashflows.findIndex(
      cf => cf.period.year === ref.date.getFullYear() && cf.period.month === ref.date.getMonth() + 1,
    )
    expect(refIdx).toBe(23) // Dec 2025 → 24-я строка

    const trailing12 = cashflows.slice(Math.max(0, refIdx - 11), refIdx + 1) // Jan..Dec 2025
    expect(trailing12).toHaveLength(12)
    const sumNOI = trailing12.reduce((s, cf) => s + cf.noi, 0)
    expect(sumNOI).toBeCloseTo(1_200_000, 0)
  })
})
