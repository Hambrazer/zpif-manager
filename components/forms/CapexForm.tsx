'use client'

import { useState } from 'react'

type CapexData = {
  id: string
  propertyId: string
  name: string
  amount: number
  plannedDate: string
}

type Props = {
  propertyId: string
  initialData?: CapexData
  onSuccess: (item: CapexData) => void
  onCancel?: () => void
}

type FormState = {
  name: string
  amount: string
  plannedDate: string
}

function toFormState(data: CapexData): FormState {
  return {
    name: data.name,
    amount: String(data.amount),
    plannedDate: data.plannedDate.slice(0, 10),
  }
}

const emptyState: FormState = { name: '', amount: '', plannedDate: '' }

export function CapexForm({ propertyId, initialData, onSuccess, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initialData ? toFormState(initialData) : emptyState
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initialData?.id)

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amount = parseFloat(form.amount)

    if (!form.name.trim() || isNaN(amount) || amount <= 0 || !form.plannedDate) {
      setError('Заполните все обязательные поля корректными значениями')
      return
    }

    const body = {
      propertyId,
      name: form.name.trim(),
      amount,
      plannedDate: form.plannedDate,
    }

    setLoading(true)
    try {
      const url = isEdit ? `/api/capex/${initialData!.id}` : '/api/capex'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json() as { data?: CapexData; error?: string }

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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Наименование затраты <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Замена лифтового оборудования"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Сумма, ₽ <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            placeholder="15000000"
            min="0"
            step="1"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Плановая дата <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.plannedDate}
            onChange={e => set('plannedDate', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
        </div>
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
          {loading ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить затрату'}
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
