import { calcIndexedRent, calcStepRent } from '../../lib/calculations/indexation'
import type { LeaseStepRentInput } from '../../lib/types'

// Все эталонные значения проверены вручную (формулы ниже).

describe('calcIndexedRent', () => {
  // ── NONE ─────────────────────────────────────────────────────────────────────

  describe('NONE', () => {
    it('возвращает baseRent без изменений независимо от дат', () => {
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2025-06-01'), 'NONE', null, {})
      ).toBe(1000)
    })
  })

  // ── FIXED ────────────────────────────────────────────────────────────────────

  describe('FIXED', () => {
    it('не индексирует если ни одна годовщина не наступила', () => {
      // startDate 2021-01-01, первая годовщина 2022-01-01, targetDate 2021-12-31
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2021-12-31'), 'FIXED', 0.05, {})
      ).toBe(1000)
    })

    it('индексирует ровно в день первой годовщины', () => {
      // targetDate == anniversary[1] → 1 индексация: 1000 * 1.05 = 1050
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2022-01-01'), 'FIXED', 0.05, {})
      ).toBe(1050)
    })

    it('1 годовщина прошла: 1000 * 1.05 = 1050', () => {
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2022-06-15'), 'FIXED', 0.05, {})
      ).toBe(1050)
    })

    it('2 годовщины: 1000 * 1.05^2 = 1102.50', () => {
      // anniversaries: 2022-01-01 и 2023-01-01; targetDate 2023-06-01
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2023-06-01'), 'FIXED', 0.05, {})
      ).toBeCloseTo(1102.5, 2)
    })

    it('3 годовщины: 1000 * 1.05^3 = 1157.625', () => {
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2024-03-01'), 'FIXED', 0.05, {})
      ).toBeCloseTo(1157.625, 3)
    })

    it('корректно считает при не-январском startDate', () => {
      // startDate 2021-07-15, anniversaries: 2022-07-15, 2023-07-15
      // targetDate 2022-08-01: прошла 1 годовщина (2022-07-15) → 1000 * 1.10 = 1100
      expect(
        calcIndexedRent(1000, new Date('2021-07-15'), new Date('2022-08-01'), 'FIXED', 0.10, {})
      ).toBe(1100)
    })

    it('не индексирует до годовщины при не-январском startDate', () => {
      // targetDate 2022-06-01: годовщина 2022-07-15 ещё не наступила → 1000
      expect(
        calcIndexedRent(1000, new Date('2021-07-15'), new Date('2022-06-01'), 'FIXED', 0.10, {})
      ).toBe(1000)
    })

    it('rate=null трактуется как 0: возвращает baseRent', () => {
      expect(
        calcIndexedRent(1000, new Date('2021-01-01'), new Date('2024-01-01'), 'FIXED', null, {})
      ).toBe(1000)
    })
  })

  // ── CPI ──────────────────────────────────────────────────────────────────────

  describe('CPI', () => {
    it('не индексирует если ни одна годовщина не наступила', () => {
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2021-12-31'),
          'CPI',
          null,
          { 2021: 0.08 }
        )
      ).toBe(1000)
    })

    it('1 годовщина: применяет CPI предшествующего года', () => {
      // Anniversary 2022-01-01 → применяем CPI[2021]=0.08 → 1000 * 1.08 = 1080
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2022-06-01'),
          'CPI',
          null,
          { 2021: 0.08 }
        )
      ).toBeCloseTo(1080, 2)
    })

    it('2 годовщины: 1000 * 1.08 * 1.11 = 1198.80', () => {
      // Anniversary 2022-01-01 → CPI[2021]=0.08 → 1080
      // Anniversary 2023-01-01 → CPI[2022]=0.11 → 1080 * 1.11 = 1198.80
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2023-06-01'),
          'CPI',
          null,
          { 2021: 0.08, 2022: 0.11 }
        )
      ).toBeCloseTo(1198.8, 2)
    })

    it('отсутствующий CPI для года трактуется как 0 (нет индексации за тот год)', () => {
      // Есть только CPI[2021]=0.08; для 2022 нет → применяем 0
      // After 2 anniversaries: 1000 * 1.08 * 1.0 = 1080
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2023-06-01'),
          'CPI',
          null,
          { 2021: 0.08 }
        )
      ).toBeCloseTo(1080, 2)
    })
  })

  // ── firstIndexationDate + indexationFrequency ────────────────────────────────

  describe('firstIndexationDate + indexationFrequency', () => {
    it('FIXED: не индексирует до firstIndexationDate', () => {
      // startDate 2021-01-01, firstIndexationDate 2022-04-01, targetDate 2022-03-31
      // → 0 индексаций → 1000
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2022-03-31'),
          'FIXED',
          0.05,
          {},
          new Date('2022-04-01'),
          12
        )
      ).toBe(1000)
    })

    it('FIXED: ровно в firstIndexationDate применяет первую индексацию', () => {
      // 1 событие 2022-04-01 → 1000 * 1.05 = 1050
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2022-04-01'),
          'FIXED',
          0.05,
          {},
          new Date('2022-04-01'),
          12
        )
      ).toBeCloseTo(1050, 4)
    })

    it('FIXED ежегодно от firstIndexationDate: 2 индексации = 1000 * 1.05^2', () => {
      // События: 2022-04-01, 2023-04-01. targetDate 2023-06-01 → 2 события.
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2023-06-01'),
          'FIXED',
          0.05,
          {},
          new Date('2022-04-01'),
          12
        )
      ).toBeCloseTo(1102.5, 2)
    })

    it('FIXED раз в 3 месяца: 4 события за год от firstIndexationDate', () => {
      // События: 2022-04-01, 2022-07-01, 2022-10-01, 2023-01-01. targetDate 2023-01-15 → 4 события.
      // 1000 * 1.05^4 = 1215.5063
      expect(
        calcIndexedRent(
          1000,
          new Date('2022-01-01'),
          new Date('2023-01-15'),
          'FIXED',
          0.05,
          {},
          new Date('2022-04-01'),
          3
        )
      ).toBeCloseTo(1215.5063, 3)
    })

    it('FIXED раз в 6 месяцев: 3 события за 18 месяцев', () => {
      // События: 2022-04-01, 2022-10-01, 2023-04-01. targetDate 2023-09-30 → 3 события.
      // 1000 * 1.05^3 = 1157.625
      expect(
        calcIndexedRent(
          1000,
          new Date('2022-01-01'),
          new Date('2023-09-30'),
          'FIXED',
          0.05,
          {},
          new Date('2022-04-01'),
          6
        )
      ).toBeCloseTo(1157.625, 3)
    })

    it('FIXED: frequency=null трактуется как 12 месяцев', () => {
      // События: 2022-04-01 (frequency=null → 12). targetDate 2022-12-01 → 1 событие.
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2022-12-01'),
          'FIXED',
          0.05,
          {},
          new Date('2022-04-01'),
          null
        )
      ).toBeCloseTo(1050, 4)
    })

    it('CPI: индексирует в firstIndexationDate с CPI предшествующего года', () => {
      // Событие 2022-04-01, cpiYear = 2021, CPI[2021]=0.08 → 1000 * 1.08 = 1080
      expect(
        calcIndexedRent(
          1000,
          new Date('2021-01-01'),
          new Date('2022-04-01'),
          'CPI',
          null,
          { 2021: 0.08, 2022: 0.11 },
          new Date('2022-04-01'),
          12
        )
      ).toBeCloseTo(1080, 2)
    })

    it('CPI раз в 6 месяцев: 2 события в одном году применяют CPI того же предшествующего года', () => {
      // События: 2022-04-01 и 2022-10-01. Оба используют CPI[2021]=0.08.
      // 1000 * 1.08 * 1.08 = 1166.40
      expect(
        calcIndexedRent(
          1000,
          new Date('2022-01-01'),
          new Date('2022-10-15'),
          'CPI',
          null,
          { 2021: 0.08, 2022: 0.11 },
          new Date('2022-04-01'),
          6
        )
      ).toBeCloseTo(1166.4, 2)
    })

    it('firstIndexationDate не задана → поведение прежнее (ежегодно от startDate)', () => {
      // Поведение должно совпадать с тестом без firstIndexationDate.
      const withoutFirst = calcIndexedRent(
        1000,
        new Date('2021-01-01'),
        new Date('2023-06-01'),
        'FIXED',
        0.05,
        {}
      )
      const withNullFirst = calcIndexedRent(
        1000,
        new Date('2021-01-01'),
        new Date('2023-06-01'),
        'FIXED',
        0.05,
        {},
        null,
        null
      )
      expect(withNullFirst).toBe(withoutFirst)
      expect(withNullFirst).toBeCloseTo(1102.5, 2)
    })
  })
})

