'use client'

import { useEffect, useMemo, useState } from 'react'
import { CashflowTable } from '@/components/tables/CashflowTable'
import { aggregateFundCashRoll, type AggregationPeriod } from '@/lib/utils/aggregate'
import { calcInvestorIRR } from '@/lib/calculations/metrics'
import { calcIRR } from '@/lib/calculations/dcf'
import { formatRub, formatPct, formatDate } from '@/lib/utils/format'
import {
  exportFundCashflowReportToExcel,
  exportInvestorSummaryToExcel,
  exportPortfolioOverviewToExcel,
  type InvestorSummaryRow,
  type PortfolioOverviewRow,
} from '@/lib/utils/exportFundReports'
import type { ApiResponse, MonthlyCashRoll, NAVResult } from '@/lib/types'
import type { PropertyMetrics } from '@/app/api/cashflow/fund/[id]/properties/route'

// V3.9.2: вкладка «Отчёты» страницы фонда. Параметры (тип/периодичность/период)
// + три отчёта (Fund Cash Flow / Investor Summary / Portfolio Overview).

type FundPropertyForReport = {
  id: string
  name: string
  rentableArea: number
  ownershipPct: number
  exitCapRate: number | null
  purchaseDate: string | null
  saleDate: string | null
  wault: number
}

type Props = {
  fundId: string
  fundName: string
  totalEmission: number
  totalUnits: number
  cashRoll: MonthlyCashRoll[]
  navData: NAVResult[] | null
  cfLoading: boolean
  cfError: string | null
  properties: FundPropertyForReport[]
}

type ReportType = 'fundcf' | 'investor' | 'portfolio'

type ReportSnapshot = {
  type: ReportType
  mode: AggregationPeriod
  from: Date | null
  to: Date | null
}

const inputCls = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const MODE_LABELS: Record<AggregationPeriod, string> = {
  monthly: 'Помесячно', quarterly: 'Поквартально', annual: 'Погодно',
}

