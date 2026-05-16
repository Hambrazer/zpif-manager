import { calcPropertyCashflow, type PropertyExpenseInput } from '../../lib/calculations/cashflow'
import type {
  LeaseInput,
  CapexInput,
  CapexReserveInput,
  MonthlyPeriod,
} from '../../lib/types'

// ─── Эталонные объекты ────────────────────────────────────────────────────────

// Объект: 500 м² GLA, без расходов (нулевые ставки для изоляции доходных тестов)
const baseProperty: PropertyExpenseInput = {
  rentableArea: 500,
  opexRate: 0,
  maintenanceRate: 0,
  cadastralValue: null,
  landCadastralValue: null,
  propertyTaxRate: 0,
  landTaxRate: 0,
  cpiRate: 0.07,
}

// Аренда: 100 м², 10 000 ₽/м²/год, без индексации, без возмещения OPEX
const baseLease: LeaseInput = {
  id: 'l1',
  tenantName: 'Арендатор 1',
  area: 100,
  baseRent: 10_000,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2026-12-31'),
  indexationType: 'NONE',
  indexationRate: null,
  opexReimbursementRate: 0,
  opexReimbursementIndexationType: 'NONE',
  opexReimbursementIndexationRate: null,
  status: 'ACTIVE',
}

const jan2024: MonthlyPeriod = { year: 2024, month: 1 }
const dec2024: MonthlyPeriod = { year: 2024, month: 12 }
const jan2025: MonthlyPeriod = { year: 2025, month: 1 }

// ─── Базовый расчёт доходов ───────────────────────────────────────────────────

describe('базовый расчёт доходов (NONE-индексация, без вакансии)', () => {
  // totalIncome = area × baseRent / 12 = 100 × 10 000 / 12 = 83 333.33
  const [row] = calcPropertyCashflow(baseProperty, [baseLease], [], [jan2024])!

  it('totalIncome = area × baseRent / 12', () => {
    expect(row!.totalIncome).toBeCloseTo(83_333.33, 2)
  })

  it('opexReimbursementTotal = 0 при нулевой ставке возмещения', () => {
    expect(row!.opexReimbursementTotal).toBe(0)
  })

  it('noi = totalIncome (при нулевых расходах объекта)', () => {
    expect(row!.noi).toBeCloseTo(83_333.33, 2)
  })

  it('fcf = noi − capex (capex=0 → fcf = noi)', () => {
    expect(row!.fcf).toBeCloseTo(83_333.33, 2)
  })

  it('period совпадает с переданным', () => {
    expect(row!.period).toEqual(jan2024)
  })
})

// ─── Возмещение OPEX арендатором ─────────────────────────────────────────────

describe('возмещение OPEX арендатором', () => {
  // opexReimbursementRate = 1 200 ₽/м²/год
  // возмещение = 100 × 1 200 / 12 = 10 000 (без поправки на вакансию)
  const leaseWithOpex: LeaseInput = { ...baseLease, opexReimbursementRate: 1_200 }

  it('opexReimbursementTotal = area × rate / 12', () => {
    const [row] = calcPropertyCashflow(baseProperty, [leaseWithOpex], [], [jan2024])!
    expect(row!.opexReimbursementTotal).toBeCloseTo(10_000, 2)
  })

  it('noi включает opexReimbursementTotal (расходы объекта = 0)', () => {
    const [row] = calcPropertyCashflow(baseProperty, [leaseWithOpex], [], [jan2024])!
    // totalIncome = 83 333.33; opexReimbTotal = 10 000; расходы = 0
    expect(row!.noi).toBeCloseTo(83_333.33 + 10_000, 2)
  })
})

// ─── Расходы объекта ──────────────────────────────────────────────────────────

