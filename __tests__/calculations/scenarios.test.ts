import {
  calcPropertyAllScenarios,
  calcFundAllScenarios,
} from '../../lib/calculations/scenarios'
import type {
  LeaseInput,
  ScenarioInput,
  MonthlyPeriod,
} from '../../lib/types'
import type { PropertyInputs } from '../../lib/calculations/scenarios'
import type { PropertyExpenseInput } from '../../lib/calculations/cashflow'

// ─── Эталонные объекты ────────────────────────────────────────────────────────
// Аренда: 100 м², 12 000 ₽/м²/год → GRI = 100 000 ₽/мес

const lease: LeaseInput = {
  id: 'l1',
  tenantName: 'Арендатор 1',
  area: 100,
  baseRent: 12_000,
  startDate: new Date('2024-01-01'),
  endDate: new Date('2030-12-31'),
  indexationType: 'NONE',
  indexationRate: null,
  opexReimbursementRate: 0,
  opexReimbursementIndexationType: 'NONE',
  opexReimbursementIndexationRate: null,
  status: 'ACTIVE',
}

// Объект без расходов (чтобы NOI = NRI)
const emptyProperty: PropertyExpenseInput = {
  rentableArea: 0,
  opexRate: 0,
  maintenanceRate: 0,
  cadastralValue: null,
  landCadastralValue: null,
  propertyTaxRate: 0,
  landTaxRate: 0,
}

function makeScenario(
  type: ScenarioInput['scenarioType'],
  vacancyRate: number
): ScenarioInput {
  return {
    scenarioType: type,
    vacancyRate,
    rentGrowthRate: 0,
    opexGrowthRate: 0,
    discountRate: 0.12,
    terminalType: 'EXIT_CAP_RATE',
    exitCapRate: 0.08,
    gordonGrowthRate: null,
    projectionYears: 10,
    cpiRate: 0.07,
  }
}

const baseScenario = makeScenario('BASE', 0.1)   // vacancy 10%
const bullScenario = makeScenario('BULL', 0.03)  // vacancy  3%
const bearScenario = makeScenario('BEAR', 0.25)  // vacancy 25%

const jan2024: MonthlyPeriod = { year: 2024, month: 1 }
const periods: MonthlyPeriod[] = [jan2024]

// ─── calcPropertyAllScenarios ─────────────────────────────────────────────────

describe('calcPropertyAllScenarios', () => {
  it('пустой массив сценариев → пустой объект', () => {
    const result = calcPropertyAllScenarios(emptyProperty, [lease], [], [], periods)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('один сценарий → только его тип присутствует в результате', () => {
    const result = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario], periods)
    expect(result.BASE).toBeDefined()
    expect(result.BULL).toBeUndefined()
    expect(result.BEAR).toBeUndefined()
  })

  it('три сценария → все три типа присутствуют', () => {
    const result = calcPropertyAllScenarios(
      emptyProperty, [lease], [],
      [baseScenario, bullScenario, bearScenario],
      periods
    )
    expect(result.BASE).toBeDefined()
    expect(result.BULL).toBeDefined()
    expect(result.BEAR).toBeDefined()
  })

  it('каждый период имеет правильную длину', () => {
    const p3: MonthlyPeriod[] = [
      { year: 2024, month: 1 },
      { year: 2024, month: 2 },
      { year: 2024, month: 3 },
    ]
    const result = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario, bullScenario], p3)
    expect(result.BASE).toHaveLength(3)
    expect(result.BULL).toHaveLength(3)
  })

  it('BULL (vacancy 3%) → NOI выше BASE (vacancy 10%)', () => {
    const gri = 100 * 12_000 / 12 // 100 000
    const result = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario, bullScenario], periods)
    const baseNOI = result.BASE![0]!.noi
    const bullNOI = result.BULL![0]!.noi
    expect(bullNOI).toBeGreaterThan(baseNOI)
    expect(baseNOI).toBeCloseTo(gri * (1 - 0.10), 2)
    expect(bullNOI).toBeCloseTo(gri * (1 - 0.03), 2)
  })

  it('BEAR (vacancy 25%) → NOI ниже BASE (vacancy 10%)', () => {
    const result = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario, bearScenario], periods)
    expect(result.BEAR![0]!.noi).toBeLessThan(result.BASE![0]!.noi)
  })

  it('разные сценарии не влияют друг на друга (независимость)', () => {
    const resultSingle = calcPropertyAllScenarios(emptyProperty, [lease], [], [bullScenario], periods)
    const resultMulti  = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario, bullScenario], periods)
    expect(resultSingle.BULL![0]!.noi).toBeCloseTo(resultMulti.BULL![0]!.noi, 6)
  })

  it('opexRate объекта уменьшает NOI одинаково во всех сценариях', () => {
    // opexRate=1200 ₽/м²/год × 100 м² / 12 = 10 000/мес
    const propWithOpex: PropertyExpenseInput = {
      ...emptyProperty,
      rentableArea: 100,
      opexRate: 1_200,
    }
    const noOpex   = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario], periods)
    const withOpex = calcPropertyAllScenarios(propWithOpex,  [lease], [], [baseScenario], periods)
    expect(withOpex.BASE![0]!.noi).toBeCloseTo(noOpex.BASE![0]!.noi - 10_000, 2)
  })
})

