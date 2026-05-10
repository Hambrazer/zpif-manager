'use client'

import { useState } from 'react'

type IndexationType = 'CPI' | 'FIXED' | 'NONE'
type LeaseStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATING'

const INDEXATION_LABELS: Record<IndexationType, string> = {
  CPI: 'ИПЦ',
  FIXED: 'Фиксированная',
  NONE: 'Нет',
}

const STATUS_LABELS: Record<LeaseStatus, string> = {
  ACTIVE: 'Действующий',
  EXPIRED: 'Истёк',
  TERMINATING: 'Расторгается',
}

export type LeaseData = {
  id: string
  propertyId: string
  tenantName: string
  area: number
  baseRent: number
  indexationType: IndexationType
  indexationRate: number | null
  opexReimbursementRate: number
  opexReimbursementIndexationType: IndexationType
  opexReimbursementIndexationRate: number | null
  startDate: string
  endDate: string
  securityDeposit: number | null
  status: LeaseStatus
  renewalOption: boolean
  breakOption: boolean
  vatIncluded: boolean
}

type Props = {
  propertyId: string
  initialData?: LeaseData
  onSuccess: (lease: LeaseData) => void
  onCancel?: () => void
}

type FormState = {
  tenantName: string
  area: string
  baseRent: string
  indexationType: IndexationType
  indexationRate: string
  opexReimbursementRate: string
  opexReimbursementIndexationType: IndexationType
  opexReimbursementIndexationRate: string
  startDate: string
  endDate: string
  securityDeposit: string
  status: LeaseStatus
  renewalOption: boolean
  breakOption: boolean
  vatIncluded: boolean
}

function toFormState(data: LeaseData): FormState {
  return {
    tenantName: data.tenantName,
    area: String(data.area),
    baseRent: String(data.baseRent),
    indexationType: data.indexationType,
    indexationRate: data.indexationRate != null ? String(+(data.indexationRate * 100).toFixed(4)) : '',
    opexReimbursementRate: String(data.opexReimbursementRate),
    opexReimbursementIndexationType: data.opexReimbursementIndexationType,
    opexReimbursementIndexationRate: data.opexReimbursementIndexationRate != null
      ? String(+(data.opexReimbursementIndexationRate * 100).toFixed(4))
      : '',
    startDate: data.startDate.slice(0, 10),
    endDate: data.endDate.slice(0, 10),
    securityDeposit: data.securityDeposit != null ? String(data.securityDeposit) : '',
    status: data.status,
    renewalOption: data.renewalOption,
    breakOption: data.breakOption,
    vatIncluded: data.vatIncluded,
  }
}

