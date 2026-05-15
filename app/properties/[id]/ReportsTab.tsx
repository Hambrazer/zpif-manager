'use client'

import { useMemo, useState } from 'react'
import { CashflowTable } from '@/components/tables/CashflowTable'
import { calcDCF } from '@/lib/calculations/dcf'
import { aggregateCashflows, type AggregationPeriod } from '@/lib/utils/aggregate'
import { calcWAULT } from '@/lib/calculations/metrics'
import {
  exportCashflowReportToExcel,
  exportRentRollReportToExcel,
  exportDCFSummaryToExcel,
  type RentRollRow,
  type DCFSummaryYearRow,
} from '@/lib/utils/exportReports'
import { formatRub, formatPct, formatDate } from '@/lib/utils/format'
import type { MonthlyCashflow } from '@/lib/types'

// V3.9.1: вкладка «Отчёты» страницы объекта.
// Выбор типа отчёта + периодичности + диапазона дат, кнопки «Сформировать» и
// «Экспорт Excel». Тело вкладки рендерит выбранный отчёт.

type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

type LeaseForReport = {
  id: string
  tenantName: string
  area: number
  baseRent: number
  opexReimbursementRate: number
  startDate: string
  endDate: string
  status: LeaseStatus
}

type Props = {
  propertyId: string
  propertyName: string
  rentableArea: number
  cashflows: MonthlyCashflow[]
  cfLoading: boolean
  cfError: string | null
  leases: LeaseForReport[]
  // DCF-параметры
  wacc: number
  projectionYears: number
  exitCapRate: number | null
  acquisitionPrice: number | null
}

type ReportType = 'cashflow' | 'rentroll' | 'dcf'

type ReportSnapshot = {
  type: ReportType
  mode: AggregationPeriod
  from: Date | null
  to: Date | null
  cutoff: Date  // для rent roll
}

const inputCls = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const STATUS_LABELS: Record<LeaseStatus, string> = {
  ACTIVE: 'Активный', TERMINATING: 'Расторгается', EXPIRED: 'Истёк',
}

const MODE_LABELS: Record<AggregationPeriod, string> = {
  monthly: 'Помесячно', quarterly: 'Поквартально', annual: 'Погодно',
}