describe('расходы объекта', () => {
  // opex: 500 × 1 200 / 12 = 50 000/мес
  // maintenance: 500 × 600 / 12 = 25 000/мес
  // propertyTax: 120 000 000 × 0.02 / 12 = 200 000/мес
  // landTax: 60 000 000 × 0.015 / 12 = 75 000/мес
  const expProp: PropertyExpenseInput = {
    rentableArea: 500,
    opexRate: 1_200,
    maintenanceRate: 600,
    cadastralValue: 120_000_000,
    landCadastralValue: 60_000_000,
    propertyTaxRate: 0.02,
    landTaxRate: 0.015,
    cpiRate: 0.07,
  }

  it('opex = opexRate × rentableArea / 12', () => {
    const [row] = calcPropertyCashflow(expProp, [], [], [jan2024])!
    expect(row!.opex).toBeCloseTo(50_000, 2)
  })

  it('maintenance = maintenanceRate × rentableArea / 12', () => {
    const [row] = calcPropertyCashflow(expProp, [], [], [jan2024])!
    expect(row!.maintenance).toBeCloseTo(25_000, 2)
  })

  it('propertyTax = cadastralValue × propertyTaxRate / 12', () => {
    const [row] = calcPropertyCashflow(expProp, [], [], [jan2024])!
    expect(row!.propertyTax).toBeCloseTo(200_000, 2)
  })

  it('landTax = landCadastralValue × landTaxRate / 12', () => {
    const [row] = calcPropertyCashflow(expProp, [], [], [jan2024])!
    expect(row!.landTax).toBeCloseTo(75_000, 2)
  })

  it('нет кадастровых стоимостей → налоги = 0', () => {
    const [row] = calcPropertyCashflow(baseProperty, [], [], [jan2024])!
    expect(row!.propertyTax).toBe(0)
    expect(row!.landTax).toBe(0)
  })
})

// ─── NOI (интеграционный) ─────────────────────────────────────────────────────

describe('NOI = totalIncome − opex − propertyTax − landTax − maintenance', () => {
  // Аренда: 100 м², 12 000 ₽/м²/год → rent = 100 000
  // Возмещение OPEX: 1 200 ₽/м²/год → opexReimbTotal = 10 000
  // opex: 500 × 1 200 / 12 = 50 000
  // maintenance: 500 × 600 / 12 = 25 000
  // NOI = 100 000 + 10 000 − 50 000 − 25 000 = 35 000
  const lease: LeaseInput = { ...baseLease, baseRent: 12_000, opexReimbursementRate: 1_200 }
  const prop: PropertyExpenseInput = {
    rentableArea: 500,
    opexRate: 1_200,
    maintenanceRate: 600,
    cadastralValue: null,
    landCadastralValue: null,
    propertyTaxRate: 0,
    landTaxRate: 0,
    cpiRate: 0.07,
  }
  const [row] = calcPropertyCashflow(prop, [lease], [], [jan2024])!

  it('NOI = 35 000', () => {
    expect(row!.noi).toBeCloseTo(35_000, 2)
  })
})

// ─── CAPEX ────────────────────────────────────────────────────────────────────

describe('CAPEX', () => {
  const capex: CapexInput = { id: 'c1', amount: 500_000, plannedDate: new Date('2024-06-15') }
  const jun2024: MonthlyPeriod = { year: 2024, month: 6 }

  it('CAPEX в месяце плановой даты: capex = 500 000', () => {
    const [row] = calcPropertyCashflow(baseProperty, [], [capex], [jun2024])!
    expect(row!.capex).toBe(500_000)
  })

  it('CAPEX не влияет на NOI', () => {
    const [withCapex] = calcPropertyCashflow(baseProperty, [], [capex], [jun2024])!
    const [noCapex] = calcPropertyCashflow(baseProperty, [], [], [jun2024])!
    expect(withCapex!.noi).toBeCloseTo(noCapex!.noi, 2)
  })

  it('FCF = NOI − CAPEX', () => {
    const [row] = calcPropertyCashflow(baseProperty, [baseLease], [capex], [jun2024])!
    expect(row!.fcf).toBeCloseTo(row!.noi - 500_000, 2)
  })

  it('CAPEX = 0 в других месяцах', () => {
    const jul2024: MonthlyPeriod = { year: 2024, month: 7 }
    const [row] = calcPropertyCashflow(baseProperty, [], [capex], [jul2024])!
    expect(row!.capex).toBe(0)
  })

  it('несколько CAPEX в одном месяце суммируются', () => {
    const capex2: CapexInput = { id: 'c2', amount: 300_000, plannedDate: new Date('2024-06-01') }
    const [row] = calcPropertyCashflow(baseProperty, [], [capex, capex2], [jun2024])!
    expect(row!.capex).toBe(800_000)
  })
})

