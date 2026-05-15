import { aggregateCashflows, aggregateFundCashRoll } from '../../lib/utils/aggregate'
import type { MonthlyCashflow, MonthlyCashRoll } from '../../lib/types'

function makeCF(year: number, month: number, noi: number, tenants: { id: string; name: string; rent: number; opex: number }[] = []): MonthlyCashflow {
  return {
    period: { year, month },
    totalIncome: tenants.reduce((s, t) => s + t.rent + t.opex, 0),
    opexReimbursementTotal: tenants.reduce((s, t) => s + t.opex, 0),
    opex: 0, propertyTax: 0, landTax: 0, maintenance: 0, capex: 0,
    noi, fcf: noi,
    tenants: tenants.map(t => ({ tenantId: t.id, tenantName: t.name, rentIncome: t.rent, opexReimbursement: t.opex })),
  }
}

describe('aggregateCashflows', () => {
  it('monthly: возвращает каждый месяц без изменений', () => {
    const cfs = [makeCF(2024, 1, 100), makeCF(2024, 2, 200), makeCF(2024, 3, 300)]
    const res = aggregateCashflows(cfs, 'monthly')
    expect(res).toHaveLength(3)
    expect(res[0]!.period).toEqual({ year: 2024, month: 1 })
    expect(res[1]!.noi).toBe(200)
  })

  it('quarterly: 3 месяца → 1 строка с суммой; period.month = конец квартала', () => {
    const cfs = [
      makeCF(2024, 1, 100), makeCF(2024, 2, 200), makeCF(2024, 3, 300),  // Q1
      makeCF(2024, 4, 400), makeCF(2024, 5, 500), makeCF(2024, 6, 600),  // Q2
    ]
    const res = aggregateCashflows(cfs, 'quarterly')
    expect(res).toHaveLength(2)
    expect(res[0]!.period).toEqual({ year: 2024, month: 3 })
    expect(res[0]!.noi).toBe(600)  // 100+200+300
    expect(res[1]!.period).toEqual({ year: 2024, month: 6 })
    expect(res[1]!.noi).toBe(1500) // 400+500+600
  })

  it('annual: 12 месяцев → 1 строка с суммой; period.month = 12', () => {
    const cfs = Array.from({ length: 24 }, (_, i) => makeCF(2024 + Math.floor(i / 12), (i % 12) + 1, 100))
    const res = aggregateCashflows(cfs, 'annual')
    expect(res).toHaveLength(2)
    expect(res[0]!.period).toEqual({ year: 2024, month: 12 })
    expect(res[0]!.noi).toBe(1200)
    expect(res[1]!.period).toEqual({ year: 2025, month: 12 })
    expect(res[1]!.noi).toBe(1200)
  })

  it('tenants сворачиваются по tenantId внутри окна', () => {
    const cfs = [
      makeCF(2024, 1, 0, [{ id: 't1', name: 'Tenant 1', rent: 100, opex: 10 }]),
      makeCF(2024, 2, 0, [{ id: 't1', name: 'Tenant 1', rent: 150, opex: 15 }, { id: 't2', name: 'Tenant 2', rent: 200, opex: 20 }]),
      makeCF(2024, 3, 0, [{ id: 't2', name: 'Tenant 2', rent: 250, opex: 25 }]),
    ]
    const res = aggregateCashflows(cfs, 'quarterly')
    expect(res).toHaveLength(1)
    const t1 = res[0]!.tenants.find(t => t.tenantId === 't1')!
    const t2 = res[0]!.tenants.find(t => t.tenantId === 't2')!
    expect(t1.rentIncome).toBe(250)        // 100 + 150
    expect(t1.opexReimbursement).toBe(25)  // 10 + 15
    expect(t2.rentIncome).toBe(450)        // 200 + 250
    expect(t2.opexReimbursement).toBe(45)  // 20 + 25
  })

  it('фильтр по диапазону дат: from/to ограничивают входной массив', () => {
    const cfs = [makeCF(2024, 1, 100), makeCF(2024, 2, 200), makeCF(2024, 3, 300), makeCF(2024, 4, 400)]
    const res = aggregateCashflows(cfs, 'monthly', {
      from: new Date(2024, 1, 1),  // Feb
      to:   new Date(2024, 2, 1),  // Mar
    })
    expect(res).toHaveLength(2)
    expect(res[0]!.period).toEqual({ year: 2024, month: 2 })
    expect(res[1]!.period).toEqual({ year: 2024, month: 3 })
  })

  it('пустой массив → пустой результат', () => {
    expect(aggregateCashflows([], 'annual')).toEqual([])
  })
})

