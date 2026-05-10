'use client'

import { useState } from 'react'

type DistributionPeriodicity = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL'

export type FundData = {
  id: string
  name: string
  registrationNumber: string | null
  startDate: string
  endDate: string
  totalEmission: number
  nominalUnitPrice: number
  totalUnits: number
  managementFeeRate: number
  fundExpensesRate: number
  upfrontFeeRate: number
  successFeeOperational: number
  successFeeExit: number
  distributionPeriodicity: DistributionPeriodicity
  hasDebt: boolean
}

type Props = {
  initialData?: FundData
  onSuccess: (fund: FundData) => void
  onCancel?: () => void
}

type FormState = {
  name: string
  registrationNumber: string
  startDate: string
  endDate: string
  totalEmission: string
  nominalUnitPrice: string
  managementFeeRate: string
  fundExpensesRate: string
  upfrontFeeRate: string
  successFeeOperational: string
  successFeeExit: string
  distributionPeriodicity: DistributionPeriodicity
  hasDebt: boolean
}

function toDateInput(isoStr: string): string {
  return isoStr.slice(0, 10)
}

function toFormState(data: FundData): FormState {
  return {
    name: data.name,
    registrationNumber: data.registrationNumber ?? '',
    startDate: toDateInput(data.startDate),
    endDate: toDateInput(data.endDate),
    totalEmission: String(data.totalEmission),
    nominalUnitPrice: String(data.nominalUnitPrice),
    managementFeeRate: String(+(data.managementFeeRate * 100).toFixed(4)),
    fundExpensesRate: String(+(data.fundExpensesRate * 100).toFixed(4)),
    upfrontFeeRate: String(+(data.upfrontFeeRate * 100).toFixed(4)),
    successFeeOperational: String(+(data.successFeeOperational * 100).toFixed(4)),
    successFeeExit: String(+(data.successFeeExit * 100).toFixed(4)),
    distributionPeriodicity: data.distributionPeriodicity,
    hasDebt: data.hasDebt,
  }
}

