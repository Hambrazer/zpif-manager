// ─── Перечисления (строковые типы, зеркало Prisma enum) ──────────────────────

export type IndexationType = 'CPI' | 'FIXED' | 'NONE'
export type AmortizationType = 'ANNUITY' | 'BULLET' | 'LINEAR'
export type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'
export type DistributionPeriodicity = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

// ─── Периоды ─────────────────────────────────────────────────────────────────

export type MonthlyPeriod = {
  year: number
  month: number // 1–12
}

// ─── Входные данные для расчётов ─────────────────────────────────────────────

export type LeaseInput = {
  id: string
  tenantName: string
  area: number
  baseRent: number                              // ₽/м²/год
  startDate: Date
  endDate: Date
  indexationType: IndexationType
  indexationRate: number | null
  firstIndexationDate?: Date | null             // первая дата индексации аренды
  indexationFrequency?: number | null           // частота в месяцах: 3 / 6 / 12
  opexReimbursementRate: number                 // ₽/м²/год (0 если нет возмещения)
  opexReimbursementIndexationType: IndexationType
  opexReimbursementIndexationRate: number | null
  opexFirstIndexationDate?: Date | null         // первая дата индексации возмещения OPEX
  opexIndexationFrequency?: number | null       // частота в месяцах: 3 / 6 / 12
  status: LeaseStatus
}

export type CapexInput = {
  id: string
  amount: number                                // ₽
  plannedDate: Date
}

export type DebtInput = {
  id: string
  principalAmount: number
  interestRate: number                          // % годовых, в долях (0.15 = 15%)
  startDate: Date
  endDate: Date
  amortizationType: AmortizationType
}

// v2: полные данные объекта для расчётов (включает новые поля схемы)
export type PropertyInput = {
  id: string
  rentableArea: number                          // м²
  cadastralValue: number | null                 // кадастровая стоимость здания, ₽
  landCadastralValue: number | null             // кадастровая стоимость ЗУ, ₽
  propertyTaxRate: number                       // ставка налога на имущество, в долях
  landTaxRate: number                           // ставка налога на ЗУ, в долях
  opexRate: number                              // ₽/м²/год (индексируется на ИПЦ)
  maintenanceRate: number                       // эксплуатационные расходы, ₽/м²/год
  acquisitionPrice: number | null               // цена приобретения, ₽
  purchaseDate: Date | null                     // дата покупки объекта фондом
  saleDate: Date | null                         // дата продажи объекта фондом
  exitCapRate: number | null                    // ставка капитализации при продаже, в долях
  wacc: number                                  // ставка дисконтирования, в долях
  leases: LeaseInput[]
  capexItems: CapexInput[]
}

// v2: данные фонда для расчётов
export type FundInput = {
  id: string
  startDate: Date
  endDate: Date
  totalEmission: number                         // объём эмиссии, ₽
  nominalUnitPrice: number                      // номинальная стоимость пая, ₽
  totalUnits: number                            // totalEmission / nominalUnitPrice
  managementFeeRate: number                     // % от СЧА/год, в долях
  fundExpensesRate: number                      // % от СЧА/год, в долях
  upfrontFeeRate: number                        // в долях
  successFeeOperational: number                 // % от выплат, в долях
  successFeeExit: number                        // % от прироста СЧА, в долях
  distributionPeriodicity: DistributionPeriodicity
  properties: PropertyInput[]
  fundDebts: DebtInput[]
}

// ─── Денежный поток объекта ───────────────────────────────────────────────────

// v2: детализация по арендатору за один месяц
export type TenantCashflow = {
  tenantId: string
  tenantName: string
  rentIncome: number                            // доход от аренды, ₽/мес
  opexReimbursement: number                     // возмещение OPEX, ₽/мес
}

export type MonthlyCashflow = {
  period: MonthlyPeriod
  gri: number                                   // Gross Rental Income (только аренда, до вакансии)
  vacancy: number                               // потери от вакансии (на аренду)
  nri: number                                   // Net Rental Income = gri - vacancy
  opexReimbursementTotal: number               // суммарное возмещение OPEX от арендаторов (нетто)
  opex: number                                  // OPEX (opexRate × rentableArea / 12, индексируется)
  propertyTax: number                           // налог на имущество, ₽/мес
  landTax: number                               // налог на ЗУ, ₽/мес
  maintenance: number                           // эксплуатационные расходы, ₽/мес
  capex: number                                 // CAPEX
  noi: number                                   // Net Operating Income
  fcf: number                                   // Free Cash Flow = noi - capex
  tenants: TenantCashflow[]                     // детализация по арендаторам
}

// ─── Кэш-ролл фонда ──────────────────────────────────────────────────────────

// v2: строка помесячного кэш-ролла фонда
export type MonthlyCashRoll = {
  period: MonthlyPeriod
  cashBegin: number
  // Притоки
  noiInflow: number                             // NOI от объектов
  disposalInflow: number                        // выручка от продаж объектов
  emissionInflow: number                        // привлечение капитала (t=0)
  // Оттоки
  acquisitionOutflow: number                    // покупки объектов
  upfrontFeeOutflow: number                     // Upfront fee (t=0)
  managementFeeOutflow: number
  fundExpensesOutflow: number
  successFeeOperationalOutflow: number
  successFeeExitOutflow: number                 // разово в endDate
  debtServiceOutflow: number
  distributionOutflow: number                   // выплаты пайщикам
  // Итог
  cashEnd: number
}

// ─── СЧА и РСП ───────────────────────────────────────────────────────────────

// v2: значение СЧА/РСП за один период
export type NAVResult = {
  period: MonthlyPeriod
  propertyValue: number                         // Σ (NOI_12мес / exitCapRate) по объектам
  cash: number                                  // свободный кэш на фонде
  totalAssets: number                           // propertyValue + cash
  debtBalance: number                           // остаток долга фонда
  nav: number                                   // СЧА = totalAssets − debtBalance
  rsp: number                                   // РСП = nav / totalUnits
}

// ─── Денежный поток пайщика (для IRR) ────────────────────────────────────────

// v2: помесячный денежный поток пайщика для расчёта IRR
export type InvestorCashflow = {
  period: MonthlyPeriod
  cashflow: number   // < 0 — вложение (t=0), > 0 — выплата или финальный возврат
}

// ─── DCF ─────────────────────────────────────────────────────────────────────

export type DCFResult = {
  cashflows: MonthlyCashflow[]
  terminalValue: number
  npv: number
  irr: number                                   // годовой IRR, в долях (0.142 = 14.2%)
  discountRate: number
}

// ─── Метрики фонда ────────────────────────────────────────────────────────────

export type FundMetrics = {
  noi: number                                   // годовой NOI фонда, ₽
  fcf: number                                   // годовой FCF фонда, ₽
  capRate: number                               // Cap Rate, в долях
  irr: number                                   // IRR пайщика, в долях
  nav: number                                   // СЧА, ₽
  navPerUnit: number                            // РСП (стоимость пая), ₽
}

// ─── Результат графика долга ──────────────────────────────────────────────────

export type MonthlyDebtPayment = {
  period: MonthlyPeriod
  principal: number
  interest: number
  total: number
  remainingBalance: number
}

// ─── API ──────────────────────────────────────────────────────────────────────

export type ApiResponse<T> = {
  data: T
  error?: string
}