// ─── Периодический резерв CAPEX ──────────────────────────────────────────────

describe('периодический резерв CAPEX (CapexReserve)', () => {
  const reserve: CapexReserveInput = {
    ratePerSqm: 240,                              // 500 × 240 / 12 = 10 000/мес
    startDate: new Date('2024-01-01'),
    indexationType: 'NONE',
    indexationRate: null,
  }

  it('NONE-индексация: capex = rentableArea × rate / 12', () => {
    const [row] = calcPropertyCashflow(baseProperty, [], [], [jan2024], reserve)!
    expect(row!.capex).toBeCloseTo(10_000, 2)
  })

  it('Резерв до startDate не начисляется', () => {
    const future: CapexReserveInput = { ...reserve, startDate: new Date('2024-06-01') }
    const [row] = calcPropertyCashflow(baseProperty, [], [], [jan2024], future)!
    expect(row!.capex).toBe(0)
  })

  it('Разовый CAPEX суммируется поверх резерва', () => {
    const itm: CapexInput = { id: 'c1', amount: 500_000, plannedDate: new Date('2024-01-15') }
    const [row] = calcPropertyCashflow(baseProperty, [], [itm], [jan2024], reserve)!
    expect(row!.capex).toBeCloseTo(510_000, 2)
  })

  it('FIXED 5%: до 1-й годовщины резерв = базовой ставке', () => {
    const r: CapexReserveInput = { ...reserve, indexationType: 'FIXED', indexationRate: 0.05 }
    const [row] = calcPropertyCashflow(baseProperty, [], [], [dec2024], r)!
    expect(row!.capex).toBeCloseTo(10_000, 2)
  })

  it('FIXED 5%: с 1-й годовщины (Jan 2025) резерв = 10 500', () => {
    const r: CapexReserveInput = { ...reserve, indexationType: 'FIXED', indexationRate: 0.05 }
    const [row] = calcPropertyCashflow(baseProperty, [], [], [jan2025], r)!
    // 500 × (240 × 1.05) / 12 = 10 500
    expect(row!.capex).toBeCloseTo(10_500, 2)
  })

  it('CPI 7%: с 1-й годовщины резерв учитывает ИПЦ', () => {
    const r: CapexReserveInput = { ...reserve, indexationType: 'CPI', indexationRate: null }
    const [row] = calcPropertyCashflow(baseProperty, [], [], [jan2025], r)!
    // 500 × (240 × 1.07) / 12 = 10 700
    expect(row!.capex).toBeCloseTo(10_700, 2)
  })

  it('FCF = NOI − (CapexItem + CapexReserve)', () => {
    const itm: CapexInput = { id: 'c1', amount: 500_000, plannedDate: new Date('2024-01-15') }
    const [row] = calcPropertyCashflow(baseProperty, [baseLease], [itm], [jan2024], reserve)!
    expect(row!.fcf).toBeCloseTo(row!.noi - 510_000, 2)
  })

  it('Без резерва (capexReserve = null): поведение прежнее', () => {
    const [withNull] = calcPropertyCashflow(baseProperty, [], [], [jan2024], null)!
    const [withoutArg] = calcPropertyCashflow(baseProperty, [], [], [jan2024])!
    expect(withNull!.capex).toBe(withoutArg!.capex)
  })
})

// ─── Детализация по арендаторам (tenants) ─────────────────────────────────────