function parseDateOrNull(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function FundReportsTab(props: Props) {
  const [reportType, setReportType] = useState<ReportType>('fundcf')
  const [mode, setMode]             = useState<AggregationPeriod>('annual')
  const [from, setFrom]             = useState<string>('')
  const [to, setTo]                 = useState<string>('')
  const [snapshot, setSnapshot]     = useState<ReportSnapshot | null>(null)

  function handleGenerate() {
    setSnapshot({
      type: reportType,
      mode,
      from: parseDateOrNull(from),
      to:   parseDateOrNull(to),
    })
  }

  function handleExport() {
    if (!snapshot) return
    switch (snapshot.type) {
      case 'fundcf': {
        const items = aggregateFundCashRoll(props.cashRoll, snapshot.mode, {
          from: snapshot.from, to: snapshot.to,
        })
        exportFundCashflowReportToExcel(items, snapshot.mode, props.fundName)
        break
      }
      case 'investor': {
        const rows = buildInvestorSummary(props.cashRoll, props.navData, props.totalEmission)
        const totalDistributions = rows.reduce((s, r) => s + r.distributions, 0)
        const finalIRR = rows.length > 0 ? rows[rows.length - 1]!.cumulativeIRR : 0
        exportInvestorSummaryToExcel(rows, totalDistributions, finalIRR, props.fundName)
        break
      }
      case 'portfolio': {
        // Используем уже загруженные на странице данные + последние метрики из state
        const { rows, totals } = buildPortfolioOverview(props.properties, portfolioMetrics)
        exportPortfolioOverviewToExcel(rows, totals, props.fundName)
        break
      }
    }
  }

  // ─── Per-property метрики для Portfolio Overview ─────────────────────────────
  const [portfolioMetrics, setPortfolioMetrics] = useState<Map<string, PropertyMetrics> | null>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState<string | null>(null)

  useEffect(() => {
    if (snapshot?.type !== 'portfolio' || portfolioMetrics) return
    setPortfolioLoading(true)
    setPortfolioError(null)
    fetch(`/api/cashflow/fund/${props.fundId}/properties`)
      .then(r => r.json() as Promise<ApiResponse<PropertyMetrics[]>>)
      .then(json => {
        if (json.error) throw new Error(json.error)
        setPortfolioMetrics(new Map(json.data.map(m => [m.id, m])))
      })
      .catch(e => setPortfolioError(e instanceof Error ? e.message : 'Ошибка загрузки метрик'))
      .finally(() => setPortfolioLoading(false))
  }, [snapshot?.type, props.fundId, portfolioMetrics])

  return (
    <div className="space-y-4">
      {/* ── Блок параметров ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>Тип отчёта</label>
            <select value={reportType} onChange={e => setReportType(e.target.value as ReportType)} className={inputCls}>
              <option value="fundcf">Fund Cash Flow</option>
              <option value="investor">Investor Summary</option>
              <option value="portfolio">Portfolio Overview</option>
            </select>
          </div>

          {reportType === 'fundcf' && (
            <div>
              <label className={labelCls}>Периодичность</label>
              <select value={mode} onChange={e => setMode(e.target.value as AggregationPeriod)} className={inputCls}>
                <option value="monthly">Помесячно</option>
                <option value="quarterly">Поквартально</option>
                <option value="annual">Погодно</option>
              </select>
            </div>
          )}

          {reportType === 'fundcf' && (
            <>
              <div>
                <label className={labelCls}>Период от</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Период до</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
              </div>
            </>
          )}

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Сформировать
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={!snapshot}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Экспорт Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Тело отчёта ── */}
      {!snapshot ? (
        <Empty text="Выберите параметры и нажмите «Сформировать»" />
      ) : props.cfLoading ? (
        <Loading />
      ) : props.cfError ? (
        <ErrorBox text={props.cfError} />
      ) : snapshot.type === 'fundcf' ? (
        <FundCashflowBody cashRoll={props.cashRoll} snapshot={snapshot} />
      ) : snapshot.type === 'investor' ? (
        <InvestorSummaryBody
          cashRoll={props.cashRoll}
          navData={props.navData}
          totalEmission={props.totalEmission}
        />
      ) : (
        <PortfolioOverviewBody
          properties={props.properties}
          metrics={portfolioMetrics}
          loading={portfolioLoading}
          error={portfolioError}
        />
      )}
    </div>
  )
}

// ─── Fund Cash Flow ───────────────────────────────────────────────────────────

function FundCashflowBody({ cashRoll, snapshot }: { cashRoll: MonthlyCashRoll[]; snapshot: ReportSnapshot }) {
  const aggregated = useMemo(
    () => aggregateFundCashRoll(cashRoll, snapshot.mode, { from: snapshot.from, to: snapshot.to }),
    [cashRoll, snapshot.mode, snapshot.from, snapshot.to],
  )

  if (aggregated.length === 0) return <Empty text="Нет данных в выбранном периоде" />
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        Fund Cash Flow · {MODE_LABELS[snapshot.mode]}
      </p>
      <CashflowTable variant="fund" cashRoll={aggregated} periodicity={snapshot.mode} />
    </div>
  )
}

// ─── Investor Summary ─────────────────────────────────────────────────────────

function buildInvestorSummary(
  cashRoll: MonthlyCashRoll[],
  navData: NAVResult[] | null,
  totalEmission: number,
): InvestorSummaryRow[] {
  if (cashRoll.length === 0 || totalEmission <= 0) return []

  // Поток инвестора помесячно — для накопительного IRR
  const investorFlows = cashRoll.map((r, i) => {
    if (i === 0)                      return -(r.emissionInflow + r.upfrontFeeOutflow)
    if (i === cashRoll.length - 1)    return r.distributionOutflow + r.redemptionOutflow
    return r.distributionOutflow
  })

  // Группируем по годам: выплаты + индексы месяцев года
  const distByYear   = new Map<number, number>()
  const monthsByYear = new Map<number, number[]>()
  cashRoll.forEach((r, i) => {
    const y = r.period.year
    distByYear.set(y, (distByYear.get(y) ?? 0) + r.distributionOutflow)
    const list = monthsByYear.get(y)
    if (list) list.push(i); else monthsByYear.set(y, [i])
  })

  // NAV/РСП на конец года — последняя точка года из navData
  const navByYear = new Map<number, { nav: number; rsp: number }>()
  if (navData) {
    for (const n of navData) navByYear.set(n.period.year, { nav: n.nav, rsp: n.rsp })
  }

  const years = Array.from(distByYear.keys()).sort((a, b) => a - b)

  return years.map(year => {
    const distributions = distByYear.get(year)!
    const cashOnCash = distributions / totalEmission

    // Накопительный IRR: режем investorFlows до последнего месяца года включительно
    const lastIdxOfYear = (monthsByYear.get(year) ?? []).at(-1)!
    const flowsToYear = investorFlows.slice(0, lastIdxOfYear + 1)
    let cumulativeIRR = 0
    if (flowsToYear.length >= 2) {
      // Для накопительного IRR в качестве «последнего платежа» добавляем NAV конца года
      // (что инвестор бы получил при ликвидации в этой точке)
      const navEoy = navByYear.get(year)?.nav ?? 0
      const flows = [...flowsToYear]
      flows[flows.length - 1] = (flows[flows.length - 1] ?? 0) + navEoy
      const m = calcIRR(flows)
      if (!isNaN(m)) {
        const annual = Math.pow(1 + m, 12) - 1
        cumulativeIRR = isFinite(annual) ? annual : 0
      }
    }

    const navInfo = navByYear.get(year) ?? { nav: 0, rsp: 0 }
    return {
      year,
      distributions,
      cashOnCash,
      nav: navInfo.nav,
      rsp: navInfo.rsp,
      cumulativeIRR,
    }
  })
}

