import type {
  LeaseInput,
  CapexInput,
  ScenarioInput,
  ScenarioType,
  MonthlyPeriod,
  MonthlyCashflow,
  ScenarioResults,
} from '../types'
import { calcPropertyCashflow, type PropertyExpenseInput } from './cashflow'
import { calcFundCashflow } from './metrics'

export type PropertyInputs = {
  property: PropertyExpenseInput
  leases: LeaseInput[]
  capexItems: CapexInput[]
  scenarios: ScenarioInput[]
}

/**
 * Вычисляет помесячный CF объекта для каждого переданного сценария.
 * Ключи результата — только те типы сценариев, которые есть в scenarios[].
 */
export function calcPropertyAllScenarios(
  property: PropertyExpenseInput,
  leases: LeaseInput[],
  capexItems: CapexInput[],
  scenarios: ScenarioInput[],
  periods: MonthlyPeriod[]
): ScenarioResults {
  const result: ScenarioResults = {}
  for (const scenario of scenarios) {
    result[scenario.scenarioType] = calcPropertyCashflow(property, leases, capexItems, scenario, periods)
  }
  return result
}

/**
 * Вычисляет помесячный CF фонда для каждого сценария, представленного
 * хотя бы в одном объекте. Если объект не имеет запрошенного типа —
 * используется BASE-сценарий этого объекта как fallback.
 * Объекты без каких-либо сценариев пропускаются.
 */
export function calcFundAllScenarios(
  properties: PropertyInputs[],
  annualFundExpenses: number,
  periods: MonthlyPeriod[]
): ScenarioResults {
  const availableTypes = new Set<ScenarioType>()
  for (const p of properties) {
    for (const s of p.scenarios) {
      availableTypes.add(s.scenarioType as ScenarioType)
    }
  }

  const result: ScenarioResults = {}
  for (const scenarioType of availableTypes) {
    const propertyCashflows: MonthlyCashflow[][] = []
    for (const propertyInputs of properties) {
      const scenario =
        propertyInputs.scenarios.find((s) => s.scenarioType === scenarioType) ??
        propertyInputs.scenarios.find((s) => s.scenarioType === 'BASE')
      if (!scenario) continue
      propertyCashflows.push(
        calcPropertyCashflow(propertyInputs.property, propertyInputs.leases, propertyInputs.capexItems, scenario, periods)
      )
    }
    if (propertyCashflows.length > 0) {
      result[scenarioType] = calcFundCashflow(propertyCashflows, annualFundExpenses, [], periods)
    }
  }
  return result
}