describe('tenants: детализация по арендаторам', () => {
  it('один арендатор: tenants.length = 1', () => {
    const [row] = calcPropertyCashflow(baseProperty, [baseLease], [], [jan2024])!
    expect(row!.tenants).toHaveLength(1)
  })

  it('tenantId = lease.id, tenantName = lease.tenantName', () => {
    const [row] = calcPropertyCashflow(baseProperty, [baseLease], [], [jan2024])!
    expect(row!.tenants[0]!.tenantId).toBe('l1')
    expect(row!.tenants[0]!.tenantName).toBe('Арендатор 1')
  })

  it('rentIncome = area × rent / 12 (без вакансии)', () => {
    const [row] = calcPropertyCashflow(baseProperty, [baseLease], [], [jan2024])!
    // 100 × 10 000 / 12 = 83 333.33
    expect(row!.tenants[0]!.rentIncome).toBeCloseTo(83_333.33, 2)
  })

  it('opexReimbursement = area × rate / 12', () => {
    const lease: LeaseInput = { ...baseLease, opexReimbursementRate: 1_200 }
    const [row] = calcPropertyCashflow(baseProperty, [lease], [], [jan2024])!
    // 100 × 1 200 / 12 = 10 000
    expect(row!.tenants[0]!.opexReimbursement).toBeCloseTo(10_000, 2)
  })

  it('два арендатора: tenants.length = 2, Σ rentIncome = totalIncome при opexReimb=0', () => {
    const lease2: LeaseInput = { ...baseLease, id: 'l2', tenantName: 'Арендатор 2', area: 200 }
    const [row] = calcPropertyCashflow(baseProperty, [baseLease, lease2], [], [jan2024])!
    expect(row!.tenants).toHaveLength(2)
    const totalRentIncome = row!.tenants.reduce((s, t) => s + t.rentIncome, 0)
    expect(totalRentIncome).toBeCloseTo(row!.totalIncome, 2)
  })

  it('истёкший договор не попадает в tenants', () => {
    const expired: LeaseInput = { ...baseLease, status: 'EXPIRED' }
    const [row] = calcPropertyCashflow(baseProperty, [expired], [], [jan2024])!
    expect(row!.tenants).toHaveLength(0)
  })
})

// ─── Пустой ввод ─────────────────────────────────────────────────────────────

describe('пустые входные данные', () => {
  it('возвращает [] при periods = []', () => {
    expect(calcPropertyCashflow(baseProperty, [baseLease], [], [])).toEqual([])
  })

  it('totalIncome = 0 при отсутствии договоров', () => {
    const [row] = calcPropertyCashflow(baseProperty, [], [], [jan2024])!
    expect(row!.totalIncome).toBe(0)
  })
})

// ─── Статус и активность договора ────────────────────────────────────────────

describe('статус и активность договора', () => {
  it('EXPIRED: договор не участвует в доходах', () => {
    const expired: LeaseInput = { ...baseLease, status: 'EXPIRED' }
    const [row] = calcPropertyCashflow(baseProperty, [expired], [], [jan2024])!
    expect(row!.totalIncome).toBe(0)
  })

  it('TERMINATING: договор участвует в доходах', () => {
    const terminating: LeaseInput = { ...baseLease, status: 'TERMINATING' }
    const [row] = calcPropertyCashflow(baseProperty, [terminating], [], [jan2024])!
    expect(row!.totalIncome).toBeCloseTo(83_333.33, 2)
  })

  it('договор начинается в следующем месяце: totalIncome = 0', () => {
    const future: LeaseInput = { ...baseLease, startDate: new Date('2024-02-01') }
    const [row] = calcPropertyCashflow(baseProperty, [future], [], [jan2024])!
    expect(row!.totalIncome).toBe(0)
  })

  it('договор закончился в прошлом месяце: totalIncome = 0', () => {
    const past: LeaseInput = { ...baseLease, endDate: new Date('2024-03-31') }
    const apr2024: MonthlyPeriod = { year: 2024, month: 4 }
    const [row] = calcPropertyCashflow(baseProperty, [past], [], [apr2024])!
    expect(row!.totalIncome).toBe(0)
  })

  it('договор заканчивается внутри месяца: учитывается полностью', () => {
    const midMonth: LeaseInput = { ...baseLease, endDate: new Date('2024-01-15') }
    const [row] = calcPropertyCashflow(baseProperty, [midMonth], [], [jan2024])!
    expect(row!.totalIncome).toBeCloseTo(83_333.33, 2)
  })
})

// ─── Индексация аренды ────────────────────────────────────────────────────────