// ─── calcStepRent ─────────────────────────────────────────────────────────────

describe('calcStepRent', () => {
  const baseRent = 10_000
  const leaseStart = new Date('2024-01-01')

  function step(s: string, e: string, rate: number, indexAfterEnd = false): LeaseStepRentInput {
    return { startDate: new Date(s), endDate: new Date(e), rentRate: rate, indexAfterEnd }
  }

  it('нет ступеней → стандартная индексация от baseRent', () => {
    const r = calcStepRent(
      baseRent, [], leaseStart, new Date('2025-01-01'),
      'FIXED', 0.05, {}, null, null,
    )
    // 1 индексация в годовщину → 10500
    expect(r).toBeCloseTo(10_500, 2)
  })

  it('targetDate внутри активной ступени → rentRate ступени, без индексации', () => {
    const steps = [step('2024-01-01', '2024-12-31', 12_000)]
    const r = calcStepRent(
      baseRent, steps, leaseStart, new Date('2024-06-15'),
      'FIXED', 0.05, {}, null, null,
    )
    expect(r).toBe(12_000)
  })

  it('targetDate после всех ступеней, indexAfterEnd=false → rentRate последней без индексации', () => {
    const steps = [step('2024-01-01', '2024-12-31', 12_000, false)]
    const r = calcStepRent(
      baseRent, steps, leaseStart, new Date('2026-06-01'),
      'FIXED', 0.05, {}, null, null,
    )
    expect(r).toBe(12_000)
  })

  it('targetDate после ступеней, indexAfterEnd=true → индексация от rentRate ступени, отсчёт от endDate', () => {
    // ступень закончилась 2024-12-31, targetDate 2026-01-01
    // отсчёт от 2024-12-31, годовщина 2025-12-31 — попадает в окно → 1 индексация
    // 12 000 × 1.05 = 12 600
    const steps = [step('2024-01-01', '2024-12-31', 12_000, true)]
    const r = calcStepRent(
      baseRent, steps, leaseStart, new Date('2026-01-01'),
      'FIXED', 0.05, {}, null, null,
    )
    expect(r).toBeCloseTo(12_600, 2)
  })

  it('несколько ступеней: возвращает активную', () => {
    const steps = [
      step('2024-01-01', '2024-12-31', 12_000),
      step('2025-01-01', '2025-12-31', 14_000),
      step('2026-01-01', '2026-12-31', 16_000),
    ]
    expect(
      calcStepRent(baseRent, steps, leaseStart, new Date('2025-07-01'),
        'FIXED', 0.05, {}, null, null)
    ).toBe(14_000)
  })

  it('targetDate раньше первой ступени → fallback к baseRent + индексация', () => {
    // ступень начинается 2025-01-01, targetDate 2024-06-01 (год от lease start)
    // нет годовщины ещё → baseRent
    const steps = [step('2025-01-01', '2025-12-31', 14_000)]
    const r = calcStepRent(
      baseRent, steps, leaseStart, new Date('2024-06-01'),
      'FIXED', 0.05, {}, null, null,
    )
    expect(r).toBe(baseRent)
  })

  it('после нескольких ступеней с indexAfterEnd=true у последней → база = последняя ступень', () => {
    const steps = [
      step('2024-01-01', '2024-12-31', 12_000, false),
      step('2025-01-01', '2025-12-31', 14_000, true),
    ]
    // последняя закончилась 2025-12-31, target 2027-01-01 → отсчёт от 2025-12-31
    // годовщина 2026-12-31 попадает → 1 индексация: 14 000 × 1.05 = 14 700
    const r = calcStepRent(
      baseRent, steps, leaseStart, new Date('2027-01-01'),
      'FIXED', 0.05, {}, null, null,
    )
    expect(r).toBeCloseTo(14_700, 2)
  })
})
