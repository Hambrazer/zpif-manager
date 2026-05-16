import type {
  LeaseInput,
  CapexInput,
  CapexReserveInput,
  MonthlyPeriod,
  MonthlyCashflow,
  TenantCashflow,
  Trace,
  TraceOperand,
} from '../types'
import { calcIndexedRent, calcStepRent } from './indexation'

// Поля объекта, необходимые для расчёта денежного потока
export type PropertyExpenseInput = {
  rentableArea: number
  opexRate: number               // ₽/м²/год — фиксированная ставка, без индексации
  maintenanceRate: number        // эксплуатационные расходы, ₽/м²/год — фиксированная ставка
  cadastralValue: number | null  // кадастровая стоимость здания, ₽
  landCadastralValue: number | null
  propertyTaxRate: number        // в долях (0.022 = 2.2%)
  landTaxRate: number            // в долях
  cpiRate: number                // ИПЦ в долях (0.07 = 7%) — для CPI-индексации договоров
}

function lastDayOfMonth(period: MonthlyPeriod): Date {
  return new Date(period.year, period.month, 0)
}

/**
 * Строит горизонт CF объекта: projectionYears × 12 месяцев от purchaseDate
 * (или от текущей даты, если purchaseDate не задана). Не зависит от фонда.
 */
export function buildPropertyPeriods(
  purchaseDate: Date | null,
  projectionYears: number
): MonthlyPeriod[] {
  const start = purchaseDate ?? new Date()
  const startYear = start.getFullYear()
  const startMonth = start.getMonth() + 1
  const totalMonths = projectionYears * 12
  return Array.from({ length: totalMonths }, (_, i) => {
    const totalMonth = startMonth - 1 + i
    return {
      year: startYear + Math.floor(totalMonth / 12),
      month: (totalMonth % 12) + 1,
    }
  })
}

function periodKey(p: MonthlyPeriod): string {
  return `${p.year}-${p.month}`
}

function isLeaseActiveInPeriod(lease: LeaseInput, period: MonthlyPeriod): boolean {
  if (lease.status === 'EXPIRED') return false
  const periodStart = new Date(period.year, period.month - 1, 1)
  const periodEnd = lastDayOfMonth(period)
  return lease.startDate <= periodEnd && lease.endDate >= periodStart
}

/**
 * Рассчитывает помесячный денежный поток объекта недвижимости.
 *
 * Доходы считаются по факту активных договоров — без вакансии.
 *   rentIncome = Σ активных lease: area × calcIndexedRent(lease, period) / 12
 *   opexReimbTotal = Σ активных lease: area × calcIndexedOpexReimb(lease, period) / 12
 *
 * Расходы объекта — фиксированные ставки, без индексации:
 *   opex        = opexRate × rentableArea / 12
 *   maintenance = maintenanceRate × rentableArea / 12
 *   propertyTax = cadastralValue × propertyTaxRate / 12
 *   landTax     = landCadastralValue × landTaxRate / 12
 *
 * CAPEX = Σ CapexItem в этом месяце + CapexReserve (если задан):
 *   capexReserve_t = rentableArea × indexedRate(reserve) / 12,
 *   индексация резерва — calcIndexedRent от ratePerSqm с базой startDate,
 *   начисление начинается с месяца, в котором наступает или уже наступила startDate.
 *
 * NOI = (nri + opexReimbTotal) − opex − propertyTax − landTax − maintenance
 * FCF = NOI − CAPEX
 */