describe('индексация базовой аренды', () => {
  it('FIXED 5%: применяется с 1-й годовщины (Jan 2025)', () => {
    const lease: LeaseInput = { ...baseLease, indexationType: 'FIXED', indexationRate: 0.05 }
    const [row] = calcPropertyCashflow(baseProperty, [lease], [], [jan2025])!
    // 100 × 10 500 / 12 = 87 500
    expect(row!.totalIncome).toBeCloseTo(87_500, 2)
  })

  it('FIXED 5%: до первой годовщины (Dec 2024) ставка не изменилась', () => {
    const lease: LeaseInput = { ...baseLease, indexationType: 'FIXED', indexationRate: 0.05 }
    const [row] = calcPropertyCashflow(baseProperty, [lease], [], [dec2024])!
    expect(row!.totalIncome).toBeCloseTo(83_333.33, 2)
  })

  it('CPI 7%: применяется с 1-й годовщины (Jan 2025)', () => {
    const lease: LeaseInput = { ...baseLease, indexationType: 'CPI' }
    const [row] = calcPropertyCashflow(baseProperty, [lease], [], [jan2025])!
    // 100 × 10 700 / 12 = 89 166.67
    expect(row!.totalIncome).toBeCloseTo(89_166.67, 2)
  })
})

// ─── Индексация возмещения OPEX ───────────────────────────────────────────────

describe('индексация возмещения OPEX', () => {
  it('FIXED 5%: возмещение OPEX растёт с годовщины (Jan 2025)', () => {
    const lease: LeaseInput = {
      ...baseLease,
      opexReimbursementRate: 1_200,
      opexReimbursementIndexationType: 'FIXED',
      opexReimbursementIndexationRate: 0.05,
    }
    const [row] = calcPropertyCashflow(baseProperty, [lease], [], [jan2025])!
    // 100 × (1 200 × 1.05) / 12 = 10 500
    expect(row!.opexReimbursementTotal).toBeCloseTo(10_500, 2)
  })
})

// ─── Расходы объекта фиксированы (без индексации) ────────────────────────────

describe('расходы объекта фиксированы', () => {
  const prop: PropertyExpenseInput = {
    rentableArea: 500,
    opexRate: 1_200,       // base: 500 × 1 200 / 12 = 50 000/мес
    maintenanceRate: 600,
    cadastralValue: null,
    landCadastralValue: null,
    propertyTaxRate: 0,
    landTaxRate: 0,
    cpiRate: 0.07,
  }

  it('opex в Dec 2024 = базовой ставке (50 000)', () => {
    const result = calcPropertyCashflow(prop, [], [], [jan2024, dec2024])
    expect(result[1]!.opex).toBeCloseTo(50_000, 2)
  })

  it('opex в Jan 2025 = той же ставке (расходы не индексируются)', () => {
    const result = calcPropertyCashflow(prop, [], [], [jan2024, jan2025])
    expect(result[1]!.opex).toBeCloseTo(50_000, 2)
  })
})

// ─── Несколько периодов ───────────────────────────────────────────────────────

describe('несколько периодов', () => {
  const periods: MonthlyPeriod[] = [
    { year: 2024, month: 1 },
    { year: 2024, month: 2 },
    { year: 2024, month: 3 },
  ]

  it('возвращает столько строк, сколько периодов', () => {
    const result = calcPropertyCashflow(baseProperty, [baseLease], [], periods)
    expect(result).toHaveLength(3)
  })

  it('period в каждой строке совпадает с переданным', () => {
    const result = calcPropertyCashflow(baseProperty, [baseLease], [], periods)
    expect(result[0]!.period).toEqual({ year: 2024, month: 1 })
    expect(result[1]!.period).toEqual({ year: 2024, month: 2 })
    expect(result[2]!.period).toEqual({ year: 2024, month: 3 })
  })

  it('GRI одинаков во всех трёх месяцах (NONE-индексация)', () => {
    const result = calcPropertyCashflow(baseProperty, [baseLease], [], periods)
    expect(result[0]!.totalIncome).toBeCloseTo(result[1]!.totalIncome, 2)
    expect(result[1]!.totalIncome).toBeCloseTo(result[2]!.totalIncome, 2)
  })
})

// ─── V4.2.4: горизонт CF не зависит от фонда (projectionYears) ────────────────