// ─── aggregateFundCashRoll ────────────────────────────────────────────────────

function makeRoll(year: number, month: number, fields: Partial<MonthlyCashRoll> = {}): MonthlyCashRoll {
  return {
    period: { year, month },
    cashBegin: 0,
    noiInflow: 0, disposalInflow: 0, emissionInflow: 0,
    acquisitionOutflow: 0, upfrontFeeOutflow: 0,
    managementFeeOutflow: 0, fundExpensesOutflow: 0,
    successFeeOperationalOutflow: 0, successFeeExitOutflow: 0,
    debtServiceOutflow: 0, distributionOutflow: 0,
    cashEnd: 0,
    ...fields,
  }
}

describe('aggregateFundCashRoll', () => {
  it('quarterly: NOI и комиссии суммируются за окно', () => {
    const cr = [
      makeRoll(2024, 1, { noiInflow: 100, managementFeeOutflow: 10, cashBegin: 0, cashEnd: 90 }),
      makeRoll(2024, 2, { noiInflow: 200, managementFeeOutflow: 20, cashBegin: 90, cashEnd: 270 }),
      makeRoll(2024, 3, { noiInflow: 300, managementFeeOutflow: 30, cashBegin: 270, cashEnd: 540 }),
      makeRoll(2024, 4, { noiInflow: 400, managementFeeOutflow: 40, cashBegin: 540, cashEnd: 900 }),
    ]
    const res = aggregateFundCashRoll(cr, 'quarterly')
    expect(res).toHaveLength(2)
    expect(res[0]!.period).toEqual({ year: 2024, month: 3 })  // Q1 end
    expect(res[0]!.noiInflow).toBe(600)
    expect(res[0]!.managementFeeOutflow).toBe(60)
    expect(res[0]!.cashBegin).toBe(0)   // first month
    expect(res[0]!.cashEnd).toBe(540)   // last month of bucket
    expect(res[1]!.period).toEqual({ year: 2024, month: 6 })
    expect(res[1]!.cashBegin).toBe(540)
    expect(res[1]!.cashEnd).toBe(900)
  })

  it('annual: 12 месяцев → 1 строка; cashBegin = jan, cashEnd = dec', () => {
    const cr = Array.from({ length: 12 }, (_, i) =>
      makeRoll(2024, i + 1, { noiInflow: 100, cashBegin: i * 100, cashEnd: (i + 1) * 100 }),
    )
    const res = aggregateFundCashRoll(cr, 'annual')
    expect(res).toHaveLength(1)
    expect(res[0]!.noiInflow).toBe(1200)
    expect(res[0]!.cashBegin).toBe(0)       // jan cashBegin
    expect(res[0]!.cashEnd).toBe(1200)      // dec cashEnd
  })

  it('фильтр по диапазону: учитываются только месяцы внутри окна', () => {
    const cr = [
      makeRoll(2024, 1, { noiInflow: 100, cashBegin: 0,    cashEnd: 100 }),
      makeRoll(2024, 2, { noiInflow: 100, cashBegin: 100,  cashEnd: 200 }),
      makeRoll(2024, 3, { noiInflow: 100, cashBegin: 200,  cashEnd: 300 }),
    ]
    const res = aggregateFundCashRoll(cr, 'monthly', { from: new Date(2024, 1, 1) })
    expect(res).toHaveLength(2)
    expect(res[0]!.period.month).toBe(2)
    expect(res[1]!.period.month).toBe(3)
  })

  it('пустой массив → пустой результат', () => {
    expect(aggregateFundCashRoll([], 'annual')).toEqual([])
  })
})
