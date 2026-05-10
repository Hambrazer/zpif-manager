'use client'

import { useState } from 'react'

type AmortizationType = 'ANNUITY' | 'BULLET' | 'LINEAR'

const AMORTIZATION_LABELS: Record<AmortizationType, string> = {
  ANNUITY: 'Аннуитет',
  BULLET: 'Пуля (погашение в конце)',
  LINEAR: 'Линейное',
}

export type DebtData = {
  id: string
  fundId: string
  lenderName: string
  principalAmount: number
  interestRate: number
  startDate: string
  endDate: string
  amortizationType: AmortizationType
}

type Props = {
  fundId: string
  initialData?: DebtData
  onSuccess: (debt: DebtData) => void
  onCancel?: () => void
}

type FormState = {
  lenderName: string
  principalAmount: string
  interestRate: string
  startDate: string
  endDate: string
  amortizationType: AmortizationType
}

function toFormState(data: DebtData): FormState {
  return {
    lenderName: data.lenderName,
    principalAmount: String(data.principalAmount),
    interestRate: String(+(data.interestRate * 100).toFixed(4)),
    startDate: data.startDate.slice(0, 10),
    endDate: data.endDate.slice(0, 10),
    amortizationType: data.amortizationType,
  }
}

const emptyState: FormState = {
  lenderName: '',
  principalAmount: '',
  interestRate: '',
  startDate: '',
  endDate: '',
  amortizationType: 'ANNUITY',
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50'
const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

export function DebtForm({ fundId, initialData, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initialData ? toFormState(initialData) : emptyState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initialData?.id)

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const principalAmount = parseFloat(form.principalAmount)
    const interestRate = parseFloat(form.interestRate)

    if (!form.lenderName.trim()) { setError('Укажите наименование кредитора'); return }
    if (isNaN(principalAmount) || principalAmount <= 0) { setError('Укажите корректную сумму долга'); return }
    if (isNaN(interestRate) || interestRate <= 0) { setError('Укажите процентную ставку'); return }
    if (!form.startDate || !form.endDate) { setError('Укажите даты выдачи и погашения'); return }
    if (form.endDate <= form.startDate) { setError('Дата погашения должна быть позже даты выдачи'); return }

    const body = {
      fundId,
      lenderName: form.lenderName.trim(),
      principalAmount,
      interestRate: interestRate / 100,
      startDate: form.startDate,
      endDate: form.endDate,
      amortizationType: form.amortizationType,
    }

    setLoading(true)
    try {
      const url = isEdit ? `/api/debts/fund/${initialData!.id}` : '/api/debts/fund'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json() as { data?: DebtData; error?: string }

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>
          Кредитор <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.lenderName}
          onChange={e => set('lenderName', e.target.value)}
          placeholder="Сбербанк"
          className={inputCls}
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>
            Сумма долга, ₽ <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.principalAmount}
            onChange={e => set('principalAmount', e.target.value)}
            placeholder="500000000"
            min="0"
            step="1"
            className={inputCls}
            disabled={loading}
          />
        </div>

        <div>
          <label className={labelCls}>
            Процентная ставка, % годовых <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.interestRate}
            onChange={e => set('interestRate', e.target.value)}
            placeholder="14"
            min="0"
            step="0.01"
            className={inputCls}
            disabled={loading}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>
            Дата выдачи <span className="text-red-500">*</span>
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
            Дата погашения <span className="text-red-500">*</span>
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

      <div>
        <label className={labelCls}>
          Тип амортизации <span className="text-red-500">*</span>
        </label>
        <select
          value={form.amortizationType}
          onChange={e => set('amortizationType', e.target.value as AmortizationType)}
          className={inputCls + ' bg-white'}
          disabled={loading}
        >
          {(Object.keys(AMORTIZATION_LABELS) as AmortizationType[]).map(t => (
            <option key={t} value={t}>{AMORTIZATION_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить долг'}
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
