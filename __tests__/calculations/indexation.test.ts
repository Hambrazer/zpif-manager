import { calcIndexedRent } from '../../lib/calculations/indexation'

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
})