// ─── calcFundAllScenarios ─────────────────────────────────────────────────────

function makeProp(scenarios: ScenarioInput[]): PropertyInputs {
  return { property: emptyProperty, leases: [lease], capexItems: [], scenarios }
}

describe('calcFundAllScenarios', () => {
  it('пустой массив объектов → пустой результат', () => {
    const result = calcFundAllScenarios([], 0, periods)
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('один объект с BASE → только BASE в результате', () => {
    const result = calcFundAllScenarios([makeProp([baseScenario])], 0, periods)
    expect(result.BASE).toBeDefined()
    expect(result.BULL).toBeUndefined()
    expect(result.BEAR).toBeUndefined()
  })

  it('один объект с BASE и BULL → оба типа в результате', () => {
    const result = calcFundAllScenarios([makeProp([baseScenario, bullScenario])], 0, periods)
    expect(result.BASE).toBeDefined()
    expect(result.BULL).toBeDefined()
  })

  it('NOI фонда = сумма NOI объектов', () => {
    const single = calcFundAllScenarios([makeProp([baseScenario])], 0, periods)
    const double = calcFundAllScenarios([makeProp([baseScenario]), makeProp([baseScenario])], 0, periods)
    expect(double.BASE![0]!.noi).toBeCloseTo(single.BASE![0]!.noi * 2, 6)
  })

  it('расходы фонда уменьшают FCF', () => {
    const annualExpenses = 1_200_000 // 100 000/мес
    const noExp   = calcFundAllScenarios([makeProp([baseScenario])], 0, periods)
    const withExp = calcFundAllScenarios([makeProp([baseScenario])], annualExpenses, periods)
    expect(withExp.BASE![0]!.fcf).toBeCloseTo(noExp.BASE![0]!.fcf - 100_000, 2)
  })

  it('fallback: объект без BULL → использует BASE при агрегации BULL', () => {
    const prop1 = makeProp([baseScenario, bullScenario])
    const prop2 = makeProp([baseScenario])
    const result = calcFundAllScenarios([prop1, prop2], 0, periods)
    expect(result.BULL).toBeDefined()
    const prop1Bull = calcPropertyAllScenarios(emptyProperty, [lease], [], [bullScenario], periods).BULL![0]!.noi
    const prop2Base = calcPropertyAllScenarios(emptyProperty, [lease], [], [baseScenario], periods).BASE![0]!.noi
    expect(result.BULL![0]!.noi).toBeCloseTo(prop1Bull + prop2Base, 2)
  })

  it('BULL NOI фонда > BASE NOI когда оба объекта имеют оба сценария', () => {
    const prop = makeProp([baseScenario, bullScenario])
    const result = calcFundAllScenarios([prop], 0, periods)
    expect(result.BULL![0]!.noi).toBeGreaterThan(result.BASE![0]!.noi)
  })

  it('объект без какого-либо сценария пропускается', () => {
    const prop1 = makeProp([baseScenario])
    const prop2 = makeProp([])
    const single    = calcFundAllScenarios([prop1], 0, periods)
    const withEmpty = calcFundAllScenarios([prop1, prop2], 0, periods)
    expect(withEmpty.BASE![0]!.noi).toBeCloseTo(single.BASE![0]!.noi, 6)
  })
})