const emptyState: FormState = {
  tenantName: '',
  area: '',
  baseRent: '',
  indexationType: 'CPI',
  indexationRate: '',
  opexReimbursementRate: '',
  opexReimbursementIndexationType: 'NONE',
  opexReimbursementIndexationRate: '',
  startDate: '',
  endDate: '',
  securityDeposit: '',
  status: 'ACTIVE',
  renewalOption: false,
  breakOption: false,
  vatIncluded: false,
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

export function LeaseForm({ propertyId, initialData, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initialData ? toFormState(initialData) : emptyState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initialData?.id)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const area = parseFloat(form.area)
    const baseRent = parseFloat(form.baseRent)
    const opexReimbursementRate = parseFloat(form.opexReimbursementRate)

    if (!form.tenantName.trim()) { setError('Укажите арендатора'); return }
    if (isNaN(area) || area <= 0) { setError('Укажите корректную площадь'); return }
    if (isNaN(baseRent) || baseRent <= 0) { setError('Укажите базовую ставку аренды'); return }
    if (!form.startDate || !form.endDate) { setError('Укажите даты начала и окончания договора'); return }
    if (form.endDate <= form.startDate) { setError('Дата окончания должна быть позже даты начала'); return }
    if (isNaN(opexReimbursementRate) || opexReimbursementRate < 0) {
      setError('Укажите ставку возмещения OPEX (можно 0)')
      return
    }

    let indexationRate: number | null = null
    if (form.indexationType === 'FIXED') {
      const rate = parseFloat(form.indexationRate)
      if (isNaN(rate) || rate < 0) { setError('Укажите ставку фиксированной индексации аренды'); return }
      indexationRate = rate / 100
    }

    let opexReimbursementIndexationRate: number | null = null
    if (form.opexReimbursementIndexationType === 'FIXED') {
      const rate = parseFloat(form.opexReimbursementIndexationRate)
      if (isNaN(rate) || rate < 0) { setError('Укажите ставку индексации возмещения OPEX'); return }
      opexReimbursementIndexationRate = rate / 100
    }

    const securityDeposit = form.securityDeposit !== '' ? parseFloat(form.securityDeposit) : null
    if (securityDeposit !== null && isNaN(securityDeposit)) {
      setError('Обеспечительный платёж указан некорректно')
      return
    }

    const body = {
      propertyId,
      tenantName: form.tenantName.trim(),
      area,
      baseRent,
      indexationType: form.indexationType,
      indexationRate,
      opexReimbursementRate,
      opexReimbursementIndexationType: form.opexReimbursementIndexationType,
      opexReimbursementIndexationRate,
      startDate: form.startDate,
      endDate: form.endDate,
      securityDeposit,
      status: form.status,
      renewalOption: form.renewalOption,
      breakOption: form.breakOption,
      vatIncluded: form.vatIncluded,
    }

    setLoading(true)
    try {
      const url = isEdit ? `/api/leases/${initialData!.id}` : '/api/leases'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json() as { data?: LeaseData; error?: string }

      if (!res.ok) {
        setError(json.error ?? 'Ошибка сервера')
        return
      }

      onSuccess(json.data!)
    } catch {
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Арендатор и площадь */}
      <div className="space-y-3">
        <div>
          <label className={labelCls}>
            Арендатор <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.tenantName}
            onChange={e => set('tenantName', e.target.value)}
            placeholder="ООО «ТехноПарк»"
            className={inputCls}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Площадь, м² <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.area}
              onChange={e => set('area', e.target.value)}
              placeholder="3500"
              min="0"
              step="0.1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Статус <span className="text-red-500">*</span>
            </label>
            <select
              value={form.status}
              onChange={e => set('status', e.target.value as LeaseStatus)}
              className={inputCls + ' bg-white'}
              disabled={loading}
            >
              {(Object.keys(STATUS_LABELS) as LeaseStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Даты */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Дата начала <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
            className={inputCls}
            disabled={loading}
          />
        </div>
        <div>
          <label className={labelCls}>
            Дата окончания <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => set('endDate', e.target.value)}
            className={inputCls}
            disabled={loading}
          />
        </div>
      </div>

      {/* Аренда */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Аренда</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Базовая ставка, ₽/м²/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.baseRent}
              onChange={e => set('baseRent', e.target.value)}
              placeholder="28000"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Тип индексации <span className="text-red-500">*</span>
            </label>
            <select
              value={form.indexationType}
              onChange={e => set('indexationType', e.target.value as IndexationType)}
              className={inputCls + ' bg-white'}
              disabled={loading}
            >
              {(Object.keys(INDEXATION_LABELS) as IndexationType[]).map(t => (
                <option key={t} value={t}>{INDEXATION_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {form.indexationType === 'FIXED' && (
          <div>
            <label className={labelCls}>
              Ставка индексации аренды, %/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.indexationRate}
              onChange={e => set('indexationRate', e.target.value)}
              placeholder="5"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        )}
      </div>

      {/* Возмещение OPEX */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Возмещение OPEX</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Ставка возмещения, ₽/м²/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.opexReimbursementRate}
              onChange={e => set('opexReimbursementRate', e.target.value)}
              placeholder="2000"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Тип индексации возмещения <span className="text-red-500">*</span>
            </label>
            <select
              value={form.opexReimbursementIndexationType}
              onChange={e => set('opexReimbursementIndexationType', e.target.value as IndexationType)}
              className={inputCls + ' bg-white'}
              disabled={loading}
            >
              {(Object.keys(INDEXATION_LABELS) as IndexationType[]).map(t => (
                <option key={t} value={t}>{INDEXATION_LABELS[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {form.opexReimbursementIndexationType === 'FIXED' && (
          <div>
            <label className={labelCls}>
              Ставка индексации возмещения, %/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.opexReimbursementIndexationRate}
              onChange={e => set('opexReimbursementIndexationRate', e.target.value)}
              placeholder="5"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        )}
      </div>

      {/* Прочее */}
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Обеспечительный платёж, ₽</label>
          <input
            type="number"
            value={form.securityDeposit}
            onChange={e => set('securityDeposit', e.target.value)}
            placeholder="8 166 667"
            min="0"
            step="1"
            className={inputCls}
            disabled={loading}
          />
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.renewalOption}
              onChange={e => set('renewalOption', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={loading}
            />
            Опцион на продление
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.breakOption}
              onChange={e => set('breakOption', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={loading}
            />
            Break option
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.vatIncluded}
              onChange={e => set('vatIncluded', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={loading}
            />
            НДС включён
          </label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить договор'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}
