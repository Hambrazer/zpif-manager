import type { DebtInput, MonthlyDebtPayment, MonthlyPeriod } from '../types'

function monthsBetween(start: Date, end: Date): number {
  return (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth())
}

function periodForOffset(start: Date, offset: number): MonthlyPeriod {
  const d = new Date(start)
  d.setMonth(d.getMonth() + offset)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Строит помесячный график погашения долга.
 *
 * Первый платёж — в месяце, следующем за startDate.
 * Последний платёж — в месяце endDate.
 *
 * Типы амортизации:
 *   BULLET  — проценты ежемесячно, тело долга целиком в последнем периоде
 *   LINEAR  — равное тело долга каждый месяц, убывающие проценты
 *   ANNUITY — равный совокупный платёж (тело + проценты) каждый месяц
 */
export function calcDebtSchedule(debt: DebtInput): MonthlyDebtPayment[] {
  const { principalAmount, interestRate, startDate, endDate, amortizationType } = debt
  const n = monthsBetween(startDate, endDate)
  if (n <= 0) return []

  const r = interestRate / 12
  const schedule: MonthlyDebtPayment[] = []

  if (amortizationType === 'BULLET') {
    for (let i = 1; i <= n; i++) {
      const isLast = i === n
      const interest = principalAmount * r
      const principal = isLast ? principalAmount : 0
      schedule.push({
        period: periodForOffset(startDate, i),
        principal,
        interest,
        total: principal + interest,
        remainingBalance: isLast ? 0 : principalAmount,
      })
    }
    return schedule
  }

  if (amortizationType === 'LINEAR') {
    const monthlyPrincipal = principalAmount / n
    let balance = principalAmount
    for (let i = 1; i <= n; i++) {
      const isLast = i === n
      const interest = balance * r
      // последний платёж берёт остаток — устраняет накопленные ошибки float
      const principal = isLast ? balance : monthlyPrincipal
      balance -= principal
      schedule.push({
        period: periodForOffset(startDate, i),
        principal,
        interest,
        total: principal + interest,
        remainingBalance: isLast ? 0 : balance,
      })
    }
    return schedule
  }

  // ANNUITY
  if (r === 0) {
    // Нулевая ставка: равные выплаты тела без процентов
    const monthlyPrincipal = principalAmount / n
    let balance = principalAmount
    for (let i = 1; i <= n; i++) {
      const isLast = i === n
      const principal = isLast ? balance : monthlyPrincipal
      balance -= principal
      schedule.push({
        period: periodForOffset(startDate, i),
        principal,
        interest: 0,
        total: principal,
        remainingBalance: isLast ? 0 : balance,
      })
    }
    return schedule
  }

  const factor = Math.pow(1 + r, n)
  const pmt = (principalAmount * r * factor) / (factor - 1)
  let balance = principalAmount
  for (let i = 1; i <= n; i++) {
    const isLast = i === n
    const interest = balance * r
    // последний платёж закрывает остаток — компенсирует накопленные float-ошибки
    const principal = isLast ? balance : pmt - interest
    balance -= principal
    schedule.push({
      period: periodForOffset(startDate, i),
      principal,
      interest,
      total: isLast ? principal + interest : pmt,
      remainingBalance: isLast ? 0 : balance,
    })
  }
  return schedule
}