export function calcPropertyCashflow(
  property: PropertyExpenseInput,
  leases: LeaseInput[],
  capexItems: CapexInput[],
  periods: MonthlyPeriod[],
  capexReserve?: CapexReserveInput | null
): MonthlyCashflow[] {
  if (periods.length === 0) return []

  const firstPeriod = periods[0]!
  const lastPeriod = periods[periods.length - 1]!

  const cpiValues: Record<number, number> = {}
  for (let y = firstPeriod.year - 1; y <= lastPeriod.year + 2; y++) {
    cpiValues[y] = property.cpiRate
  }

  const capexMap = new Map<string, number>()
  for (const capex of capexItems) {
    const y = capex.plannedDate.getFullYear()
    const m = capex.plannedDate.getMonth() + 1
    capexMap.set(`${y}-${m}`, (capexMap.get(`${y}-${m}`) ?? 0) + capex.amount)
  }

  // Фиксированные расходы одинаковы для всех периодов
  const opex = (property.opexRate * property.rentableArea) / 12
  const maintenance = (property.maintenanceRate * property.rentableArea) / 12
  const propertyTax = ((property.cadastralValue ?? 0) * property.propertyTaxRate) / 12
  const landTax = ((property.landCadastralValue ?? 0) * property.landTaxRate) / 12

  // V4.5.2: trace фиксированных статей — одинаков для всех периодов, поэтому
  // вычисляем один раз вне цикла.
  const opexTrace: Trace = {
    formula: 'opexRate × rentableArea / 12',
    operands: [
      { label: 'Ставка OPEX',     value: property.opexRate,     unit: '₽' },
      { label: 'Арендуемая площадь', value: property.rentableArea, unit: 'м²' },
    ],
    value: opex,
  }
  const maintenanceTrace: Trace = {
    formula: 'maintenanceRate × rentableArea / 12',
    operands: [
      { label: 'Ставка эксплуатации', value: property.maintenanceRate, unit: '₽' },
      { label: 'Арендуемая площадь',  value: property.rentableArea,    unit: 'м²' },
    ],
    value: maintenance,
  }
  const propertyTaxTrace: Trace = {
    formula: 'cadastralValue × propertyTaxRate / 12',
    operands: [
      { label: 'Кадастровая стоимость здания', value: property.cadastralValue ?? 0, unit: '₽' },
      { label: 'Ставка налога на имущество',   value: property.propertyTaxRate,     unit: '%' },
    ],
    value: propertyTax,
  }
  const landTaxTrace: Trace = {
    formula: 'landCadastralValue × landTaxRate / 12',
    operands: [
      { label: 'Кадастровая стоимость ЗУ', value: property.landCadastralValue ?? 0, unit: '₽' },
      { label: 'Ставка налога на ЗУ',      value: property.landTaxRate,             unit: '%' },
    ],
    value: landTax,
  }

  return periods.map((period) => {
    const key = periodKey(period)
    const periodEnd = lastDayOfMonth(period)

    let rentTotal = 0
    let opexReimbursementTotal = 0
    const tenants: TenantCashflow[] = []

    for (const lease of leases) {
      if (!isLeaseActiveInPeriod(lease, period)) continue

      const indexedRent = calcStepRent(
        lease.baseRent,
        lease.stepRents ?? [],
        lease.startDate,
        periodEnd,
        lease.indexationType,
        lease.indexationRate,
        cpiValues,
        lease.firstIndexationDate ?? null,
        lease.indexationFrequency ?? null
      )
      const rentIncome = (lease.area * indexedRent) / 12
      rentTotal += rentIncome

      const indexedOpexReimb = calcIndexedRent(
        lease.opexReimbursementRate,
        lease.startDate,
        periodEnd,
        lease.opexReimbursementIndexationType,
        lease.opexReimbursementIndexationRate,
        cpiValues,
        lease.opexFirstIndexationDate ?? null,
        lease.opexIndexationFrequency ?? null
      )
      const opexReimbursement = (lease.area * indexedOpexReimb) / 12
      opexReimbursementTotal += opexReimbursement

      tenants.push({
        tenantId: lease.id,
        tenantName: lease.tenantName,
        rentIncome,
        opexReimbursement,
        rentIncomeTrace: {
          formula: 'area × ставка_аренды_в_периоде / 12',
          operands: [
            { label: 'Площадь',                 value: lease.area,    unit: 'м²' },
            { label: 'Ставка аренды в периоде', value: indexedRent,   unit: '₽' },
          ],
          value: rentIncome,
        },
        opexReimbursementTrace: {
          formula: 'area × ставка_возмещения_в_периоде / 12',
          operands: [
            { label: 'Площадь',                     value: lease.area,        unit: 'м²' },
            { label: 'Ставка возмещения OPEX',      value: indexedOpexReimb,  unit: '₽' },
          ],
          value: opexReimbursement,
        },
      })
    }

    const totalIncome = rentTotal + opexReimbursementTotal
    const noi = totalIncome - opex - propertyTax - landTax - maintenance

    // CAPEX = Σ разовых позиций в этом месяце + индексированный резерв (если есть).
    // Trace показывает обе компоненты как отдельные операнды.
    const capexLumpSum = capexMap.get(key) ?? 0
    let capexReserveAmount = 0
    let capexReserveOperand: TraceOperand | null = null
    if (capexReserve && periodEnd >= capexReserve.startDate) {
      const indexedReserveRate = calcIndexedRent(
        capexReserve.ratePerSqm,
        capexReserve.startDate,
        periodEnd,
        capexReserve.indexationType,
        capexReserve.indexationRate,
        cpiValues
      )
      capexReserveAmount = (property.rentableArea * indexedReserveRate) / 12
      capexReserveOperand = {
        label: 'Резерв CAPEX (индексированная ставка × площадь / 12)',
        value: capexReserveAmount,
        unit: '₽',
        trace: {
          formula: 'rentableArea × indexedReserveRate / 12',
          operands: [
            { label: 'Площадь',                       value: property.rentableArea, unit: 'м²' },
            { label: 'Индексированная ставка резерва', value: indexedReserveRate,    unit: '₽' },
          ],
          value: capexReserveAmount,
        },
      }
    }
    const capexAmount = capexLumpSum + capexReserveAmount

    const capexOperands: TraceOperand[] = [
      { label: 'Разовые CAPEX в этом месяце', value: capexLumpSum, unit: '₽' },
    ]
    if (capexReserveOperand) capexOperands.push(capexReserveOperand)
    const capexTrace: Trace = {
      formula: 'Σ разовых CAPEX + резерв CAPEX',
      operands: capexOperands,
      value: capexAmount,
    }

    const fcf = noi - capexAmount

    // NOI и FCF — операнды с подtrace на статьи.
    const noiTrace: Trace = {
      formula: 'totalIncome − opex − propertyTax − landTax − maintenance',
      operands: [
        { label: 'Аренда (Σ по арендаторам)',  value: rentTotal,              unit: '₽' },
        { label: 'Возмещение OPEX (Σ)',        value: opexReimbursementTotal, unit: '₽' },
        { label: 'OPEX',                       value: opex,        unit: '₽', trace: opexTrace },
        { label: 'Налог на имущество',         value: propertyTax, unit: '₽', trace: propertyTaxTrace },
        { label: 'Налог на ЗУ',                value: landTax,     unit: '₽', trace: landTaxTrace },
        { label: 'Эксплуатация',               value: maintenance, unit: '₽', trace: maintenanceTrace },
      ],
      value: noi,
    }
    const fcfTrace: Trace = {
      formula: 'NOI − CAPEX',
      operands: [
        { label: 'NOI',   value: noi,         unit: '₽', trace: noiTrace },
        { label: 'CAPEX', value: capexAmount, unit: '₽', trace: capexTrace },
      ],
      value: fcf,
    }

    return {
      period,
      totalIncome,
      opexReimbursementTotal,
      opex,
      propertyTax,
      landTax,
      maintenance,
      capex: capexAmount,
      noi,
      fcf,
      noiTrace,
      fcfTrace,
      opexTrace,
      maintenanceTrace,
      propertyTaxTrace,
      landTaxTrace,
      capexTrace,
      tenants,
    }
  })
}