function parseDateOrNull(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export function ReportsTab(props: Props) {
  const [reportType, setReportType] = useState<ReportType>('cashflow')
  const [mode, setMode]             = useState<AggregationPeriod>('monthly')
  const [from, setFrom]             = useState<string>('')
  const [to, setTo]                 = useState<string>('')
  const [snapshot, setSnapshot]     = useState<ReportSnapshot | null>(null)

  function handleGenerate() {
    setSnapshot({
      type: reportType,
      mode,
      from: parseDateOrNull(from),
      to:   parseDateOrNull(to),
      cutoff: parseDateOrNull(to) ?? new Date(),
    })
  }

  function handleExport() {
    if (!snapshot) return
    switch (snapshot.type) {
      case 'cashflow': {
        const items = aggregateCashflows(props.cashflows, snapshot.mode, {
          from: snapshot.from, to: snapshot.to,
        })
        exportCashflowReportToExcel(items, snapshot.mode, props.propertyName)
        break
      }
      case 'rentroll': {
        const rows = buildRentRollRows(props.leases, snapshot.cutoff)
        const totalArea = rows.reduce((s, r) => s + r.area, 0)
        const wault = calcWAULT(
          props.leases.map(l => ({ ...l, indexationType: 'NONE' as const, indexationRate: null,
            opexReimbursementIndexationType: 'NONE' as const, opexReimbursementIndexationRate: null,
            startDate: new Date(l.startDate), endDate: new Date(l.endDate),
          })),
          snapshot.cutoff,
        )
        exportRentRollReportToExcel(rows, snapshot.cutoff, totalArea, wault, props.propertyName)
        break
      }
      case 'dcf': {
        const dcf = computeDCFSummary(props)
        exportDCFSummaryToExcel(dcf, props.propertyName)
        break
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Блок параметров ── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelCls}>Тип отчёта</label>
            <select value={reportType} onChange={e => setReportType(e.target.value as ReportType)} className={inputCls}>
              <option value="cashflow">Cash Flow Detail</option>
              <option value="rentroll">Rent Roll</option>
              <option value="dcf">DCF Summary</option>
            </select>
          </div>

          {reportType === 'cashflow' && (
            <div>
              <label className={labelCls}>Периодичность</label>
              <select value={mode} onChange={e => setMode(e.target.value as AggregationPeriod)} className={inputCls}>
                <option value="monthly">Помесячно</option>
                <option value="quarterly">Поквартально</option>
                <option value="annual">Погодно</option>
              </select>
            </div>
          )}

          {reportType !== 'dcf' && (
            <>
              <div>
                <label className={labelCls}>
                  {reportType === 'rentroll' ? 'Период до (срез)' : 'Период от'}
                </label>
                {reportType === 'cashflow' && (
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
                )}
                {reportType === 'rentroll' && (
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                )}
              </div>
              {reportType === 'cashflow' && (
                <div>
                  <label className={labelCls}>Период до</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
                </div>
              )}
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
        <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-gray-400">
          <p className="text-sm">Выберите параметры и нажмите «Сформировать»</p>
        </div>
      ) : snapshot.type === 'cashflow' ? (
        <CashFlowDetailBody
          cashflows={props.cashflows}
          snapshot={snapshot}
          loading={props.cfLoading}
          error={props.cfError}
        />
      ) : snapshot.type === 'rentroll' ? (
        <RentRollBody leases={props.leases} cutoff={snapshot.cutoff} />
      ) : (
        <DCFSummaryBody
          cashflows={props.cashflows}
          loading={props.cfLoading}
          error={props.cfError}
          wacc={props.wacc}
          projectionYears={props.projectionYears}
          exitCapRate={props.exitCapRate}
          acquisitionPrice={props.acquisitionPrice}
        />
      )}
    </div>
  )
}

// ─── Cash Flow Detail ─────────────────────────────────────────────────────────

function CashFlowDetailBody({
  cashflows, snapshot, loading, error,
}: {
  cashflows: MonthlyCashflow[]
  snapshot: ReportSnapshot
  loading: boolean
  error: string | null
}) {
  const aggregated = useMemo(
    () => aggregateCashflows(cashflows, snapshot.mode, { from: snapshot.from, to: snapshot.to }),
    [cashflows, snapshot.mode, snapshot.from, snapshot.to],
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox text={error} />
  if (aggregated.length === 0) {
    return <Empty text="Нет данных в выбранном периоде" />
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        Cash Flow Detail · {MODE_LABELS[snapshot.mode]}
      </p>
      <CashflowTable variant="property" cashflows={aggregated} periodicity={snapshot.mode} />
    </div>
  )
}

// ─── Rent Roll ────────────────────────────────────────────────────────────────

function buildRentRollRows(leases: LeaseForReport[], cutoff: Date): RentRollRow[] {
  return leases
    .filter(l => new Date(l.startDate) <= cutoff && new Date(l.endDate) >= cutoff)
    .map(l => {
      const endTs = new Date(l.endDate).getTime()
      const yearsToExpiry = (endTs - cutoff.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
      return {
        tenantName: l.tenantName,
        area: l.area,
        baseRent: l.baseRent,
        opexReimbursementRate: l.opexReimbursementRate,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
        yearsToExpiry: Math.max(0, yearsToExpiry),
      }
    })
}

function RentRollBody({ leases, cutoff }: { leases: LeaseForReport[]; cutoff: Date }) {
  const rows = useMemo(() => buildRentRollRows(leases, cutoff), [leases, cutoff])
  const totalArea = rows.reduce((s, r) => s + r.area, 0)

  const wault = useMemo(() => {
    return calcWAULT(
      leases.map(l => ({
        id: l.id,
        tenantName: l.tenantName,
        area: l.area,
        baseRent: l.baseRent,
        startDate: new Date(l.startDate),
        endDate: new Date(l.endDate),
        indexationType: 'NONE' as const,
        indexationRate: null,
        opexReimbursementRate: l.opexReimbursementRate,
        opexReimbursementIndexationType: 'NONE' as const,
        opexReimbursementIndexationRate: null,
        status: l.status,
      })),
      cutoff,
    )
  }, [leases, cutoff])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Rent Roll · на {formatDate(cutoff)}
        </p>
      </div>

      {rows.length === 0 ? (
        <Empty text="Активных договоров на выбранную дату нет" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2">Арендатор</th>
                <th className="text-right px-4 py-2">Площадь, м²</th>
                <th className="text-right px-4 py-2">Ставка, ₽/м²/год</th>
                <th className="text-right px-4 py-2">OPEX возм., ₽/м²/год</th>
                <th className="text-left px-4 py-2">Статус</th>
                <th className="text-left px-4 py-2">Начало</th>
                <th className="text-left px-4 py-2">Окончание</th>
                <th className="text-right px-4 py-2">Лет до окончания</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2 text-gray-900">{r.tenantName}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{r.area.toLocaleString('ru-RU')}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{formatRub(r.baseRent)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">
                    {r.opexReimbursementRate > 0 ? formatRub(r.opexReimbursementRate) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-700">{STATUS_LABELS[r.status]}</td>
                  <td className="px-4 py-2 text-gray-700">{formatDate(r.startDate)}</td>
                  <td className="px-4 py-2 text-gray-700">{formatDate(r.endDate)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{r.yearsToExpiry.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 text-sm font-medium text-gray-700">
                <td className="px-4 py-2">Итого</td>
                <td className="px-4 py-2 text-right">{totalArea.toLocaleString('ru-RU')}</td>
                <td className="px-4 py-2 text-right text-gray-300">—</td>
                <td className="px-4 py-2 text-right text-gray-300">—</td>
                <td className="px-4 py-2 text-gray-300" colSpan={3}>—</td>
                <td className="px-4 py-2 text-right">
                  WAULT: {wault > 0 ? `${wault.toFixed(1)} лет` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── DCF Summary ──────────────────────────────────────────────────────────────

function computeDCFSummary(props: Props): {
  npv: number
  irr: number
  wacc: number
  projectionYears: number
  terminalValue: number
  yearly: DCFSummaryYearRow[]
} {
  const dcf = calcDCF(props.cashflows, props.wacc, props.exitCapRate, props.acquisitionPrice ?? 0)

  // Группируем месячные FCF по году, дисконтируем итог года
  const byYear = new Map<number, number>()
  for (const cf of props.cashflows) {
    byYear.set(cf.period.year, (byYear.get(cf.period.year) ?? 0) + cf.fcf)
  }
  const years = Array.from(byYear.entries()).sort(([a], [b]) => a - b)
  // Дисконтирующий множитель: конец года k = 12·k → (1 + r/12)^(12k) ≈ (1 + wacc)^k
  const yearly: DCFSummaryYearRow[] = years.map(([year, fcf], k) => {
    const discountFactor = 1 / Math.pow(1 + props.wacc, k + 1)
    return { year, fcf, discountFactor, discountedFcf: fcf * discountFactor }
  })

  return {
    npv: dcf.npv,
    irr: dcf.irr,
    wacc: props.wacc,
    projectionYears: props.projectionYears,
    terminalValue: dcf.terminalValue,
    yearly,
  }
}

function DCFSummaryBody({
  cashflows, loading, error, wacc, projectionYears, exitCapRate, acquisitionPrice,
}: {
  cashflows: MonthlyCashflow[]
  loading: boolean
  error: string | null
  wacc: number
  projectionYears: number
  exitCapRate: number | null
  acquisitionPrice: number | null
}) {
  const data = useMemo(
    () => computeDCFSummary({
      propertyId: '', propertyName: '', rentableArea: 0,
      cashflows, cfLoading: false, cfError: null, leases: [],
      wacc, projectionYears, exitCapRate, acquisitionPrice,
    }),
    [cashflows, wacc, projectionYears, exitCapRate, acquisitionPrice],
  )

  if (loading) return <Loading />
  if (error) return <ErrorBox text={error} />
  if (cashflows.length === 0) return <Empty text="Нет данных" />

  const metrics: { label: string; value: string }[] = [
    { label: 'NPV',                 value: formatRub(data.npv) },
    { label: 'IRR',                 value: data.irr === 0 ? '—' : formatPct(data.irr) },
    { label: 'WACC',                value: formatPct(data.wacc) },
    { label: 'Горизонт DCF',        value: `${data.projectionYears} лет` },
    { label: 'Терминальная стоимость', value: formatRub(data.terminalValue) },
  ]

  return (
    <div className="space-y-4">
      {/* Карточки метрик */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map(m => (
          <div key={m.label} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400">{m.label}</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Погодная таблица дисконтированных потоков */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Дисконтированные потоки погодно
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-2">Год</th>
                <th className="text-right px-4 py-2">FCF</th>
                <th className="text-right px-4 py-2">Коэф. дисконт.</th>
                <th className="text-right px-4 py-2">Дисконт. FCF</th>
              </tr>
            </thead>
            <tbody>
              {data.yearly.map(y => (
                <tr key={y.year} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2 text-gray-700">{y.year}</td>
                  <td className="px-4 py-2 text-right text-gray-800">{formatRub(y.fcf)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{y.discountFactor.toFixed(4)}</td>
                  <td className="px-4 py-2 text-right text-gray-800">{formatRub(y.discountedFcf)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