const emptyState: FormState = {
  name: '',
  registrationNumber: '',
  startDate: '',
  endDate: '',
  totalEmission: '',
  nominalUnitPrice: '',
  managementFeeRate: '',
  fundExpensesRate: '',
  upfrontFeeRate: '',
  successFeeOperational: '',
  successFeeExit: '',
  distributionPeriodicity: 'QUARTERLY',
  hasDebt: false,
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

export function FundForm({ initialData, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initialData ? toFormState(initialData) : emptyState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initialData?.id)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const totalEmissionNum = parseFloat(form.totalEmission)
  const nominalUnitPriceNum = parseFloat(form.nominalUnitPrice)
  const computedTotalUnits =
    !isNaN(totalEmissionNum) && !isNaN(nominalUnitPriceNum) && nominalUnitPriceNum > 0
      ? Math.round(totalEmissionNum / nominalUnitPriceNum)
      : null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const totalEmission = parseFloat(form.totalEmission)
    const nominalUnitPrice = parseFloat(form.nominalUnitPrice)
    const managementFeeRate = parseFloat(form.managementFeeRate)
    const fundExpensesRate = parseFloat(form.fundExpensesRate)
    const upfrontFeeRate = parseFloat(form.upfrontFeeRate)
    const successFeeOperational = parseFloat(form.successFeeOperational)
    const successFeeExit = parseFloat(form.successFeeExit)

    if (!form.name.trim()) {
      setError('Укажите название фонда')
      return
    }
    if (!form.startDate || !form.endDate) {
      setError('Укажите даты создания и закрытия фонда')
      return
    }
    if (form.endDate <= form.startDate) {
      setError('Дата закрытия должна быть позже даты создания')
      return
    }
    if (isNaN(totalEmission) || totalEmission <= 0) {
      setError('Укажите корректный объём эмиссии')
      return
    }
    if (isNaN(nominalUnitPrice) || nominalUnitPrice <= 0) {
      setError('Укажите корректную номинальную стоимость пая')
      return
    }
    if (
      isNaN(managementFeeRate) || managementFeeRate < 0 ||
      isNaN(fundExpensesRate) || fundExpensesRate < 0 ||
      isNaN(upfrontFeeRate) || upfrontFeeRate < 0 ||
      isNaN(successFeeOperational) || successFeeOperational < 0 ||
      isNaN(successFeeExit) || successFeeExit < 0
    ) {
      setError('Все ставки комиссий должны быть заполнены и не отрицательными')
      return
    }

    const totalUnits = totalEmission / nominalUnitPrice

    const body = {
      name: form.name.trim(),
      registrationNumber: form.registrationNumber.trim() || null,
      startDate: new Date(form.startDate).toISOString(),
      endDate: new Date(form.endDate).toISOString(),
      totalEmission,
      nominalUnitPrice,
      totalUnits,
      managementFeeRate: managementFeeRate / 100,
      fundExpensesRate: fundExpensesRate / 100,
      upfrontFeeRate: upfrontFeeRate / 100,
      successFeeOperational: successFeeOperational / 100,
      successFeeExit: successFeeExit / 100,
      distributionPeriodicity: form.distributionPeriodicity,
      hasDebt: form.hasDebt,
    }

    setLoading(true)
    try {
      const url = isEdit ? `/api/funds/${initialData!.id}` : '/api/funds'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json() as { data?: FundData; error?: string }

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

      {/* Основная информация */}
      <div className="space-y-3">
        <div>
          <label className={labelCls}>
            Название фонда <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="ЗПИФ Недвижимость Москва"
            className={inputCls}
            disabled={loading}
          />
        </div>

        <div>
          <label className={labelCls}>Регистрационный номер</label>
          <input
            type="text"
            value={form.registrationNumber}
            onChange={e => set('registrationNumber', e.target.value)}
            placeholder="0123-75409054"
            className={inputCls}
            disabled={loading}
          />
        </div>
      </div>

      {/* Сроки */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            Дата создания <span className="text-red-500">*</span>
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
            Дата закрытия <span className="text-red-500">*</span>
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

      {/* Эмиссия */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Объём эмиссии, ₽ <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.totalEmission}
              onChange={e => set('totalEmission', e.target.value)}
              placeholder="1000000000"
              min="0"
              step="1"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Номинал пая, ₽ <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.nominalUnitPrice}
              onChange={e => set('nominalUnitPrice', e.target.value)}
              placeholder="100000"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>
        {computedTotalUnits !== null && (
          <p className="text-xs text-gray-500">
            Количество паёв (расчётное): <span className="font-medium text-gray-700">{computedTotalUnits.toLocaleString('ru-RU')}</span>
          </p>
        )}
      </div>

      {/* Комиссии */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Комиссии</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Management fee, % от СЧА/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.managementFeeRate}
              onChange={e => set('managementFeeRate', e.target.value)}
              placeholder="1.5"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Fund expenses, % от СЧА/год <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.fundExpensesRate}
              onChange={e => set('fundExpensesRate', e.target.value)}
              placeholder="0.5"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Upfront fee, % <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.upfrontFeeRate}
            onChange={e => set('upfrontFeeRate', e.target.value)}
            placeholder="1.5"
            min="0"
            step="0.01"
            className={inputCls}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>
              Success fee операционный, % от выплат <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.successFeeOperational}
              onChange={e => set('successFeeOperational', e.target.value)}
              placeholder="15"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
          <div>
            <label className={labelCls}>
              Success fee exit, % от прироста СЧА <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={form.successFeeExit}
              onChange={e => set('successFeeExit', e.target.value)}
              placeholder="20"
              min="0"
              step="0.01"
              className={inputCls}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* Прочие параметры */}
      <div className="grid grid-cols-2 gap-3 items-end">
        <div>
          <label className={labelCls}>
            Периодичность выплат <span className="text-red-500">*</span>
          </label>
          <select
            value={form.distributionPeriodicity}
            onChange={e => set('distributionPeriodicity', e.target.value as DistributionPeriodicity)}
            className={inputCls}
            disabled={loading}
          >
            <option value="MONTHLY">Ежемесячно</option>
            <option value="QUARTERLY">Ежеквартально</option>
            <option value="ANNUAL">Ежегодно</option>
          </select>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <input
            id="hasDebt"
            type="checkbox"
            checked={form.hasDebt}
            onChange={e => set('hasDebt', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            disabled={loading}
          />
          <label htmlFor="hasDebt" className="text-sm text-gray-700">
            Долговое финансирование
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
          {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Создать фонд'}
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
