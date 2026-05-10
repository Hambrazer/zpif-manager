import type { MonthlyCashflow, MonthlyPeriod, LeaseInput, DebtInput } from '../types'
import { calcDebtSchedule } from './amortization'
import { calcIRR } from './dcf'
import { MONTHS_PER_YEAR } from './constants'

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25

function periodKey(p: MonthlyPeriod): string {
  return `${p.year}-${p.month}`
}

type PeriodAggregate = {
  gri: number; vacancy: number; nri: number
  opexReimbursementTotal: number
  opex: number; propertyTax: number; landTax: number; maintenance: number
  capex: number; noi: number; debtService: number
}

function zeroAggregate(): PeriodAggregate {
  return {
    gri: 0, vacancy: 0, nri: 0,
    opexReimbursementTotal: 0,
    opex: 0, propertyTax: 0, landTax: 0, maintenance: 0,
    capex: 0, noi: 0, debtService: 0,
  }
}

/**
 * Помесячный денежный поток фонда.
 *
 * noi   = Σ NOI по всем объектам (PROJECT.md)
 * debtService = Σ debtService объектов + обслуживание долга фонда + расходы фонда/12
 * fcf   = noi − debtService
 */
export function calcFundCashflow(
  propertyCashflows: MonthlyCashflow[][],
  annualFundExpenses: number,
  fundDebts: DebtInput[],
  periods: MonthlyPeriod[]
): MonthlyCashflow[] {
  if (periods.length === 0) return []

  const debtMap = new Map<string, number>()
  for (const debt of fundDebts) {
    for (const payment of calcDebtSchedule(debt)) {
      const k = periodKey(payment.period)
      debtMap.set(k, (debtMap.get(k) ?? 0) + payment.total)
    }
  }

  const aggMap = new Map<string, PeriodAggregate>()
  for (const propCF of propertyCashflows) {
    for (const cf of propCF) {
      const k = periodKey(cf.period)
      const agg = aggMap.get(k) ?? zeroAggregate()
      agg.gri                    += cf.gri
      agg.vacancy                += cf.vacancy
      agg.nri                    += cf.nri
      agg.opexReimbursementTotal += cf.opexReimbursementTotal
      agg.opex                   += cf.opex
      agg.propertyTax            += cf.propertyTax
      agg.landTax                += cf.landTax
      agg.maintenance            += cf.maintenance
      agg.capex                  += cf.capex
      agg.noi                    += cf.noi
      agg.debtService            += cf.debtService
      aggMap.set(k, agg)
    }
  }

  const monthlyExpenses = annualFundExpenses / 12

  return periods.map(period => {
    const k = periodKey(period)
    const agg = aggMap.get(k) ?? zeroAggregate()
    const debtService = agg.debtService + (debtMap.get(k) ?? 0) + monthlyExpenses
    const fcf = agg.noi - debtService
    return {
      period,
      gri: agg.gri, vacancy: agg.vacancy, nri: agg.nri,
      opexReimbursementTotal: agg.opexReimbursementTotal,
      opex: agg.opex, propertyTax: agg.propertyTax,
      landTax: agg.landTax, maintenance: agg.maintenance,
      capex: agg.capex, noi: agg.noi,
      debtService, fcf,
      tenants: [],
    }
  })
}

/**
 * Cap Rate = NOI_год / стоимость объектов (сумма acquisitionPrice).
 * Возвращает 0 если стоимость = 0.
 */
export function calcCapRate(annualNOI: number, totalPropertyValue: number): number {
  if (totalPropertyValue === 0) return 0
  return annualNOI / totalPropertyValue
}

/**
 * WAULT (средневзвешенный срок до истечения), лет.
 * Учитывает только активные договоры (status = 'ACTIVE').
 * Договоры с уже истёкшей датой вносят 0 лет.
 */
export function calcWAULT(leases: LeaseInput[], referenceDate: Date): number {
  const active = leases.filter(l => l.status === 'ACTIVE')
  const totalArea = active.reduce((s, l) => s + l.area, 0)
  if (totalArea === 0) return 0
  const refMs = referenceDate.getTime()
  const weighted = active.reduce((s, l) => {
    const years = Math.max(0, (l.endDate.getTime() - refMs) / MS_PER_YEAR)
    return s + l.area * years
  }, 0)
  return weighted / totalArea
}

/**
 * СЧА = Σ NPV объектов + денежные средства − Σ остатки долгов.
 */
export function calcNAV(
  totalPropertyValue: number,
  cash: number,
  totalLiabilities: number
): number {
  return totalPropertyValue + cash - totalLiabilities
}

/**
 * Стоимость пая = СЧА / количество паёв.
 * Возвращает 0 если паёв нет.
 */
export function calcNAVPerUnit(nav: number, totalUnits: number): number {
  if (totalUnits === 0) return 0
  return nav / totalUnits
}

// ─── Метрики доходности пайщика ───────────────────────────────────────────────

/**
 * IRR пайщика (годовой).
 *
 * Денежный поток пайщика:
 *   t=0: -(totalEmission + upfrontFee)  — полная стоимость входа с надбавкой
 *   t=1..N: distributions[t-1]          — периодические выплаты
 *   t=N: последний элемент + finalNAV   — возврат остаточной стоимости
 *
 * upfrontFee = upfrontFeeRate × totalEmission / (1 − upfrontFeeRate)
 */
export function calcInvestorIRR(
  totalEmission: number,
  upfrontFeeRate: number,
  distributions: number[],
  finalNAV: number
): number {
  const upfrontFee =
    upfrontFeeRate > 0 && upfrontFeeRate < 1
      ? (upfrontFeeRate * totalEmission) / (1 - upfrontFeeRate)
      : 0

  const cashflows: number[] = [-(totalEmission + upfrontFee), ...distributions]

  if (cashflows.length === 1) {
    cashflows.push(finalNAV)
  } else {
    cashflows[cashflows.length - 1]! += finalNAV
  }

  const irrMonthly = calcIRR(cashflows)
  return isNaN(irrMonthly) ? 0 : Math.pow(1 + irrMonthly, MONTHS_PER_YEAR) - 1
}

/**
 * Cash-on-Cash доходность по годам = выплаты за год / привлечённый капитал.
 * yearlyDistributions[y] — суммарные выплаты пайщикам за год y.
 */
export function calcCashOnCash(
  yearlyDistributions: number[],
  attractedCapital: number
): number[] {
  if (attractedCapital === 0) return yearlyDistributions.map(() => 0)
  return yearlyDistributions.map(d => d / attractedCapital)
}

/**
 * Прирост стоимости капитала по годам = (стоимость объектов на конец года − стоимость входа) / привлечённый капитал.
 * propertyValuesEOY[y] — суммарная оценочная стоимость объектов на конец года y.
 * entryPropertyValues  — суммарная цена приобретения объектов.
 */
export function calcCapitalGain(
  propertyValuesEOY: number[],
  entryPropertyValues: number,
  attractedCapital: number
): number[] {
  if (attractedCapital === 0) return propertyValuesEOY.map(() => 0)
  return propertyValuesEOY.map(v => (v - entryPropertyValues) / attractedCapital)
}
