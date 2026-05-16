'use client'

import { useState } from 'react'
import { CashflowTable } from '@/components/tables/CashflowTable'
import { CashRollTable } from '@/components/tables/CashRollTable'
import { calcInvestorIRR, getReferencePoint } from '@/lib/calculations/metrics'
import { formatRub, formatPct } from '@/lib/utils/format'
import type {
  MonthlyCashflow,
  MonthlyCashRoll,
  MonthlyPeriod,
  NAVResult,
  ReferencePoint,
} from '@/lib/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

type Props = {
  cashflows: MonthlyCashflow[]
  cashRoll: MonthlyCashRoll[]
  totalAcquisitionPrice: number
  navData: NAVResult[] | null
  fundStartDate: Date
  fundEndDate: Date
  totalUnits: number
}

type Metrics = {
  annualNOI: number | null
  annualFCF: number | null
  capRate: number | null
  irr: number | null
  nav: number | null
  rsp: number | null
}

type CfTab = 'cashflow' | 'cashroll'

// ─── Метрики на reference point (V4.4.2) ──────────────────────────────────────

const EMPTY_METRICS: Metrics = {
  annualNOI: null, annualFCF: null, capRate: null, irr: null, nav: null, rsp: null,
}

function findPeriodIndex<T extends { period: MonthlyPeriod }>(
  items: readonly T[],
  date: Date,
): number {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return items.findIndex(it => it.period.year === year && it.period.month === month)
}

function findNAV(navData: NAVResult[] | null, date: Date): NAVResult | null {
  if (!navData) return null
  const idx = findPeriodIndex(navData, date)
  return idx === -1 ? null : navData[idx]!
}

function computeMetrics(
  ref: ReferencePoint,
  cashflows: MonthlyCashflow[],
  cashRoll: MonthlyCashRoll[],
  acquisitionPrice: number,
  navData: NAVResult[] | null,
  totalUnits: number,
): Metrics {
  if (ref.status === 'not_started') return EMPTY_METRICS
  if (cashflows.length === 0) return EMPTY_METRICS

  // Окно NOI/FCF и индекс reference date в cashRoll:
  //   active: forward 12M от refDate (т.е. следующие 12 месяцев)
  //   closed: trailing 12M до endDate включительно
  const refIdxCF = findPeriodIndex(cashflows, ref.date)
  const refIdxCR = findPeriodIndex(cashRoll, ref.date)

  let window: MonthlyCashflow[] = []
  if (ref.status === 'active' && refIdxCF !== -1) {
    window = cashflows.slice(refIdxCF + 1, refIdxCF + 13)
  } else if (ref.status === 'closed' && refIdxCF !== -1) {
    window = cashflows.slice(Math.max(0, refIdxCF - 11), refIdxCF + 1)
  }

  const annualNOI = window.length > 0 ? window.reduce((s, cf) => s + cf.noi, 0) : null
  const annualFCF = window.length > 0 ? window.reduce((s, cf) => s + cf.fcf, 0) : null
  const capRate = (annualNOI !== null && acquisitionPrice > 0)
    ? annualNOI / acquisitionPrice
    : null

  // СЧА/РСП — из NAVResult на reference date. РСП берём из nav-серии, чтобы
  // согласоваться с уже посчитанным значением (а не пересчитывать вручную).
  const refNav = findNAV(navData, ref.date)
  const nav = refNav?.nav ?? null
  const rsp = refNav
    ? refNav.rsp
    : (nav !== null && totalUnits > 0 ? nav / totalUnits : null)

  // IRR — накопленный по потоку инвестора, обрезанному до reference date включительно.
  // Если refIdxCR не нашли (например refDate раньше первого месяца фонда) — IRR=null.
  let irr: number | null = null
  if (refIdxCR !== -1) {
    const sliced = cashRoll.slice(0, refIdxCR + 1)
    const irrAnnual = sliced.length > 0 ? calcInvestorIRR(sliced).value : 0
    irr = irrAnnual === 0 ? null : irrAnnual
  }

  return { annualNOI, annualFCF, capRate, irr, nav, rsp }
}

type MetricBox = { label: string; value: number | null; format: (v: number) => string }

function metricBoxes(m: Metrics): MetricBox[] {
  return [
    { label: 'NOI/год',  value: m.annualNOI, format: formatRub },
    { label: 'FCF/год',  value: m.annualFCF, format: formatRub },
    { label: 'Cap Rate', value: m.capRate,   format: formatPct },
    { label: 'IRR',      value: m.irr,       format: formatPct },
    { label: 'СЧА',      value: m.nav,       format: formatRub },
    { label: 'РСП',      value: m.rsp,       format: formatRub },
  ]
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export function FundCashflowBlock({
  cashflows,
  cashRoll,
  totalAcquisitionPrice,
  navData,
  fundStartDate,
  fundEndDate,
  totalUnits,
}: Props) {
  const [cfTab, setCfTab] = useState<CfTab>('cashflow')

  // V4.4.2: метрики над таблицей считаются на reference point.
  // Сегодня берётся в момент рендера — это согласуется с правилом «расчёты на лету».
  const ref = getReferencePoint(
    { startDate: fundStartDate, endDate: fundEndDate },
    new Date(),
  )
  const metrics = computeMetrics(
    ref, cashflows, cashRoll, totalAcquisitionPrice, navData, totalUnits,
  )

  const tabs: { id: CfTab; label: string }[] = [
    { id: 'cashflow', label: 'Денежный поток' },
    { id: 'cashroll', label: 'Кэш-ролл' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Метрики ── */}
      {ref.status === 'not_started' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Фонд не начался — метрики появятся после {fundStartDate.toLocaleDateString('ru-RU')}.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {metricBoxes(metrics).map(({ label, value, format }) => (
            <div key={label} className="bg-gray-50 rounded-lg px-4 py-3">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-base font-semibold text-gray-900 mt-0.5 truncate">
                {value !== null ? format(value) : '—'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Переключатель таблиц ── */}
      <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCfTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              cfTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Таблица CF / Кэш-ролл ── */}
      {cfTab === 'cashflow' ? (
        <CashflowTable cashRoll={cashRoll} variant="fund" />
      ) : (
        <CashRollTable data={cashRoll} />
      )}
    </div>
  )
}