function InvestorSummaryBody({
  cashRoll, navData, totalEmission,
}: {
  cashRoll: MonthlyCashRoll[]
  navData: NAVResult[] | null
  totalEmission: number
}) {
  const rows = useMemo(() => buildInvestorSummary(cashRoll, navData, totalEmission), [cashRoll, navData, totalEmission])
  const totalDistributions = rows.reduce((s, r) => s + r.distributions, 0)
  const finalIRR = useMemo(() => calcInvestorIRR(cashRoll), [cashRoll])

  if (rows.length === 0) return <Empty text="Нет данных по выплатам" />

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        Investor Summary
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left  px-4 py-2">Год</th>
              <th className="text-right px-4 py-2">Выплаты пайщикам</th>
              <th className="text-right px-4 py-2">Cash on Cash</th>
              <th className="text-right px-4 py-2">NAV</th>
              <th className="text-right px-4 py-2">РСП</th>
              <th className="text-right px-4 py-2">IRR накопленный</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.year} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 text-gray-700">{r.year}</td>
                <td className="px-4 py-2 text-right text-gray-800">{formatRub(r.distributions)}</td>
                <td className="px-4 py-2 text-right text-gray-700">{formatPct(r.cashOnCash)}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.nav > 0 ? formatRub(r.nav) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.rsp > 0 ? formatRub(r.rsp) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {r.cumulativeIRR === 0 ? <span className="text-gray-300">—</span> : formatPct(r.cumulativeIRR)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
              <td className="px-4 py-2">Итого</td>
              <td className="px-4 py-2 text-right">{formatRub(totalDistributions)}</td>
              <td className="px-4 py-2 text-right text-gray-300">—</td>
              <td className="px-4 py-2 text-right text-gray-300">—</td>
              <td className="px-4 py-2 text-right text-gray-300">—</td>
              <td className="px-4 py-2 text-right">
                IRR инвестора: {finalIRR === 0 ? '—' : formatPct(finalIRR)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Portfolio Overview ───────────────────────────────────────────────────────

function buildPortfolioOverview(
  properties: FundPropertyForReport[],
  metricsMap: Map<string, PropertyMetrics> | null,
): { rows: PortfolioOverviewRow[]; totals: { annualNOI: number; weightedCapRate: number | null; weightedWault: number; marketValue: number } } {
  const rows: PortfolioOverviewRow[] = properties.map(p => {
    const m = metricsMap?.get(p.id)
    const annualNOI = m ? m.annualNOI * (p.ownershipPct / 100) : 0
    const capRate = m ? m.capRate : null
    const marketValue = m && p.exitCapRate
      ? (m.annualNOI / p.exitCapRate) * (p.ownershipPct / 100)
      : 0
    return {
      name: p.name,
      ownershipPct: p.ownershipPct,
      rentableArea: p.rentableArea,
      annualNOI,
      capRate,
      wault: p.wault,
      marketValue,
      purchaseDate: p.purchaseDate,
      saleDate: p.saleDate,
    }
  })

  const totalNOI = rows.reduce((s, r) => s + r.annualNOI, 0)
  const totalMarketValue = rows.reduce((s, r) => s + r.marketValue, 0)
  // Cap Rate взвешен по рыночной стоимости (источник веса для оценки доходности)
  const totalWeightForCap = rows.reduce(
    (s, r) => r.capRate !== null ? s + r.marketValue : s, 0)
  const weightedCapRate = totalWeightForCap > 0
    ? rows.reduce((s, r) => r.capRate !== null ? s + r.capRate * r.marketValue : s, 0) / totalWeightForCap
    : null
  // WAULT взвешен по площади
  const totalArea = rows.reduce((s, r) => s + r.rentableArea, 0)
  const weightedWault = totalArea > 0
    ? rows.reduce((s, r) => s + r.wault * r.rentableArea, 0) / totalArea
    : 0

  return {
    rows,
    totals: { annualNOI: totalNOI, weightedCapRate, weightedWault, marketValue: totalMarketValue },
  }
}

function PortfolioOverviewBody({
  properties, metrics, loading, error,
}: {
  properties: FundPropertyForReport[]
  metrics: Map<string, PropertyMetrics> | null
  loading: boolean
  error: string | null
}) {
  const { rows, totals } = useMemo(
    () => buildPortfolioOverview(properties, metrics),
    [properties, metrics],
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox text={error} />
  if (rows.length === 0) return <Empty text="В фонде нет объектов" />

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        Portfolio Overview · на сегодня
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left  px-4 py-2">Объект</th>
              <th className="text-right px-4 py-2">% владения</th>
              <th className="text-right px-4 py-2">Площадь, м²</th>
              <th className="text-right px-4 py-2">NOI/год</th>
              <th className="text-right px-4 py-2">Cap Rate</th>
              <th className="text-right px-4 py-2">WAULT</th>
              <th className="text-right px-4 py-2">Стоимость</th>
              <th className="text-left  px-4 py-2">Дата покупки</th>
              <th className="text-left  px-4 py-2">Дата продажи</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 text-gray-900">{r.name}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.ownershipPct.toLocaleString('ru-RU')}%</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.rentableArea.toLocaleString('ru-RU')}</td>
                <td className="px-4 py-2 text-right text-gray-800">{r.annualNOI !== 0 ? formatRub(r.annualNOI) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.capRate !== null ? formatPct(r.capRate) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-right text-gray-700">{r.wault > 0 ? `${r.wault.toFixed(1)} лет` : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-right text-gray-800">{r.marketValue > 0 ? formatRub(r.marketValue) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-gray-700">{r.purchaseDate ? formatDate(r.purchaseDate) : <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2 text-gray-700">{r.saleDate ? formatDate(r.saleDate) : <span className="text-gray-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
              <td className="px-4 py-2">Итого</td>
              <td className="px-4 py-2 text-right text-gray-300">—</td>
              <td className="px-4 py-2 text-right">{rows.reduce((s, r) => s + r.rentableArea, 0).toLocaleString('ru-RU')}</td>
              <td className="px-4 py-2 text-right">{formatRub(totals.annualNOI)}</td>
              <td className="px-4 py-2 text-right">{totals.weightedCapRate !== null ? formatPct(totals.weightedCapRate) : <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-2 text-right">{totals.weightedWault > 0 ? `${totals.weightedWault.toFixed(1)} лет` : '—'}</td>
              <td className="px-4 py-2 text-right">{formatRub(totals.marketValue)}</td>
              <td className="px-4 py-2 text-gray-300">—</td>
              <td className="px-4 py-2 text-gray-300">—</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─── Вспомогательные блоки ────────────────────────────────────────────────────

function Loading() {
  return <div className="bg-white rounded-lg border border-gray-200 py-12 text-center text-sm text-gray-400">Загрузка…</div>
}
function ErrorBox({ text }: { text: string }) {
  return <div className="bg-white rounded-lg border border-gray-200 py-12 text-center text-sm text-red-500">{text}</div>
}
function Empty({ text }: { text: string }) {
  return <div className="bg-white rounded-lg border border-gray-200 py-12 text-center text-sm text-gray-400">{text}</div>
}
