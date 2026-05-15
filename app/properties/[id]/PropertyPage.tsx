'use client'

import { Fragment, useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatRub, formatPct, formatDate } from '@/lib/utils/format'
import { PropertyForm } from '@/components/forms/PropertyForm'
import { StepRentModal } from '@/components/modals/StepRentModal'
import { GanttChart } from '@/components/charts/GanttChart'
import type { GanttLease } from '@/components/charts/GanttChart'
import { exportRentRollToExcel } from '@/lib/utils/exportRentRoll'
import { CashflowChart } from '@/components/charts/CashflowChart'
import { CashflowTable } from '@/components/tables/CashflowTable'
import type { MonthlyCashflow } from '@/lib/types'
// Обоснованное исключение из правила «расчёты только в lib/calculations»:
// интерактивный пересчёт DCF при изменении exitCapRate выполняется на клиенте.
import { calcDCF } from '@/lib/calculations/dcf'

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

type TerminalType = 'EXIT_CAP_RATE' | 'GORDON'

type PipelineStatus = 'SCREENING' | 'DUE_DILIGENCE' | 'APPROVED' | 'IN_FUND' | 'REJECTED' | 'SOLD'

type FundLink = {
  fundId: string
  fundName: string
  ownershipPct: number
}

type PropertyData = {
  id: string
  // V3.8.1: объект может быть в нескольких фондах или ни в одном (pipeline-only).
  // fundId/fundName — первый привязанный фонд (для breadcrumb), null если pipeline.
  fundId: string | null
  fundName: string | null
  fundStartDate: string | null
  fundEndDate: string | null
  pipelineStatus: PipelineStatus
  funds: FundLink[]
  name: string
  type: PropertyType
  address: string
  totalArea: number
  rentableArea: number
  acquisitionPrice: number | null
  purchaseDate: string | null
  saleDate: string | null
  exitCapRate: number | null
  wacc: number
  projectionYears: number
  terminalType: TerminalType
  gordonGrowthRate: number | null
  cadastralValue: number | null
  landCadastralValue: number | null
  propertyTaxRate: number
  landTaxRate: number
  opexRate: number
  maintenanceRate: number
  wault: number
  leaseContracts: LeaseContract[]
}

type Tab = 'main' | 'tenants' | 'expenses' | 'capex' | 'debt' | 'cashflow' | 'reports'

const TABS: { id: Tab; label: string }[] = [
  { id: 'main',     label: 'Основное'       },
  { id: 'tenants',  label: 'Арендаторы'     },
  { id: 'expenses', label: 'Расходы'        },
  { id: 'capex',    label: 'CAPEX'          },
  { id: 'debt',     label: 'Долг'           },
  { id: 'cashflow', label: 'Денежный поток' },
  { id: 'reports',  label: 'Отчёты'         },
]