describe('горизонт CF на projectionYears (V4.2.1)', () => {
  // Объект с projectionYears=10 (120 месяцев), аренда живёт 2024-01..2026-12 (36 мес).
  // Имитируем: фонд закрывается на 60-м месяце (Dec 2028) — в прежней реализации
  // CF объекта урезался до 60 строк. Теперь функция должна вернуть все 120 строк
  // и продолжать считать NOI в каждом из них (после окончания договоров — по сути 0).
  const periods120: MonthlyPeriod[] = Array.from({ length: 120 }, (_, i) => ({
    year: 2024 + Math.floor(i / 12),
    month: (i % 12) + 1,
  }))

  it('возвращает 120 строк (projectionYears=10), не урезается на горизонте фонда', () => {
    const result = calcPropertyCashflow(baseProperty, [baseLease], [], periods120)
    expect(result).toHaveLength(120)
  })

  it('NOI в месяце на 60-м (Dec 2028, после endDate условного фонда) считается, не «обнуляется»', () => {
    // Аренда закончилась после месяца 36 (Dec 2026). На 60-м месяце аренды нет,
    // но функция корректно отдаёт строку с rentIncome=0 — а не отсутствие строки.
    const result = calcPropertyCashflow(baseProperty, [baseLease], [], periods120)
    const dec2028 = result[59]!
    expect(dec2028.period).toEqual({ year: 2028, month: 12 })
    expect(dec2028.totalIncome).toBe(0)        // аренда уже закончилась
    expect(dec2028.noi).toBe(0)                // расходов у baseProperty тоже нет
  })

  it('NOI в месяцах активной аренды положителен на полном горизонте 120 месяцев', () => {
    const result = calcPropertyCashflow(baseProperty, [baseLease], [], periods120)
    // Месяц 1 (Jan 2024) и месяц 36 (Dec 2026) — оба внутри срока аренды
    expect(result[0]!.totalIncome).toBeGreaterThan(0)
    expect(result[35]!.totalIncome).toBeGreaterThan(0)
  })
})

// ─── V4.5.8: trace инварианты для calcPropertyCashflow ────────────────────────

describe('trace в calcPropertyCashflow (V4.5.2)', () => {
  const propWithCosts = {
    rentableArea: 500,
    opexRate: 1_200,
    maintenanceRate: 600,
    cadastralValue: 100_000_000,
    landCadastralValue: 20_000_000,
    propertyTaxRate: 0.022,
    landTaxRate: 0.003,
    cpiRate: 0.07,
  }

  const [row] = calcPropertyCashflow(propWithCosts, [baseLease], [], [jan2024])!

  it('каждое trace-поле существует и trace.value === значение поля', () => {
    expect(row!.opexTrace?.value).toBeCloseTo(row!.opex, 6)
    expect(row!.maintenanceTrace?.value).toBeCloseTo(row!.maintenance, 6)
    expect(row!.propertyTaxTrace?.value).toBeCloseTo(row!.propertyTax, 6)
    expect(row!.landTaxTrace?.value).toBeCloseTo(row!.landTax, 6)
    expect(row!.capexTrace?.value).toBeCloseTo(row!.capex, 6)
    expect(row!.noiTrace?.value).toBeCloseTo(row!.noi, 6)
    expect(row!.fcfTrace?.value).toBeCloseTo(row!.fcf, 6)
  })

  it('tenants[].rentIncomeTrace и opexReimbursementTrace соответствуют значениям', () => {
    const tenant = row!.tenants[0]!
    expect(tenant.rentIncomeTrace?.value).toBeCloseTo(tenant.rentIncome, 6)
    expect(tenant.opexReimbursementTrace?.value).toBeCloseTo(tenant.opexReimbursement, 6)
  })

  it('noiTrace раскрывается до листьев через под-traces расходных статей', () => {
    const noi = row!.noiTrace!
    expect(noi.formula).toContain('totalIncome')
    // OPEX/налоги/эксплуатация — операнды с под-trace
    const opexOperand = noi.operands.find(o => o.label === 'OPEX')!
    expect(opexOperand.trace?.value).toBeCloseTo(row!.opex, 6)
    expect(opexOperand.trace?.formula).toContain('opexRate')
  })

  it('fcfTrace = NOI − CAPEX, оба операнда раскрываемы', () => {
    const fcf = row!.fcfTrace!
    expect(fcf.formula).toContain('NOI')
    expect(fcf.operands).toHaveLength(2)
    expect(fcf.operands[0]!.trace?.value).toBeCloseTo(row!.noi, 6)
    expect(fcf.operands[1]!.trace?.value).toBeCloseTo(row!.capex, 6)
  })
})
