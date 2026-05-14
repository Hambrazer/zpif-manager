'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatRub, formatPct, formatDate } from '@/lib/utils/format'
import { LeaseForm } from '@/components/forms/LeaseForm'
import { GanttChart } from '@/components/charts/GanttChart'
import type { GanttLease } from '@/components/charts/GanttChart'
import { exportRentRollToExcel } from '@/lib/utils/exportRentRoll'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { CashflowTable } from '@/components/tables/CashflowTable'
import type { MonthlyCashflow } from '@/lib/types'

type PropertyType = 'OFFICE' | 'WAREHOUSE' | 'RETAIL' | 'MIXED' | 'RESIDENTIAL'
type IndexationType = 'CPI' | 'FIXED' | 'NONE'
type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  OFFICE: 'Офис',
  WAREHOUSE: 'Склад',
  RETAIL: 'Торговый',
  MIXED: 'Смешанный',
  RESIDENTIAL: 'Жилой',
}

const LEASE_STATUS_STYLES: Record<LeaseStatus, { label: string; cls: string }> = {
  ACTIVE:      { label: 'Активный',     cls: 'bg-green-100 text-green-700'   },
  EXPIRED:     { label: 'Истёк',        cls: 'bg-gray-100 text-gray-500'     },
  TERMINATING: { label: 'Расторгается', cls: 'bg-yellow-100 text-yellow-700' },
}

const INDEXATION_LABELS: Record<IndexationType, string> = {
  CPI:   'ИПЦ',
  FIXED: 'Фикс.',
  NONE:  'Нет',
}

type LeaseContract = {
  id: string
  tenantName: string
  area: number
  baseRent: number
  startDate: string
  endDate: string
  indexationType: IndexationType
  indexationRate: number | null
  firstIndexationDate: string | null
  indexationFrequency: number | null
  opexReimbursementRate: number
  opexReimbursementIndexationType: IndexationType
  opexReimbursementIndexationRate: number | null
  opexFirstIndexationDate: string | null
  opexIndexationFrequency: number | null
  securityDeposit: number | null
  status: LeaseStatus
  renewalOption: boolean
  breakOption: boolean
  vatIncluded: boolean
}

type PropertyData = {
  id: string
  fundId: string
  fundName: string
  fundStartDate: string
  fundEndDate: string
  name: string
  type: PropertyType
  address: string
  totalArea: number
  rentableArea: number
  acquisitionPrice: number | null
  purchaseDate: string | null
  saleDate: string | null
  exitCapRate: number | null
  wault: number
  leaseContracts: LeaseContract[]
}

type Tab = 'tenants' | 'cashflow'

const TABS: { id: Tab; label: string }[] = [
  { id: 'tenants',  label: 'Арендаторы'    },
  { id: 'cashflow', label: 'Денежный поток' },
]