export function PropertyPage({ property }: { property: PropertyData }) {
  const [activeTab, setActiveTab] = useState<Tab>('main')

  // CF загружается на уровне страницы — разделяется между вкладками
  // «Расходы» и «Денежный поток» (V3.6.2: «без дополнительного fetch»).
  const [cashflows, setCashflows] = useState<MonthlyCashflow[]>([])
  const [cfLoading, setCfLoading] = useState(true)
  const [cfError, setCfError]     = useState<string | null>(null)

  useEffect(() => {
    setCfLoading(true)
    setCfError(null)
    fetch(`/api/cashflow/property/${property.id}`)
      .then(async res => {
        const json = await res.json() as { data?: MonthlyCashflow[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки')
        setCashflows(json.data ?? [])
      })
      .catch(err => setCfError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setCfLoading(false))
  }, [property.id])

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
            {property.fundId && property.fundName ? (
              <>
                <Link
                  href={`/funds/${property.fundId}`}
                  className="text-sm text-gray-500 hover:text-gray-700 shrink-0 max-w-[140px] truncate"
                >
                  {property.fundName}
                </Link>
                <span className="text-gray-300 shrink-0">/</span>
              </>
            ) : (
              <>
                <Link href="/pipeline" className="text-sm text-gray-500 hover:text-gray-700 shrink-0">
                  Pipeline
                </Link>
                <span className="text-gray-300 shrink-0">/</span>
              </>
            )}
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
            {activeTab === 'main' && <MainTab property={property} />}
            {activeTab === 'tenants' && (
              <TenantsTab
                leases={property.leaseContracts}
                propertyId={property.id}
                wault={property.wault}
                rentableArea={property.rentableArea}
                propertyName={property.name}
                {...(property.fundStartDate ? { fundStartDate: property.fundStartDate } : {})}
                {...(property.fundEndDate ? { fundEndDate: property.fundEndDate } : {})}
              />
            )}
            {activeTab === 'expenses' && (
              <ExpensesTab cashflows={cashflows} loading={cfLoading} error={cfError} />
            )}
            {activeTab === 'capex' && <CapexTab propertyId={property.id} />}
            {activeTab === 'debt' && <PlaceholderTab text="Долг на уровне объекта будет добавлен в следующей версии." />}
            {activeTab === 'cashflow' && (
              <CashflowTab
                propertyId={property.id}
                acquisitionPrice={property.acquisitionPrice}
                purchaseDate={property.purchaseDate}
                saleDate={property.saleDate}
                exitCapRate={property.exitCapRate}
                cashflows={cashflows}
                cfLoading={cfLoading}
                cfError={cfError}
              />
            )}
            {activeTab === 'reports' && <PlaceholderTab text="Раздел отчётов будет добавлен в следующей версии." />}
          </div>
        </div>
      </main>
    </div>
  )
}

// ─── Вкладка 1: Арендаторы (V3.6.3 — inline-редактирование) ──────────────────

type LeaseFormState = {
  tenantName: string
  area: string
  baseRent: string
  indexationType: IndexationType
  indexationRate: string
  firstIndexationDate: string
  indexationFrequency: string
  opexReimbursementRate: string
  opexReimbursementIndexationType: IndexationType
  opexReimbursementIndexationRate: string
  opexFirstIndexationDate: string
  opexIndexationFrequency: string
  startDate: string
  endDate: string
  status: LeaseStatus
}

const emptyLeaseFormState: LeaseFormState = {
  tenantName: '',
  area: '',
  baseRent: '',
  indexationType: 'CPI',
  indexationRate: '',
  firstIndexationDate: '',
  indexationFrequency: '',
  opexReimbursementRate: '',
  opexReimbursementIndexationType: 'NONE',
  opexReimbursementIndexationRate: '',
  opexFirstIndexationDate: '',
  opexIndexationFrequency: '',
  startDate: '',
  endDate: '',
  status: 'ACTIVE',
}

function leaseToFormState(lease: LeaseContract): LeaseFormState {
  return {
    tenantName: lease.tenantName,
    area: String(lease.area),
    baseRent: String(lease.baseRent),
    indexationType: lease.indexationType,
    indexationRate: lease.indexationRate != null ? String(+(lease.indexationRate * 100).toFixed(4)) : '',
    firstIndexationDate: lease.firstIndexationDate ? lease.firstIndexationDate.slice(0, 10) : '',
    indexationFrequency: lease.indexationFrequency != null ? String(lease.indexationFrequency) : '',
    opexReimbursementRate: String(lease.opexReimbursementRate),
    opexReimbursementIndexationType: lease.opexReimbursementIndexationType,
    opexReimbursementIndexationRate: lease.opexReimbursementIndexationRate != null
      ? String(+(lease.opexReimbursementIndexationRate * 100).toFixed(4))
      : '',
    opexFirstIndexationDate: lease.opexFirstIndexationDate ? lease.opexFirstIndexationDate.slice(0, 10) : '',
    opexIndexationFrequency: lease.opexIndexationFrequency != null ? String(lease.opexIndexationFrequency) : '',
    startDate: lease.startDate.slice(0, 10),
    endDate: lease.endDate.slice(0, 10),
    status: lease.status,
  }
}

const tInputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const tLabelCls = 'block text-xs font-medium text-gray-600 mb-0.5'

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
  fundStartDate?: string
  fundEndDate?: string
}) {
  const router = useRouter()
  // 'new' — добавление нового арендатора, lease.id — редактирование существующего
  const [expandedId, setExpandedId]   = useState<string | null>(null)
  const [form, setForm]               = useState<LeaseFormState>(emptyLeaseFormState)
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  // V3.6.4: целевой договор для модала «Лестничная ставка». null — модал закрыт.
  const [stepRentLease, setStepRentLease] = useState<{ id: string; tenantName: string } | null>(null)

  function startAdd() {
    setForm(emptyLeaseFormState)
    setExpandedId('new')
    setSaveError(null)
  }

  function expand(lease: LeaseContract) {
    setForm(leaseToFormState(lease))
    setExpandedId(lease.id)
    setSaveError(null)
  }

  function collapse() {
    setExpandedId(null)
    setSaveError(null)
  }

  function setField<K extends keyof LeaseFormState>(field: K, value: LeaseFormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setSaveError(null)

    const area = parseFloat(form.area)
    const baseRent = parseFloat(form.baseRent)
    const opexRate = parseFloat(form.opexReimbursementRate)

    if (!form.tenantName.trim()) { setSaveError('Укажите арендатора'); return }
    if (isNaN(area) || area <= 0) { setSaveError('Укажите корректную площадь'); return }
    if (isNaN(baseRent) || baseRent <= 0) { setSaveError('Укажите базовую ставку аренды'); return }
    if (!form.startDate || !form.endDate) { setSaveError('Укажите даты начала и окончания'); return }
    if (form.endDate <= form.startDate) { setSaveError('Дата окончания должна быть позже начала'); return }
    if (isNaN(opexRate) || opexRate < 0) { setSaveError('Укажите ставку возмещения OPEX (можно 0)'); return }

    let indexationRate: number | null = null
    if (form.indexationType === 'FIXED') {
      const r = parseFloat(form.indexationRate)
      if (isNaN(r) || r < 0) { setSaveError('Укажите ставку индексации аренды'); return }
      indexationRate = r / 100
    }

    let opexIndexationRate: number | null = null
    if (form.opexReimbursementIndexationType === 'FIXED') {
      const r = parseFloat(form.opexReimbursementIndexationRate)
      if (isNaN(r) || r < 0) { setSaveError('Укажите ставку индексации OPEX'); return }
      opexIndexationRate = r / 100
    }

    const body = {
      propertyId,
      tenantName: form.tenantName.trim(),
      area,
      baseRent,
      indexationType: form.indexationType,
      indexationRate,
      firstIndexationDate: form.firstIndexationDate !== '' ? form.firstIndexationDate : null,
      indexationFrequency: form.indexationFrequency !== '' ? parseInt(form.indexationFrequency, 10) : null,
      opexReimbursementRate: opexRate,
      opexReimbursementIndexationType: form.opexReimbursementIndexationType,
      opexReimbursementIndexationRate: opexIndexationRate,
      opexFirstIndexationDate: form.opexFirstIndexationDate !== '' ? form.opexFirstIndexationDate : null,
      opexIndexationFrequency: form.opexIndexationFrequency !== '' ? parseInt(form.opexIndexationFrequency, 10) : null,
      startDate: form.startDate,
      endDate: form.endDate,
      status: form.status,
    }

    const isNew = expandedId === 'new'
    setSaving(true)
    try {
      const url = isNew ? '/api/leases' : `/api/leases/${expandedId}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setSaveError(json.error ?? 'Ошибка сохранения')
        return
      }
      setExpandedId(null)
      router.refresh()
    } catch {
      setSaveError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(lease: LeaseContract) {
    if (!window.confirm(`Удалить договор с «${lease.tenantName}»?`)) return
    setDeletingId(lease.id)
    try {
      const res = await fetch(`/api/leases/${lease.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        alert(json.error ?? 'Ошибка удаления')
        return
      }
      collapse()
      router.refresh()
    } catch {
      alert('Ошибка сети')
    } finally {
      setDeletingId(null)
    }
  }

  function handleExport() {
    exportRentRollToExcel(leases, rentableArea, wault, propertyName)
  }

  function triggerStepRent(lease: LeaseContract | null) {
    // V3.6.4: модал доступен только для уже сохранённого договора.
    // Для нового арендатора («new») сначала нужно сохранить.
    if (lease === null) {
      alert('Сначала сохраните арендатора, затем настройте лестничную ставку.')
      return
    }
    setStepRentLease({ id: lease.id, tenantName: lease.tenantName })
  }

  return (
    <div className="space-y-4">
      {/* WAULT + Экспорт + Добавить */}
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
        <button
          onClick={startAdd}
          disabled={expandedId === 'new'}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Добавить арендатора
        </button>
      </div>

      {/* Модал лестничной ставки (V3.6.4) */}
      {stepRentLease !== null && (
        <StepRentModal
          leaseId={stepRentLease.id}
          tenantName={stepRentLease.tenantName}
          onClose={() => setStepRentLease(null)}
          onSaved={() => {
            setStepRentLease(null)
            router.refresh()
          }}
        />
      )}

      {/* Таблица арендаторов */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium uppercase tracking-wide">
                <th className="text-left px-4 py-3">Арендатор</th>
                <th className="text-right px-4 py-3">Площадь, м²</th>
                <th className="text-right px-4 py-3">Ставка, ₽/м²/год</th>
                <th className="text-left px-4 py-3">Статус</th>
                <th className="text-left px-4 py-3">Начало</th>
                <th className="text-left px-4 py-3">Окончание</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {expandedId === 'new' && (
                <Fragment>
                  <tr className="border-b border-gray-100 bg-blue-50/30">
                    <td colSpan={7} className="px-4 py-2 italic text-xs text-blue-700">
                      Новый арендатор — заполните поля ниже
                    </td>
                  </tr>
                  <LeaseExpandedRow
                    form={form}
                    setField={setField}
                    saving={saving}
                    saveError={saveError}
                    onSave={() => void handleSave()}
                    onCancel={collapse}
                    onStepRent={() => triggerStepRent(null)}
                  />
                </Fragment>
              )}

              {leases.length === 0 && expandedId !== 'new' && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    Договоров аренды нет — нажмите «+ Добавить арендатора»
                  </td>
                </tr>
              )}

              {leases.map(lease => {
                const isExpanded = expandedId === lease.id
                const isDeleting = deletingId === lease.id
                const st = LEASE_STATUS_STYLES[lease.status]
                return (
                  <Fragment key={lease.id}>
                    <tr
                      onClick={() => isExpanded ? collapse() : expand(lease)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-blue-50/30' : isDeleting ? 'opacity-40' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{lease.tenantName}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {lease.area.toLocaleString('ru-RU')}
                      </td>
                      <td
                        className="px-4 py-3 text-right text-gray-700"
                        onDoubleClick={e => {
                          e.stopPropagation()
                          triggerStepRent(lease)
                        }}
                        title="Двойной клик — лестничная ставка"
                      >
                        {lease.baseRent.toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(lease.startDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(lease.endDate)}</td>
                      <td className="px-4 py-3 text-center text-gray-400 text-xs">
                        {isExpanded ? '▼' : '▶'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <LeaseExpandedRow
                        form={form}
                        setField={setField}
                        saving={saving}
                        saveError={saveError}
                        onSave={() => void handleSave()}
                        onCancel={collapse}
                        onStepRent={() => triggerStepRent(lease)}
                        onDelete={() => void handleDelete(lease)}
                        isDeleting={isDeleting}
                      />
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* График аренды */}
      {leases.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            График аренды
          </p>
          <GanttChart
            leases={leases as GanttLease[]}
            {...(fundStartDate ? { fundStartDate } : {})}
            {...(fundEndDate ? { fundEndDate } : {})}
          />
        </div>
      )}
    </div>
  )
}

// ─── Развёрнутая панель строки арендатора ────────────────────────────────────

function LeaseExpandedRow({
  form,
  setField,
  saving,
  saveError,
  onSave,
  onCancel,
  onStepRent,
  onDelete,
  isDeleting,
}: {
  form: LeaseFormState
  setField: <K extends keyof LeaseFormState>(field: K, value: LeaseFormState[K]) => void
  saving: boolean
  saveError: string | null
  onSave: () => void
  onCancel: () => void
  onStepRent: () => void
  onDelete?: () => void
  isDeleting?: boolean
}) {
  return (
    <tr className="bg-blue-50/30 border-b border-gray-200">
      <td colSpan={7} className="px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-3">

          {/* Левая колонка — Аренда */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Аренда</p>

            <div>
              <label className={tLabelCls}>Арендатор</label>
              <input
                type="text"
                value={form.tenantName}
                onChange={e => setField('tenantName', e.target.value)}
                className={tInputCls}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={tLabelCls}>Площадь, м²</label>
                <input
                  type="number"
                  value={form.area}
                  onChange={e => setField('area', e.target.value)}
                  min="0"
                  step="0.1"
                  className={tInputCls}
                  disabled={saving}
                />
              </div>
              <div>
                <label className={tLabelCls}>Ставка аренды, ₽/м²/год</label>
                <input
                  type="number"
                  value={form.baseRent}
                  onChange={e => setField('baseRent', e.target.value)}
                  onDoubleClick={onStepRent}
                  title="Двойной клик — лестничная ставка"
                  min="0"
                  step="1"
                  className={tInputCls}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={tLabelCls}>Тип индексации</label>
                <select
                  value={form.indexationType}
                  onChange={e => setField('indexationType', e.target.value as IndexationType)}
                  className={tInputCls + ' bg-white'}
                  disabled={saving}
                >
                  <option value="CPI">ИПЦ</option>
                  <option value="FIXED">Фиксированная</option>
                  <option value="NONE">Нет</option>
                </select>
              </div>
              {form.indexationType === 'FIXED' && (
                <div>
                  <label className={tLabelCls}>Ставка индексации, %</label>
                  <input
                    type="number"
                    value={form.indexationRate}
                    onChange={e => setField('indexationRate', e.target.value)}
                    min="0"
                    step="0.01"
                    className={tInputCls}
                    disabled={saving}
                  />
                </div>
              )}
            </div>

            {form.indexationType !== 'NONE' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={tLabelCls}>Дата первой индексации</label>
                  <input
                    type="date"
                    value={form.firstIndexationDate}
                    onChange={e => setField('firstIndexationDate', e.target.value)}
                    className={tInputCls}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className={tLabelCls}>Частота индексации</label>
                  <select
                    value={form.indexationFrequency}
                    onChange={e => setField('indexationFrequency', e.target.value)}
                    className={tInputCls + ' bg-white'}
                    disabled={saving}
                  >
                    <option value="">— ежегодно —</option>
                    <option value="3">3 мес</option>
                    <option value="6">6 мес</option>
                    <option value="12">12 мес</option>
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={tLabelCls}>Статус</label>
                <select
                  value={form.status}
                  onChange={e => setField('status', e.target.value as LeaseStatus)}
                  className={tInputCls + ' bg-white'}
                  disabled={saving}
                >
                  <option value="ACTIVE">Действующий</option>
                  <option value="TERMINATING">Расторгается</option>
                  <option value="EXPIRED">Истёк</option>
                </select>
              </div>
              <div>
                <label className={tLabelCls}>Дата начала</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setField('startDate', e.target.value)}
                  className={tInputCls}
                  disabled={saving}
                />
              </div>
              <div>
                <label className={tLabelCls}>Дата окончания</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setField('endDate', e.target.value)}
                  className={tInputCls}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          {/* Правая колонка — Возмещение OPEX */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Возмещение OPEX</p>

            <div>
              <label className={tLabelCls}>Ставка OPEX возм., ₽/м²/год</label>
              <input
                type="number"
                value={form.opexReimbursementRate}
                onChange={e => setField('opexReimbursementRate', e.target.value)}
                min="0"
                step="1"
                className={tInputCls}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={tLabelCls}>Тип индексации OPEX</label>
                <select
                  value={form.opexReimbursementIndexationType}
                  onChange={e => setField('opexReimbursementIndexationType', e.target.value as IndexationType)}
                  className={tInputCls + ' bg-white'}
                  disabled={saving}
                >
                  <option value="CPI">ИПЦ</option>
                  <option value="FIXED">Фиксированная</option>
                  <option value="NONE">Нет</option>
                </select>
              </div>
              {form.opexReimbursementIndexationType === 'FIXED' && (
                <div>
                  <label className={tLabelCls}>Ставка индексации, %</label>
                  <input
                    type="number"
                    value={form.opexReimbursementIndexationRate}
                    onChange={e => setField('opexReimbursementIndexationRate', e.target.value)}
                    min="0"
                    step="0.01"
                    className={tInputCls}
                    disabled={saving}
                  />
                </div>
              )}
            </div>

            {form.opexReimbursementIndexationType !== 'NONE' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={tLabelCls}>Дата первой инд. OPEX</label>
                  <input
                    type="date"
                    value={form.opexFirstIndexationDate}
                    onChange={e => setField('opexFirstIndexationDate', e.target.value)}
                    className={tInputCls}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className={tLabelCls}>Частота инд. OPEX</label>
                  <select
                    value={form.opexIndexationFrequency}
                    onChange={e => setField('opexIndexationFrequency', e.target.value)}
                    className={tInputCls + ' bg-white'}
                    disabled={saving}
                  >
                    <option value="">— ежегодно —</option>
                    <option value="3">3 мес</option>
                    <option value="6">6 мес</option>
                    <option value="12">12 мес</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-red-600 mt-3">{saveError}</p>
        )}

        <div className="flex gap-3 mt-4 pt-3 border-t border-gray-200">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving || isDeleting}
              className="ml-auto rounded-md border border-red-200 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? 'Удаление…' : 'Удалить'}
            </button>
          )}
        </div>
      </td>
    </tr>
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
  cashflows,
  cfLoading,
  cfError,
}: {
  propertyId: string
  acquisitionPrice: number | null
  purchaseDate: string | null
  saleDate: string | null
  exitCapRate: number | null
  cashflows: MonthlyCashflow[]
  cfLoading: boolean
  cfError: string | null
}) {
  const [dcf, setDcf]               = useState<DCFSummary | null>(null)
  const [dcfLoading, setDcfLoading] = useState(true)
  const [dcfError, setDcfError]     = useState<string | null>(null)

  // Интерактивный exitCapRate — локальный override без сохранения в БД (V3.5.2).
  // null означает «нет override», эффективным считается значение из БД (prop exitCapRate).
  const [localCapRate, setLocalCapRate]   = useState<number | null>(null)
  const [capRateEdit, setCapRateEdit]     = useState(false)
  const [capRateInput, setCapRateInput]   = useState('')

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

  // Эффективный exitCapRate: либо локальное значение (override), либо из БД.
  const effectiveCapRate = localCapRate ?? exitCapRate
  const isOverridden = localCapRate !== null && localCapRate !== exitCapRate

  // Локальный пересчёт DCF при изменении exitCapRate без сохранения в БД (V3.5.2).
  // Перерасчёт активен только если: cashflows загружены, есть discountRate (WACC из API),
  // и localCapRate отличается от значения из БД.
  const localDcf = useMemo(() => {
    if (cashflows.length === 0 || dcf === null) return null
    if (localCapRate === null) return null
    return calcDCF(cashflows, dcf.discountRate, localCapRate, acquisitionPrice ?? 0)
  }, [cashflows, dcf, localCapRate, acquisitionPrice])

  const effTerminalValue = localDcf?.terminalValue ?? dcf?.terminalValue
  const effNpv           = localDcf?.npv           ?? dcf?.npv
  const effIrr           = localDcf?.irr           ?? dcf?.irr

  function enterCapEdit() {
    const v = effectiveCapRate
    setCapRateInput(v !== null ? String(+(v * 100).toFixed(2)) : '')
    setCapRateEdit(true)
  }

  function commitCapEdit() {
    const trimmed = capRateInput.trim()
    if (trimmed === '') {
      setLocalCapRate(null)
    } else {
      const parsed = parseFloat(trimmed)
      if (!isNaN(parsed) && parsed > 0) {
        const asFraction = parsed / 100
        setLocalCapRate(asFraction === exitCapRate ? null : asFraction)
      }
    }
    setCapRateEdit(false)
  }

  function resetCapRate() {
    setLocalCapRate(null)
    setCapRateEdit(false)
  }

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

      {/* DCF блок */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-900 mb-4">DCF-модель</p>
        {dcfError ? (
          <p className="text-sm text-red-500">{dcfError}</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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

              {/* Интерактивный Cap Rate выхода */}
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-400">Cap Rate выхода</p>
                {capRateEdit ? (
                  <input
                    type="number"
                    step="0.1"
                    autoFocus
                    value={capRateInput}
                    onChange={e => setCapRateInput(e.target.value)}
                    onBlur={commitCapEdit}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitCapEdit()
                      if (e.key === 'Escape') setCapRateEdit(false)
                    }}
                    className="w-full bg-white border border-blue-400 rounded px-2 py-0.5 text-base font-semibold text-gray-900 mt-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p
                    onClick={enterCapEdit}
                    title="Кликните для редактирования"
                    className={[
                      'text-base font-semibold mt-0.5 cursor-pointer hover:underline',
                      isOverridden ? 'text-blue-700' : 'text-gray-900',
                    ].join(' ')}
                  >
                    {effectiveCapRate !== null ? formatPct(effectiveCapRate) : '—'}
                  </p>
                )}
                {isOverridden && !capRateEdit && (
                  <button
                    type="button"
                    onClick={resetCapRate}
                    className="text-xs text-blue-600 hover:underline mt-1"
                  >
                    Сбросить
                  </button>
                )}
              </div>

              <DcfMetric
                label="Терм. стоимость"
                value={effTerminalValue !== undefined ? formatRub(effTerminalValue) : null}
                loading={dcfLoading}
              />
              <DcfMetric
                label="NPV"
                value={effNpv !== undefined ? formatRub(effNpv) : null}
                loading={dcfLoading}
                {...(effNpv !== undefined ? { highlight: effNpv >= 0 ? 'positive' as const : 'negative' as const } : {})}
              />
              <DcfMetric
                label="IRR"
                value={effIrr !== undefined ? (effIrr > 0 ? formatPct(effIrr) : '—') : null}
                loading={dcfLoading}
                {...(effIrr === 0 ? { sublabel: 'нет цены приобр.' } : {})}
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

// ─── Вкладка «Основное» ──────────────────────────────────────────────────────

const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  SCREENING:     'Скрининг',
  DUE_DILIGENCE: 'Due Diligence',
  APPROVED:      'Одобрен',
  IN_FUND:       'В фонде',
  REJECTED:      'Отклонён',
  SOLD:          'Продан',
}

const PIPELINE_STATUS_BADGE_CLS: Record<PipelineStatus, string> = {
  SCREENING:     'bg-gray-100 text-gray-700',
  DUE_DILIGENCE: 'bg-yellow-100 text-yellow-800',
  APPROVED:      'bg-blue-100 text-blue-800',
  IN_FUND:       'bg-green-100 text-green-800',
  REJECTED:      'bg-red-100 text-red-700',
  SOLD:          'bg-gray-300 text-gray-800',
}

// V3.8.3: какие значения доступны в select из текущего состояния.
// IN_FUND всегда disabled — проставляется автоматически при привязке к фонду.
// SOLD доступен только из IN_FUND. Из SOLD выходить вручную нельзя.
function pipelineOptionsFor(current: PipelineStatus): { value: PipelineStatus; disabled: boolean }[] {
  const all: PipelineStatus[] = ['SCREENING', 'DUE_DILIGENCE', 'APPROVED', 'IN_FUND', 'REJECTED', 'SOLD']
  return all.map(value => {
    if (value === current) return { value, disabled: false }
    if (value === 'IN_FUND') return { value, disabled: true }
    if (current === 'SOLD') return { value, disabled: true }
    if (current === 'IN_FUND') return { value, disabled: value !== 'SOLD' }
    // current ∈ {SCREENING, DUE_DILIGENCE, APPROVED, REJECTED}
    return { value, disabled: value === 'SOLD' }
  })
}

function StatusSection({ property }: { property: PropertyData }) {
  const router = useRouter()
  const [status, setStatus] = useState<PipelineStatus>(property.pipelineStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Если родительский props обновился (после router.refresh) — синхронизируем локальный state.
  useEffect(() => { setStatus(property.pipelineStatus) }, [property.pipelineStatus])

  const options = pipelineOptionsFor(property.pipelineStatus)

  async function handleChange(next: PipelineStatus) {
    if (next === property.pipelineStatus) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${property.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json() as { data?: unknown; error?: string }
      if (!res.ok) {
        setError(json.error ?? 'Ошибка обновления статуса')
        setStatus(property.pipelineStatus)
        return
      }
      setStatus(next)
      router.refresh()
    } catch {
      setError('Ошибка сети')
      setStatus(property.pipelineStatus)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Статус</p>
        <span
          className={
            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
            PIPELINE_STATUS_BADGE_CLS[status]
          }
        >
          {PIPELINE_STATUS_LABELS[status]}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={status}
          onChange={e => handleChange(e.target.value as PipelineStatus)}
          disabled={saving}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {PIPELINE_STATUS_LABELS[opt.value]}
            </option>
          ))}
        </select>
        {saving && <span className="text-xs text-gray-400">Сохранение…</span>}
      </div>

      <div className="text-xs text-gray-500 leading-relaxed">
        {property.pipelineStatus === 'IN_FUND' ? (
          <>
            Статус «В фонде» проставлен автоматически. Чтобы вернуть в pipeline —
            отвяжите объект от фонда. Доступен переход «Продан».
          </>
        ) : property.pipelineStatus === 'SOLD' ? (
          <>Объект продан. Статус терминальный.</>
        ) : (
          <>
            «В фонде» проставляется автоматически при привязке к фонду. «Продан» доступен
            только когда объект уже находится в фонде.
          </>
        )}
      </div>

      {property.funds.length > 0 && (
        <div className="pt-2 border-t border-gray-100 text-xs text-gray-500">
          Привязан к {property.funds.length === 1 ? 'фонду' : 'фондам'}:{' '}
          <span className="text-gray-700">
            {property.funds.map(f => `${f.fundName} (${f.ownershipPct}%)`).join(', ')}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

function MainTab({ property }: { property: PropertyData }) {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <StatusSection property={property} />
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Параметры объекта</p>
        <p className="text-xs text-gray-400">
          % владения фонда:{' '}
          <span className="font-medium text-gray-700">100%</span>
        </p>
      </div>
      <PropertyForm
        initialData={{
          id: property.id,
          name: property.name,
          type: property.type,
          address: property.address,
          totalArea: property.totalArea,
          rentableArea: property.rentableArea,
          cadastralValue: property.cadastralValue,
          landCadastralValue: property.landCadastralValue,
          propertyTaxRate: property.propertyTaxRate,
          landTaxRate: property.landTaxRate,
          opexRate: property.opexRate,
          maintenanceRate: property.maintenanceRate,
          acquisitionPrice: property.acquisitionPrice,
          purchaseDate: property.purchaseDate,
          saleDate: property.saleDate,
          exitCapRate: property.exitCapRate,
          wacc: property.wacc,
          projectionYears: property.projectionYears,
          terminalType: property.terminalType,
          gordonGrowthRate: property.gordonGrowthRate,
        }}
        onSuccess={() => router.refresh()}
      />
      </div>
    </div>
  )
}

// ─── Вкладка «Расходы» ───────────────────────────────────────────────────────

function ExpensesTab({
  cashflows,
  loading,
  error,
}: {
  cashflows: MonthlyCashflow[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Загрузка…</div>
  }
  if (error) {
    return <div className="py-12 text-center text-sm text-red-500">{error}</div>
  }
  if (cashflows.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-400">Нет данных для отображения</div>
  }

  const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'] as const

  const yearGroups = new Map<number, number[]>()
  cashflows.forEach((cf, idx) => {
    const list = yearGroups.get(cf.period.year)
    if (list) list.push(idx)
    else yearGroups.set(cf.period.year, [idx])
  })
  const years = Array.from(yearGroups.entries()).sort(([a], [b]) => a - b)

  const rows: { label: string; getValue: (cf: MonthlyCashflow) => number }[] = [
    { label: 'OPEX',                getValue: cf => cf.opex },
    { label: 'Эксплуатация',         getValue: cf => cf.maintenance },
    { label: 'Налог на имущество',   getValue: cf => cf.propertyTax },
    { label: 'Налог на ЗУ',          getValue: cf => cf.landTax },
  ]

  function formatExpense(raw: number): { text: string; cls: string } {
    if (raw === 0) return { text: '—', cls: 'text-gray-300' }
    const v = -raw
    const abs = Math.abs(raw)
    let text: string
    if (abs >= 1_000_000) text = `${(v / 1_000_000).toFixed(1)} млн`
    else if (abs >= 1_000) text = `${Math.round(v / 1_000)} тыс`
    else text = Math.round(v).toLocaleString('ru-RU')
    return { text, cls: 'text-red-500' }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
        Расчётные расходы объекта (помесячно)
      </p>
      <p className="text-xs text-gray-400 mb-3">
        Ставки расходов редактируются на вкладке «Основное».
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th
                rowSpan={2}
                className="sticky left-0 z-20 bg-gray-50 px-4 py-2 text-left text-xs font-medium text-gray-400 min-w-[200px] border-r border-gray-200"
              >
                Статья
              </th>
              {years.map(([y, idxs]) => (
                <th
                  key={y}
                  colSpan={idxs.length}
                  className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 last:border-r-0"
                >
                  {y}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              {cashflows.map((cf, idx) => (
                <th
                  key={idx}
                  className="px-3 py-1.5 text-center text-xs font-medium text-gray-400 whitespace-nowrap min-w-[68px] border-r border-gray-100 last:border-r-0"
                >
                  {MONTHS_SHORT[cf.period.month - 1] ?? cf.period.month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const stripeBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
              return (
                <tr key={row.label} className={`${stripeBg} border-b border-gray-100`}>
                  <td className={`sticky left-0 z-10 px-4 py-2 text-left text-xs text-gray-600 whitespace-nowrap border-r border-gray-200 ${stripeBg}`}>
                    {row.label}
                  </td>
                  {cashflows.map((cf, cfIdx) => {
                    const { text, cls } = formatExpense(row.getValue(cf))
                    return (
                      <td
                        key={cfIdx}
                        className={`px-3 py-2 text-right whitespace-nowrap tabular-nums border-r border-gray-100 last:border-r-0 ${cls}`}
                      >
                        {text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Вкладка «CAPEX» (V3.7.1) ────────────────────────────────────────────────

type CapexMode = 'items' | 'reserve'

type CapexItemRow = {
  id: string
  name: string
  amount: number
  plannedDate: string
  notes: string | null
}

type CapexReserveRow = {
  id: string
  propertyId: string
  ratePerSqm: number
  startDate: string
  indexationType: IndexationType
  indexationRate: number | null
}

const cInputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const cLabelCls = 'block text-xs font-medium text-gray-600 mb-0.5'

function CapexTab({ propertyId }: { propertyId: string }) {
  const [mode, setMode] = useState<CapexMode>('items')

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-md border border-gray-200 p-0.5 bg-white">
        {([
          { id: 'items',   label: 'Разовые затраты'      },
          { id: 'reserve', label: 'Периодический резерв' },
        ] as { id: CapexMode; label: string }[]).map(opt => (
          <button
            key={opt.id}
            onClick={() => setMode(opt.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
              mode === opt.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'items'   && <CapexItemsBlock propertyId={propertyId} />}
      {mode === 'reserve' && <CapexReserveBlock propertyId={propertyId} />}
    </div>
  )
}

// ─── Режим: Разовые затраты (inline-таблица, Вариант A) ──────────────────────

type CapexItemForm = {
  name: string
  amount: string
  plannedDate: string
  notes: string
}

const emptyCapexItemForm: CapexItemForm = {
  name: '',
  amount: '',
  plannedDate: '',
  notes: '',
}

function rowToForm(row: CapexItemRow): CapexItemForm {
  return {
    name: row.name,
    amount: String(row.amount),
    plannedDate: row.plannedDate.slice(0, 10),
    notes: row.notes ?? '',
  }
}

function CapexItemsBlock({ propertyId }: { propertyId: string }) {
  const [items, setItems]               = useState<CapexItemRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState<string | null>(null)
  // editingId: 'new' для новой строки, id для редактируемой существующей, null — нет редактирования
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [form, setForm]                 = useState<CapexItemForm>(emptyCapexItemForm)
  const [saving, setSaving]             = useState(false)
  const [saveError, setSaveError]       = useState<string | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)

  function load() {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/capex?propertyId=${propertyId}`)
      .then(async res => {
        const json = await res.json() as { data?: CapexItemRow[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки')
        setItems(json.data ?? [])
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [propertyId])

  function startAdd() {
    setForm(emptyCapexItemForm)
    setEditingId('new')
    setSaveError(null)
  }

  function startEdit(row: CapexItemRow) {
    setForm(rowToForm(row))
    setEditingId(row.id)
    setSaveError(null)
  }

  function cancel() {
    setEditingId(null)
    setSaveError(null)
  }

  function setField<K extends keyof CapexItemForm>(field: K, value: CapexItemForm[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function save() {
    setSaveError(null)

    const amount = parseFloat(form.amount)
    if (!form.name.trim())            { setSaveError('Укажите наименование'); return }
    if (isNaN(amount) || amount < 0)  { setSaveError('Укажите корректную сумму'); return }
    if (!form.plannedDate)            { setSaveError('Укажите дату'); return }

    const isNew = editingId === 'new'
    const body = {
      ...(isNew ? { propertyId } : {}),
      name: form.name.trim(),
      amount,
      plannedDate: form.plannedDate,
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
    }

    setSaving(true)
    try {
      const url = isNew ? '/api/capex' : `/api/capex/${editingId}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setSaveError(json.error ?? 'Ошибка сохранения')
        return
      }
      setEditingId(null)
      load()
    } catch {
      setSaveError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: CapexItemRow) {
    if (!window.confirm(`Удалить позицию «${row.name}»?`)) return
    setDeletingId(row.id)
    try {
      const res = await fetch(`/api/capex/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        alert(json.error ?? 'Ошибка удаления')
        return
      }
      if (editingId === row.id) setEditingId(null)
      load()
    } catch {
      alert('Ошибка сети')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Разовые позиции CAPEX — конкретная сумма в конкретную дату.
        </p>
        <button
          onClick={startAdd}
          disabled={editingId === 'new'}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Добавить
        </button>
      </div>

      {loadError && <p className="text-sm text-red-500">{loadError}</p>}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 font-medium uppercase tracking-wide">
                <th className="text-left px-4 py-3">Наименование</th>
                <th className="text-left px-4 py-3 w-36">Дата</th>
                <th className="text-right px-4 py-3 w-40">Сумма, ₽</th>
                <th className="text-left px-4 py-3">Примечание</th>
                <th className="px-4 py-3 w-48 text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {editingId === 'new' && (
                <CapexItemEditRow
                  form={form}
                  setField={setField}
                  saving={saving}
                  saveError={saveError}
                  onSave={() => void save()}
                  onCancel={cancel}
                />
              )}

              {loading && (
                <tr><td colSpan={5} className="py-12 text-center text-sm text-gray-400">Загрузка…</td></tr>
              )}

              {!loading && items.length === 0 && editingId !== 'new' && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">
                    Разовых позиций CAPEX нет — нажмите «+ Добавить»
                  </td>
                </tr>
              )}

              {items.map(row => {
                const isEdit = editingId === row.id
                const isDeleting = deletingId === row.id
                if (isEdit) {
                  return (
                    <CapexItemEditRow
                      key={row.id}
                      form={form}
                      setField={setField}
                      saving={saving}
                      saveError={saveError}
                      onSave={() => void save()}
                      onCancel={cancel}
                      onDelete={() => void remove(row)}
                      isDeleting={isDeleting}
                    />
                  )
                }
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-100 transition-colors ${isDeleting ? 'opacity-40' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-4 py-3 text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(row.plannedDate)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 tabular-nums">
                      {formatRub(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(row)}
                        disabled={editingId !== null}
                        className="text-xs text-blue-600 hover:underline mr-3 disabled:opacity-30 disabled:no-underline"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => void remove(row)}
                        disabled={editingId !== null || isDeleting}
                        className="text-xs text-red-600 hover:underline disabled:opacity-30 disabled:no-underline"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CapexItemEditRow({
  form,
  setField,
  saving,
  saveError,
  onSave,
  onCancel,
  onDelete,
  isDeleting,
}: {
  form: CapexItemForm
  setField: <K extends keyof CapexItemForm>(field: K, value: CapexItemForm[K]) => void
  saving: boolean
  saveError: string | null
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  isDeleting?: boolean
}) {
  return (
    <>
      <tr className="bg-blue-50/30 border-b border-gray-100">
        <td className="px-4 py-2">
          <input
            type="text"
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            className={cInputCls}
            disabled={saving}
            placeholder="Например: ремонт кровли"
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="date"
            value={form.plannedDate}
            onChange={e => setField('plannedDate', e.target.value)}
            className={cInputCls}
            disabled={saving}
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="number"
            value={form.amount}
            onChange={e => setField('amount', e.target.value)}
            min="0"
            step="1"
            className={cInputCls + ' text-right'}
            disabled={saving}
          />
        </td>
        <td className="px-4 py-2">
          <input
            type="text"
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            className={cInputCls}
            disabled={saving}
            placeholder="Опционально"
          />
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 mr-1.5"
          >
            {saving ? '…' : 'Сохранить'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving || isDeleting}
              className="ml-1.5 rounded-md border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? '…' : 'Удалить'}
            </button>
          )}
        </td>
      </tr>
      {saveError && (
        <tr className="bg-blue-50/30 border-b border-gray-100">
          <td colSpan={5} className="px-4 pb-2 text-sm text-red-600">{saveError}</td>
        </tr>
      )}
    </>
  )
}

// ─── Режим: Периодический резерв ─────────────────────────────────────────────

type CapexReserveForm = {
  ratePerSqm: string
  startDate: string
  indexationType: IndexationType
  indexationRate: string
}

const emptyReserveForm: CapexReserveForm = {
  ratePerSqm: '',
  startDate: '',
  indexationType: 'NONE',
  indexationRate: '',
}

function reserveToForm(row: CapexReserveRow): CapexReserveForm {
  return {
    ratePerSqm: String(row.ratePerSqm),
    startDate: row.startDate.slice(0, 10),
    indexationType: row.indexationType,
    indexationRate: row.indexationRate != null ? String(+(row.indexationRate * 100).toFixed(4)) : '',
  }
}

function CapexReserveBlock({ propertyId }: { propertyId: string }) {
  const [reserve, setReserve]       = useState<CapexReserveRow | null>(null)
  const [form, setForm]             = useState<CapexReserveForm>(emptyReserveForm)
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [okMessage, setOkMessage]   = useState<string | null>(null)

  function load() {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/properties/${propertyId}/capex-reserve`)
      .then(async res => {
        const json = await res.json() as { data?: CapexReserveRow | null; error?: string }
        if (!res.ok) throw new Error(json.error ?? 'Ошибка загрузки')
        const row = json.data ?? null
        setReserve(row)
        setForm(row ? reserveToForm(row) : emptyReserveForm)
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [propertyId])

  function setField<K extends keyof CapexReserveForm>(field: K, value: CapexReserveForm[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
    setOkMessage(null)
  }

  async function save() {
    setSaveError(null)
    setOkMessage(null)

    const ratePerSqm = parseFloat(form.ratePerSqm)
    if (isNaN(ratePerSqm) || ratePerSqm < 0) { setSaveError('Укажите ставку резерва ≥ 0'); return }
    if (!form.startDate) { setSaveError('Укажите дату начала начисления'); return }

    let indexationRate: number | null = null
    if (form.indexationType === 'FIXED') {
      const r = parseFloat(form.indexationRate)
      if (isNaN(r) || r < 0) { setSaveError('Укажите ставку индексации'); return }
      indexationRate = r / 100
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/capex-reserve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratePerSqm,
          startDate: form.startDate,
          indexationType: form.indexationType,
          indexationRate,
        }),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setSaveError(json.error ?? 'Ошибка сохранения')
        return
      }
      setOkMessage('Сохранено')
      load()
    } catch {
      setSaveError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!window.confirm('Удалить периодический резерв CAPEX?')) return
    setSaving(true)
    setSaveError(null)
    setOkMessage(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/capex-reserve`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        setSaveError(json.error ?? 'Ошибка удаления')
        return
      }
      setReserve(null)
      setForm(emptyReserveForm)
    } catch {
      setSaveError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Загрузка…</div>
  }
  if (loadError) {
    return <div className="py-12 text-center text-sm text-red-500">{loadError}</div>
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl">
      <p className="text-xs text-gray-400 mb-4">
        Резерв на капитальный ремонт — начисляется ежемесячно как area × ставка / 12,
        с индексацией от даты начала начисления. Суммируется поверх разовых позиций.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={cLabelCls}>Ставка резерва, ₽/м²/год</label>
          <input
            type="number"
            value={form.ratePerSqm}
            onChange={e => setField('ratePerSqm', e.target.value)}
            min="0"
            step="1"
            className={cInputCls}
            disabled={saving}
          />
        </div>
        <div>
          <label className={cLabelCls}>Начало начисления</label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => setField('startDate', e.target.value)}
            className={cInputCls}
            disabled={saving}
          />
        </div>
        <div>
          <label className={cLabelCls}>Индексация резерва</label>
          <select
            value={form.indexationType}
            onChange={e => setField('indexationType', e.target.value as IndexationType)}
            className={cInputCls + ' bg-white'}
            disabled={saving}
          >
            <option value="NONE">Нет</option>
            <option value="FIXED">Фиксированная</option>
            <option value="CPI">ИПЦ</option>
          </select>
        </div>
        {form.indexationType === 'FIXED' && (
          <div>
            <label className={cLabelCls}>Ставка индексации, %</label>
            <input
              type="number"
              value={form.indexationRate}
              onChange={e => setField('indexationRate', e.target.value)}
              min="0"
              step="0.01"
              className={cInputCls}
              disabled={saving}
            />
          </div>
        )}
      </div>

      {saveError && <p className="text-sm text-red-600 mt-3">{saveError}</p>}
      {okMessage && <p className="text-sm text-green-600 mt-3">{okMessage}</p>}

      <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение…' : reserve ? 'Сохранить изменения' : 'Создать резерв'}
        </button>
        {reserve && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={saving}
            className="ml-auto rounded-md border border-red-200 text-red-600 px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          >
            Удалить резерв
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Placeholder для вкладок без содержания ──────────────────────────────────

function PlaceholderTab({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 py-20 text-center text-gray-400">
      <p className="text-sm">{text}</p>
    </div>
  )
}
