import { calcDebtSchedule } from '../../lib/calculations/amortization'
import type { DebtInput } from '../../lib/types'

// Эталонные значения для долга: 120 000 ₽, 12% годовых, 12 месяцев.
// Ежемесячная ставка r = 0.01.
// Периоды: {2021,2} … {2022,1} (платёж — месяц, следующий за стартовым).

const base: DebtInput = {
  id: 'd1',
  principalAmount: 120_000,
  interestRate: 0.12,
  startDate: new Date('2021-01-01'),
  endDate: new Date('2022-01-01'),
  amortizationType: 'BULLET',
}

// ── Периоды ──────────────────────────────────────────────────────────────────

describe('периоды', () => {
  it('возвращает 12 периодов для 12-месячного долга', () => {
    const s = calcDebtSchedule({ ...base, amortizationType: 'LINEAR' })
    expect(s).toHaveLength(12)
  })

  it('первый период — февраль 2021 (месяц после startDate)', () => {
    const s = calcDebtSchedule({ ...base, amortizationType: 'LINEAR' })
    expect(s[0]!.period).toEqual({ year: 2021, month: 2 })
  })

  it('последний период — январь 2022 (месяц endDate)', () => {
    const s = calcDebtSchedule({ ...base, amortizationType: 'LINEAR' })
    expect(s[11]!.period).toEqual({ year: 2022, month: 1 })
  })

  it('корректно пересекает границу года (5 месяцев, окт→март)', () => {
    const s = calcDebtSchedule({
      ...base,
      amortizationType: 'BULLET',
      startDate: new Date('2021-10-01'),
      endDate: new Date('2022-03-01'),
    })
    expect(s).toHaveLength(5)
    expect(s[0]!.period).toEqual({ year: 2021, month: 11 })
    expect(s[4]!.period).toEqual({ year: 2022, month: 3 })
  })

  it('возвращает пустой массив если startDate == endDate', () => {
    const s = calcDebtSchedule({
      ...base,
      startDate: new Date('2021-01-01'),
      endDate: new Date('2021-01-01'),
    })
    expect(s).toHaveLength(0)
  })
})

// ── BULLET ───────────────────────────────────────────────────────────────────

describe('BULLET', () => {
  const s = calcDebtSchedule({ ...base, amortizationType: 'BULLET' })

  it('месяцы 1–11: principal=0, interest=1200, total=1200, balance=120000', () => {
    for (let i = 0; i < 11; i++) {
      expect(s[i]!.principal).toBe(0)
      expect(s[i]!.interest).toBeCloseTo(1200, 2)
      expect(s[i]!.total).toBeCloseTo(1200, 2)
      expect(s[i]!.remainingBalance).toBeCloseTo(120_000, 2)
    }
  })

  it('последний месяц: principal=120000, interest=1200, total=121200, balance=0', () => {
    const last = s[11]!
    expect(last.principal).toBeCloseTo(120_000, 2)
    expect(last.interest).toBeCloseTo(1200, 2)
    expect(last.total).toBeCloseTo(121_200, 2)
    expect(last.remainingBalance).toBe(0)
  })
})

// ── LINEAR ───────────────────────────────────────────────────────────────────

describe('LINEAR', () => {
  const s = calcDebtSchedule({ ...base, amortizationType: 'LINEAR' })

  it('месяц 1: interest=1200, principal=10000, total=11200, balance=110000', () => {
    expect(s[0]!.interest).toBeCloseTo(1200, 2)
    expect(s[0]!.principal).toBeCloseTo(10_000, 2)
    expect(s[0]!.total).toBeCloseTo(11_200, 2)
    expect(s[0]!.remainingBalance).toBeCloseTo(110_000, 2)
  })

  it('месяц 2: interest=1100, principal=10000, total=11100, balance=100000', () => {
    expect(s[1]!.interest).toBeCloseTo(1100, 2)
    expect(s[1]!.principal).toBeCloseTo(10_000, 2)
    expect(s[1]!.total).toBeCloseTo(11_100, 2)
    expect(s[1]!.remainingBalance).toBeCloseTo(100_000, 2)
  })

  it('каждый следующий месяц: total строго убывает', () => {
    for (let i = 1; i < 12; i++) {
      expect(s[i]!.total).toBeLessThan(s[i - 1]!.total)
    }
  })

  it('последний месяц: interest=100, principal=10000, total=10100, balance=0', () => {
    const last = s[11]!
    expect(last.interest).toBeCloseTo(100, 2)
    expect(last.principal).toBeCloseTo(10_000, 2)
    expect(last.total).toBeCloseTo(10_100, 2)
    expect(last.remainingBalance).toBeCloseTo(0, 6)
  })
})

// ── ANNUITY ──────────────────────────────────────────────────────────────────

describe('ANNUITY', () => {
  const s = calcDebtSchedule({ ...base, amortizationType: 'ANNUITY' })

  // PMT = 120000 × 0.01 × 1.01^12 / (1.01^12 − 1) ≈ 10661.85
  it('все 12 платежей имеют одинаковый total ≈ 10661.85', () => {
    const pmt = s[0]!.total
    expect(pmt).toBeCloseTo(10_661.85, 1)
    for (let i = 1; i < 11; i++) {
      expect(s[i]!.total).toBeCloseTo(pmt, 6)
    }
  })

  it('месяц 1: interest=1200, principal≈9461.85, balance≈110538.15', () => {
    expect(s[0]!.interest).toBeCloseTo(1200, 2)
    expect(s[0]!.principal).toBeCloseTo(9_461.85, 1)
    expect(s[0]!.remainingBalance).toBeCloseTo(110_538.15, 1)
  })

  it('остаток долга убывает каждый месяц', () => {
    for (let i = 1; i < 12; i++) {
      expect(s[i]!.remainingBalance).toBeLessThan(s[i - 1]!.remainingBalance)
    }
  })

  it('итоговый баланс = 0', () => {
    expect(s[11]!.remainingBalance).toBeCloseTo(0, 6)
  })

  it('нулевая ставка: равные выплаты principal без процентов', () => {
    const sZero = calcDebtSchedule({ ...base, amortizationType: 'ANNUITY', interestRate: 0 })
    for (const p of sZero) {
      expect(p.interest).toBe(0)
      expect(p.principal).toBeCloseTo(10_000, 6)
    }
    expect(sZero[11]!.remainingBalance).toBeCloseTo(0, 6)
  })
})
