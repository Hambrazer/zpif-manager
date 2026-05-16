'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FundStatus, DistributionPeriodicity } from '@/lib/types'

// V4.6.2: inline-редактирование параметров фонда.

export type FundBasicData = {
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
  status: FundStatus
}

type Props = { fund: FundBasicData }

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
}

const RADICAL_FIELDS = ['totalEmission', 'nominalUnitPrice', 'distributionPeriodicity', 'startDate', 'endDate'] as const

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
const sectionTitleCls = 'text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3'

function toDateInput(isoStr: string): string {
  return isoStr.slice(0, 10)
}

function toFormState(d: FundBasicData): FormState {
  return {
    name: d.name,
    registrationNumber: d.registrationNumber ?? '',
    startDate: toDateInput(d.startDate),
    endDate: toDateInput(d.endDate),
    totalEmission: String(d.totalEmission),
    nominalUnitPrice: String(d.nominalUnitPrice),
    managementFeeRate: String(+(d.managementFeeRate * 100).toFixed(4)),
    fundExpensesRate: String(+(d.fundExpensesRate * 100).toFixed(4)),
    upfrontFeeRate: String(+(d.upfrontFeeRate * 100).toFixed(4)),
    successFeeOperational: String(+(d.successFeeOperational * 100).toFixed(4)),
    successFeeExit: String(+(d.successFeeExit * 100).toFixed(4)),
    distributionPeriodicity: d.distributionPeriodicity,
  }
}

function hasRadicalChange(initial: FormState, current: FormState): boolean {
  return RADICAL_FIELDS.some(f => initial[f] !== current[f])
}