export function PropertyPage({ property }: { property: PropertyData }) {
  const [activeTab, setActiveTab] = useState<Tab>('tenants')

  const activeCount = property.leaseContracts.filter(l => l.status === 'ACTIVE').length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 shrink-0">
              ← Портфель
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <Link
              href={`/funds/${property.fundId}`}
              className="text-sm text-gray-500 hover:text-gray-700 shrink-0 max-w-[140px] truncate"
            >
              {property.fundName}
            </Link>
            <span className="text-gray-300 shrink-0">/</span>
            <span className="text-sm font-medium text-gray-900 truncate">{property.name}</span>
          </div>
          <span className="text-lg font-semibold text-gray-900 shrink-0 ml-4">ЗПИФ Менеджер</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Заголовок объекта */}
        <div>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{property.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{property.address}</p>
            </div>
            <span className="shrink-0 text-sm font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full mt-1">
              {PROPERTY_TYPE_LABELS[property.type]}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>
              Общая площадь:{' '}
              <span className="font-medium text-gray-900">
                {property.totalArea.toLocaleString('ru-RU')} м²
              </span>
            </span>
            <span>
              GLA:{' '}
              <span className="font-medium text-gray-900">
                {property.rentableArea.toLocaleString('ru-RU')} м²
              </span>
            </span>
            {property.acquisitionPrice !== null && (
              <span>
                Цена приобретения:{' '}
                <span className="font-medium text-gray-900">
                  {formatRub(property.acquisitionPrice)}
                </span>
              </span>
            )}
            <span>
              Активных договоров:{' '}
              <span className="font-medium text-gray-900">{activeCount}</span>
            </span>
          </div>
        </div>

        {/* Вкладки */}
        <div>
          <div className="flex border-b border-gray-200">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {activeTab === 'tenants'  && (
              <TenantsTab
                leases={property.leaseContracts}
                propertyId={property.id}
                wault={property.wault}
                rentableArea={property.rentableArea}
                propertyName={property.name}
                fundStartDate={property.fundStartDate}
                fundEndDate={property.fundEndDate}
              />
            )}
            {activeTab === 'cashflow' && (
            <CashflowTab
              propertyId={property.id}
              acquisitionPrice={property.acquisitionPrice}
              purchaseDate={property.purchaseDate}
              saleDate={property.saleDate}
              exitCapRate={property.exitCapRate}
            />
          )}
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Вкладка 1: Арендаторы ────────────────────────────────────────────────────

function TenantsTab({
  leases,
  propertyId,
  wault,
  rentableArea,
  propertyName,
  fundStartDate,
  fundEndDate,
}: {
  leases: LeaseContract[]
  propertyId: string
  wault: number
  rentableArea: number
  propertyName: string
  fundStartDate: string
  fundEndDate: string
}) {
  const router = useRouter()
  const [showAdd, setShowAdd]             = useState(false)
  const [editingLease, setEditingLease]   = useState<LeaseContract | null>(null)
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [deleteError, setDeleteError]     = useState<string | null>(null)

  function handleExport() {
    exportRentRollToExcel(leases, rentableArea, wault, propertyName)
  }

  function handleAdded() {
    setShowAdd(false)
    router.refresh()
  }

  function handleEdited() {
    setEditingLease(null)
    router.refresh()
  }

  async function handleDelete(lease: LeaseContract) {
    if (!window.confirm(`Удалить договор с «${lease.tenantName}»?`)) return
    setDeletingId(lease.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/leases/${lease.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setDeleteError(json.error ?? 'Ошибка удаления')
        return
      }
      router.refresh()
    } catch {
      setDeleteError('Ошибка сети')
    } finally {
      setDeletingId(null)
    }
  }

  const totalArea        = leases.reduce((s, l) => s + l.area, 0)
  const totalAnnualIncome = leases.reduce((s, l) => s + l.area * l.baseRent, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            WAULT:{' '}
            <span className="font-medium text-gray-900">
              {wault > 0 ? `${wault.toFixed(1)} лет` : '—'}
            </span>
          </span>
          <button
            onClick={handleExport}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            Экспорт Excel
          </button>
        </div>
        <div className="flex items-center gap-3">
          {deleteError && (
            <p className="text-sm text-red-600">{deleteError}</p>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Добавить договор
          </button>
        </div>
      </div>

      {leases.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16 text-center text-gray-400">
          <p className="text-base">Договоров аренды нет</p>
          <p className="text-sm mt-1">Добавьте первый договор</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Арендатор</th>
                  <th className="text-right px-4 py-3">Площадь, м²</th>
                  <th className="text-right px-4 py-3">Ставка, ₽/м²/год</th>
                  <th className="text-right px-4 py-3">Доход, ₽/год</th>
                  <th className="text-left px-4 py-3">Начало</th>
                  <th className="text-left px-4 py-3">Окончание</th>
                  <th className="text-left px-4 py-3">Статус</th>
                  <th className="text-left px-4 py-3">Индексация</th>
                  <th className="text-left px-4 py-3">Опционы</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {leases.map(lease => {
                  const st = LEASE_STATUS_STYLES[lease.status]
                  const isDeleting = deletingId === lease.id
                  return (
                    <tr
                      key={lease.id}
                      className={`border-b border-gray-50 last:border-0 transition-colors ${
                        isDeleting ? 'opacity-40' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Арендатор */}
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{lease.tenantName}</p>
                        {lease.vatIncluded && (
                          <p className="text-xs text-gray-400 mt-0.5">с НДС</p>
                        )}
                      </td>

                      {/* Площадь */}
                      <td className="px-4 py-3 text-right text-gray-700">
                        {lease.area.toLocaleString('ru-RU')}
                      </td>

                      {/* Ставка */}
                      <td className="px-4 py-3 text-right text-gray-700">
                        {lease.baseRent.toLocaleString('ru-RU')}
                      </td>

                      {/* Годовой доход */}
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatRub(lease.area * lease.baseRent)}
                      </td>

                      {/* Начало */}
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(lease.startDate)}
                      </td>

                      {/* Окончание */}
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(lease.endDate)}
                      </td>

                      {/* Статус */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>

                      {/* Индексация */}
                      <td className="px-4 py-3 text-gray-600">
                        {INDEXATION_LABELS[lease.indexationType]}
                        {lease.indexationType === 'FIXED' && lease.indexationRate !== null && (
                          <span className="text-gray-400 ml-1">
                            {formatPct(lease.indexationRate)}
                          </span>
                        )}
                      </td>

                      {/* Опционы */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {lease.renewalOption && (
                            <span className="inline-flex text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                              Продл.
                            </span>
                          )}
                          {lease.breakOption && (
                            <span className="inline-flex text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">
                              Выход
                            </span>
                          )}
                          {!lease.renewalOption && !lease.breakOption && (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      </td>

                      {/* Действия */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditingLease(lease)}
                            disabled={isDeleting}
                            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
                          >
                            Изм.
                          </button>
                          <button
                            onClick={() => void handleDelete(lease)}
                            disabled={isDeleting}
                            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                          >
                            {isDeleting ? '…' : 'Удл.'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-medium text-gray-700 text-sm">
                  <td className="px-4 py-3">Итого</td>
                  <td className="px-4 py-3 text-right">
                    {totalArea.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">—</td>
                  <td className="px-4 py-3 text-right">
                    {formatRub(totalAnnualIncome)}
                  </td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* График аренды */}
      {leases.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            График аренды
          </p>
          <GanttChart
            leases={leases as GanttLease[]}
            fundStartDate={fundStartDate}
            fundEndDate={fundEndDate}
          />
        </div>
      )}

      {/* Модал — добавить договор */}
      {showAdd && (
        <LeaseModal
          title="Добавить договор аренды"
          onClose={() => setShowAdd(false)}
        >
          <LeaseForm
            propertyId={propertyId}
            onSuccess={handleAdded}
            onCancel={() => setShowAdd(false)}
          />
        </LeaseModal>
      )}

      {/* Модал — редактировать договор */}
      {editingLease && (
        <LeaseModal
          title={`Изменить договор — ${editingLease.tenantName}`}
          onClose={() => setEditingLease(null)}
        >
          <LeaseForm
            propertyId={propertyId}
            initialData={{ ...editingLease, propertyId }}
            onSuccess={handleEdited}
            onCancel={() => setEditingLease(null)}
          />
        </LeaseModal>
      )}
    </div>
  )
}

function LeaseModal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ─── Вкладка 2: Денежный поток ───────────────────────────────────────────────

type DCFSummary = {
  npv: number
  irr: number
  terminalValue: number
  discountRate: number
  projectionYears: number
}

function CashflowTab({
  propertyId,
  acquisitionPrice,
  purchaseDate,
  saleDate,
  exitCapRate,
}: {
  propertyId: string
  acquisitionPrice: number | null
  purchaseDate: string | null
  saleDate: string | null
  exitCapRate: number | null
}) {
  const [cashflows, setCashflows] = useState<MonthlyCashflow[]>([])
  const [cfLoading, setCfLoading] = useState(true)
  const [cfError, setCfError]     = useState<string | null>(null)

  const [dcf, setDcf]               = useState<DCFSummary | null>(null)
  const [dcfLoading, setDcfLoading] = useState(true)
  const [dcfError, setDcfError]     = useState<string | null>(null)

  useEffect(() => {
    setCfLoading(true)
    setCfError(null)
    fetch(`/api/cashflow/property/${propertyId}`)
      .then(async res => {
        const json = await res.json() as { data?: MonthlyCashflow[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки')
        setCashflows(json.data ?? [])
      })
      .catch(err => setCfError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setCfLoading(false))
  }, [propertyId])

  useEffect(() => {
    setDcfLoading(true)
    setDcfError(null)
    setDcf(null)
    fetch(`/api/dcf/property/${propertyId}`)
      .then(async res => {
        const json = await res.json() as { data?: DCFSummary; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки DCF')
        setDcf(json.data ?? null)
      })
      .catch(err => setDcfError(err instanceof Error ? err.message : 'Ошибка загрузки DCF'))
      .finally(() => setDcfLoading(false))
  }, [propertyId])

  // Расчётная стоимость продажи = NOI следующих 12 мес после saleDate / exitCapRate
  const salePrice = useMemo(() => {
    if (!saleDate || !exitCapRate || exitCapRate === 0 || cashflows.length === 0) return null
    const sale = new Date(saleDate)
    const saleYear = sale.getFullYear()
    const saleMonth = sale.getMonth() + 1
    const futureCFs = cashflows
      .filter(cf =>
        cf.period.year > saleYear ||
        (cf.period.year === saleYear && cf.period.month >= saleMonth)
      )
      .slice(0, 12)
    if (futureCFs.length === 0) return null
    const noi12 = futureCFs.reduce((sum, cf) => sum + cf.noi, 0)
    const annualNOI = futureCFs.length < 12 ? (noi12 * 12) / futureCFs.length : noi12
    return annualNOI / exitCapRate
  }, [cashflows, saleDate, exitCapRate])

  return (
    <div className="space-y-4">
      {/* Даты и стоимость продажи */}
      {(purchaseDate ?? saleDate ?? acquisitionPrice) !== null && (
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          {acquisitionPrice !== null && (
            <span className="text-gray-600">
              Цена приобретения:{' '}
              <span className="font-medium text-gray-900">{formatRub(acquisitionPrice)}</span>
            </span>
          )}
          {purchaseDate && (
            <span className="text-gray-600">
              Дата покупки:{' '}
              <span className="font-medium text-gray-900">{formatDate(purchaseDate)}</span>
            </span>
          )}
          {saleDate && (
            <span className="text-gray-600">
              Дата продажи:{' '}
              <span className="font-medium text-gray-900">{formatDate(saleDate)}</span>
            </span>
          )}
          {salePrice !== null && (
            <span className="text-gray-600">
              Расч. стоимость продажи:{' '}
              <span className="font-medium text-blue-700">{formatRub(salePrice)}</span>
              {exitCapRate !== null && (
                <span className="text-gray-400 ml-1">
                  (Exit Cap {formatPct(exitCapRate)})
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* График NOI/FCF */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          NOI и FCF помесячно
        </p>
        {cfLoading ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-gray-400">
            Загрузка…
          </div>
        ) : cfError ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-red-500">
            {cfError}
          </div>
        ) : (
          <CashflowChart cashflows={cashflows} />
        )}
      </div>

      {/* Таблица CF */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
          Помесячный денежный поток
        </p>
        {cfLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Загрузка…</div>
        ) : cfError ? (
          <div className="py-12 text-center text-sm text-red-500">{cfError}</div>
        ) : (
          <CashflowTable cashflows={cashflows} variant="property" />
        )}
      </div>

      {/* DCF блок */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-900 mb-4">DCF-модель</p>
        {dcfError ? (
          <p className="text-sm text-red-500">{dcfError}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <DcfMetric
                label="Горизонт, лет"
                value={dcf ? String(dcf.projectionYears) : null}
                loading={dcfLoading}
              />
              <DcfMetric
                label="Ставка диск. (WACC)"
                value={dcf ? formatPct(dcf.discountRate) : null}
                loading={dcfLoading}
              />
              <DcfMetric
                label="Терм. стоимость"
                value={dcf ? formatRub(dcf.terminalValue) : null}
                loading={dcfLoading}
              />
              <DcfMetric
                label="NPV"
                value={dcf ? formatRub(dcf.npv) : null}
                loading={dcfLoading}
                {...(dcf ? { highlight: dcf.npv >= 0 ? 'positive' as const : 'negative' as const } : {})}
              />
              <DcfMetric
                label="IRR"
                value={dcf ? (dcf.irr > 0 ? formatPct(dcf.irr) : '—') : null}
                loading={dcfLoading}
                {...(dcf && dcf.irr === 0 ? { sublabel: 'нет цены приобр.' } : {})}
              />
            </div>

            {(saleDate !== null || salePrice !== null || cfLoading) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-gray-100">
                <DcfMetric
                  label="Дата продажи"
                  value={saleDate ? formatDate(saleDate) : '—'}
                  loading={false}
                />
                <DcfMetric
                  label="Расч. стоимость продажи"
                  value={salePrice !== null ? formatRub(salePrice) : null}
                  loading={cfLoading}
                  {...(exitCapRate !== null
                    ? { sublabel: `Exit Cap ${formatPct(exitCapRate)}` }
                    : {})}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DcfMetric({
  label,
  value,
  loading,
  highlight,
  sublabel,
}: {
  label: string
  value: string | null
  loading: boolean
  highlight?: 'positive' | 'negative'
  sublabel?: string
}) {
  const valueColor =
    highlight === 'positive' ? 'text-green-600' :
    highlight === 'negative' ? 'text-red-600'   :
    'text-gray-900'

  return (
    <div className="bg-gray-50 rounded-md px-3 py-2.5">
      <p className="text-xs text-gray-400">{label}</p>
      {loading ? (
        <div className="mt-1 h-4 w-16 bg-gray-200 rounded animate-pulse" />
      ) : (
        <>
          <p className={`text-sm font-medium mt-0.5 ${valueColor}`}>
            {value ?? '—'}
          </p>
          {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
        </>
      )}
    </div>
  )
}