export function FundBasicTab({ fund }: Props) {
  const router = useRouter()
  const initial = toFormState(fund)
  const [form, setForm] = useState<FormState>(initial)
  const [status, setStatus] = useState<FundStatus>(fund.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const totalEmissionNum = parseFloat(form.totalEmission)
  const nominalUnitPriceNum = parseFloat(form.nominalUnitPrice)
  const computedTotalUnits =
    !isNaN(totalEmissionNum) && !isNaN(nominalUnitPriceNum) && nominalUnitPriceNum > 0
      ? Math.round(totalEmissionNum / nominalUnitPriceNum)
      : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (hasRadicalChange(initial, form)) {
      setShowConfirm(true)
      return
    }
    void doSave()
  }

  async function doSave() {
    setShowConfirm(false)
    setError(null)

    const totalEmission = parseFloat(form.totalEmission)
    const nominalUnitPrice = parseFloat(form.nominalUnitPrice)
    const managementFeeRate = parseFloat(form.managementFeeRate)
    const fundExpensesRate = parseFloat(form.fundExpensesRate)
    const upfrontFeeRate = parseFloat(form.upfrontFeeRate)
    const successFeeOperational = parseFloat(form.successFeeOperational)
    const successFeeExit = parseFloat(form.successFeeExit)

    if (!form.name.trim()) { setError('Название не может быть пустым'); return }
    if (!form.startDate || !form.endDate) { setError('Укажите даты'); return }
    if (form.endDate <= form.startDate) { setError('Дата закрытия должна быть позже даты создания'); return }
    if (isNaN(totalEmission) || totalEmission <= 0) { setError('Некорректный объём эмиссии'); return }
    if (isNaN(nominalUnitPrice) || nominalUnitPrice <= 0) { setError('Некорректная номинальная стоимость'); return }
    if ([managementFeeRate, fundExpensesRate, upfrontFeeRate, successFeeOperational, successFeeExit].some(v => isNaN(v) || v < 0)) {
      setError('Все ставки должны быть заполнены и неотрицательны')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/funds/${fund.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          registrationNumber: form.registrationNumber.trim() || null,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
          totalEmission,
          nominalUnitPrice,
          totalUnits: totalEmission / nominalUnitPrice,
          managementFeeRate: managementFeeRate / 100,
          fundExpensesRate: fundExpensesRate / 100,
          upfrontFeeRate: upfrontFeeRate / 100,
          successFeeOperational: successFeeOperational / 100,
          successFeeExit: successFeeExit / 100,
          distributionPeriodicity: form.distributionPeriodicity,
        }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setError(json.error ?? 'Ошибка сохранения'); return }
      router.refresh()
    } catch {
      setError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(next: FundStatus) {
    if (next === status) return
    setStatusError(null)
    try {
      const res = await fetch(`/api/funds/${fund.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) { setStatusError(json.error ?? 'Не удалось сменить статус'); return }
      setStatus(next)
      router.refresh()
    } catch {
      setStatusError('Ошибка сети')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Общее */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className={sectionTitleCls}>Общее</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Название фонда</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Регистрационный номер</label>
            <input
              type="text"
              value={form.registrationNumber}
              onChange={e => set('registrationNumber', e.target.value)}
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Статус</label>
            <select
              value={status}
              onChange={e => void handleStatusChange(e.target.value as FundStatus)}
              className={inputCls}
              disabled={saving}
            >
              <option value="ACTIVE">Активный</option>
              <option value="CLOSED">Закрыт</option>
              <option value="ARCHIVED">Архив</option>
            </select>
            {statusError && <p className="mt-1 text-xs text-red-600">{statusError}</p>}
          </div>
          <div>
            <label className={labelCls}>Дата создания</label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Дата закрытия</label>
            <input
              type="date"
              value={form.endDate}
              onChange={e => set('endDate', e.target.value)}
              className={inputCls}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* Эмиссия */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className={sectionTitleCls}>Эмиссия</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Объём эмиссии, ₽</label>
            <input
              type="number"
              value={form.totalEmission}
              onChange={e => set('totalEmission', e.target.value)}
              min="0"
              step="1"
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Номинал пая, ₽</label>
            <input
              type="number"
              value={form.nominalUnitPrice}
              onChange={e => set('nominalUnitPrice', e.target.value)}
              min="0"
              step="0.01"
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Количество паёв (расчётное)</label>
            <input
              type="text"
              value={computedTotalUnits !== null ? computedTotalUnits.toLocaleString('ru-RU') : '—'}
              readOnly
              className={`${inputCls} cursor-not-allowed`}
            />
          </div>
        </div>
      </section>

      {/* Комиссии */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className={sectionTitleCls}>Комиссии</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Management fee, % от СЧА/год</label>
            <input
              type="number"
              value={form.managementFeeRate}
              onChange={e => set('managementFeeRate', e.target.value)}
              min="0"
              step="0.01"
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Fund expenses, % от СЧА/год</label>
            <input
              type="number"
              value={form.fundExpensesRate}
              onChange={e => set('fundExpensesRate', e.target.value)}
              min="0"
              step="0.01"
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Upfront fee, %</label>
            <input
              type="number"
              value={form.upfrontFeeRate}
              onChange={e => set('upfrontFeeRate', e.target.value)}
              min="0"
              step="0.01"
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Success fee операционный, %</label>
            <input
              type="number"
              value={form.successFeeOperational}
              onChange={e => set('successFeeOperational', e.target.value)}
              min="0"
              step="0.01"
              className={inputCls}
              disabled={saving}
            />
          </div>
          <div>
            <label className={labelCls}>Success fee выход, %</label>
            <input
              type="number"
              value={form.successFeeExit}
              onChange={e => set('successFeeExit', e.target.value)}
              min="0"
              step="0.01"
              className={inputCls}
              disabled={saving}
            />
          </div>
        </div>
      </section>

      {/* Выплаты */}
      <section className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h3 className={sectionTitleCls}>Выплаты</h3>
        <div>
          <label className={labelCls}>Периодичность выплат пайщикам</label>
          <select
            value={form.distributionPeriodicity}
            onChange={e => set('distributionPeriodicity', e.target.value as DistributionPeriodicity)}
            className={inputCls}
            disabled={saving}
          >
            <option value="MONTHLY">Ежемесячно</option>
            <option value="QUARTERLY">Ежеквартально</option>
            <option value="ANNUAL">Ежегодно</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение…' : 'Сохранить изменения'}
        </button>
      </div>

      {/* Модалка подтверждения для радикальных полей (V4.6.2) */}
      {showConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowConfirm(false) }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">Подтвердите изменение</h3>
            <p className="text-sm text-gray-600">
              Это изменение пересчитает всю модель фонда (эмиссию, цену пая,
              периодичность выплат или сроки). Продолжить?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void doSave()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Продолжить
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
